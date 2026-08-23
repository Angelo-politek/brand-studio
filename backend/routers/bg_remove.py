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
"""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter()

DEFAULT_MODEL = "isnet-general-use"
ALLOWED_MODELS = {"isnet-general-use", "u2net_human_seg"}

# Lazily created and cached per model name, so importing this module (and
# /health) never blocks on the heavy ONNX session load.
_sessions: dict = {}


def _get_session(model: str):
    if model not in _sessions:
        from rembg import new_session

        _sessions[model] = new_session(model)
    return _sessions[model]


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

    def _run(use_alpha_matting: bool) -> bytes:
        from rembg import remove

        return remove(
            data,
            session=_get_session(model),
            # Morphological mask cleanup: fills pinholes and smooths ragged
            # edges at negligible cost — always on.
            post_process_mask=True,
            # Alpha matting (pymatting) refines soft edges; noticeably slower.
            alpha_matting=use_alpha_matting,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )

    try:
        out = _run(alpha_matting)
    except ImportError as exc:
        # Defense in depth: alpha matting depends on pymatting, which the
        # sidecar build must ship for the base remove() path anyway (see
        # module docstring). If it's ever missing, degrade gracefully to
        # the standard mask instead of failing the whole request.
        if not alpha_matting:
            raise HTTPException(status_code=500, detail=f"background removal failed: {exc}")
        try:
            out = _run(False)
        except Exception as fallback_exc:  # noqa: BLE001 - surface a clean error to the client
            raise HTTPException(
                status_code=500, detail=f"background removal failed: {fallback_exc}"
            )
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"background removal failed: {exc}")
    return Response(content=out, media_type="image/png")
