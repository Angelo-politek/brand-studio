"""One-click background removal via rembg (ONNX Runtime).

Default model: isnet-general-use (much better than the legacy u2net on
products/objects). Optional per-request:
  - model=u2net_human_seg   → tuned for people/portraits
  - alpha_matting=true      → soft edges (hair, glass); slower

Models are resolved from U2NET_HOME (set by the Electron sidecar manager to
backend/models). They must be pre-fetched there — the packaged app is offline.

Note: rembg unconditionally imports pymatting/scipy/scikit-image at module
load (used even for the default mask post-processing, not just alpha
matting), so those packages must stay in the sidecar build — see
backend/sidecar.spec. The try/except below is defense in depth in case a
future rembg version makes alpha matting's pymatting import lazy/optional.

Edge quality — why the default path re-feathers the mask:
rembg's own `post_process_mask=True` (rembg.bg.post_process) does a
morphological opening (kills pinholes/ragged specks — good) but then
re-thresholds the result with `np.where(mask < 127, 0, 255)`, which throws
away every soft/antialiased alpha value the network produced and leaves a
100% hard-binary (0-or-255) edge — visible as jagged "staircase" pixels on
any curved or diagonal silhouette, and the actual cause of the reported
"aloni"/pixelated-edge quality issue (see backend/models/README.md and the
comparison script referenced in that investigation for empirical numbers).
`_feather_mask` below reproduces the same opening cleanup but restores a
smooth edge afterwards, instead of rembg's hard re-threshold. It costs
nothing extra at runtime (same scipy/skimage already loaded for rembg's own
post-process and alpha matting) and is always applied on the default
(non-alpha-matting) path — there is no request-level toggle for it, matching
how post_process_mask was always-on before.
"""

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage.morphology import disk, opening

router = APIRouter()

DEFAULT_MODEL = "isnet-general-use"
ALLOWED_MODELS = {"isnet-general-use", "u2net_human_seg"}

_OPENING_KERNEL = disk(1)


def _feather_mask(mask: Image.Image) -> Image.Image:
    """Morphological opening (pinhole/speck cleanup, same as rembg's
    post_process) followed by a light Gaussian feather instead of a hard
    0/255 re-threshold — keeps the mask's edge antialiased. See the module
    docstring for why this replaces rembg's default post_process_mask path.
    """
    arr = np.array(mask)
    binary = opening(arr > 127, _OPENING_KERNEL)
    feathered = gaussian_filter(binary.astype(np.float64) * 255, sigma=1.2)
    return Image.fromarray(np.clip(feathered, 0, 255).astype(np.uint8), mode="L")


# Lazily created and cached per model name, so importing this module (and
# /health) never blocks on the heavy ONNX session load.
_sessions: dict = {}


def _get_session(model: str):
    if model not in _sessions:
        from rembg import new_session

        _sessions[model] = new_session(model)
    return _sessions[model]


def _run_feathered(data: bytes, model: str) -> bytes:
    """Default path: predict the raw mask ourselves and composite with a
    feathered edge (see _feather_mask), instead of rembg's hard-threshold
    post_process_mask. Mirrors rembg.bg.remove()'s own naive_cutout so output
    bytes stay a standard RGBA PNG."""
    import io

    from PIL.ImageOps import exif_transpose

    img = Image.open(io.BytesIO(data))
    img = exif_transpose(img)
    session = _get_session(model)
    masks = session.predict(img)
    mask = _feather_mask(masks[0])
    empty = Image.new("RGBA", img.size, 0)
    cutout = Image.composite(img.convert("RGBA"), empty, mask)
    buf = io.BytesIO()
    cutout.save(buf, "PNG")
    return buf.getvalue()


def _run_alpha_matting(data: bytes, model: str) -> bytes:
    """Alpha matting path: delegates to rembg's own pipeline (pymatting-based
    trimap refinement), unchanged from before. Slower; opt-in via the
    softEdges/alpha_matting flag."""
    from rembg import remove

    return remove(
        data,
        session=_get_session(model),
        post_process_mask=True,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )


@router.post("/bg-remove")
async def bg_remove(
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    alpha_matting: bool = Form(False),
) -> Response:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"unknown model: {model}")

    try:
        if alpha_matting:
            try:
                out = _run_alpha_matting(data, model)
            except ImportError as exc:
                # Defense in depth: alpha matting depends on pymatting, which
                # the sidecar build must ship anyway (see module docstring).
                # If it's ever missing, degrade to the feathered default
                # instead of failing the whole request.
                try:
                    out = _run_feathered(data, model)
                except Exception as fallback_exc:  # noqa: BLE001
                    raise HTTPException(
                        status_code=500,
                        detail=f"background removal failed: {fallback_exc}",
                    ) from exc
        else:
            out = _run_feathered(data, model)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"background removal failed: {exc}")
    return Response(content=out, media_type="image/png")
