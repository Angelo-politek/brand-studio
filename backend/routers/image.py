"""Image processing: filters/resize (Pillow) and palette extraction (OpenCV KMeans)."""

import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

router = APIRouter()


@router.post("/image/process")
async def process(
    file: UploadFile = File(...),
    brightness: float = Form(1.0),
    contrast: float = Form(1.0),
    saturation: float = Form(1.0),
    sharpness: float = Form(1.0),
    blur: float = Form(0.0),
    grayscale: bool = Form(False),
    width: int = Form(0),
    height: int = Form(0),
    fmt: str = Form("png"),
) -> Response:
    try:
        img = Image.open(io.BytesIO(await file.read())).convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}")

    if grayscale:
        img = img.convert("L").convert("RGBA")
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if saturation != 1.0:
        img = ImageEnhance.Color(img).enhance(saturation)
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(sharpness)
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if width > 0 and height > 0:
        img = img.resize((width, height), Image.LANCZOS)

    buf = io.BytesIO()
    if fmt.lower() in ("jpg", "jpeg"):
        img.convert("RGB").save(buf, format="JPEG", quality=92)
        media = "image/jpeg"
    elif fmt.lower() == "webp":
        img.save(buf, format="WEBP", quality=92)
        media = "image/webp"
    else:
        img.save(buf, format="PNG")
        media = "image/png"
    return Response(content=buf.getvalue(), media_type=media)


@router.post("/image/palette")
async def palette(file: UploadFile = File(...), k: int = Form(6)) -> dict:
    """Extract a dominant-colour palette via KMeans (for brand colour tools)."""
    import cv2
    import numpy as np

    raw = np.frombuffer(await file.read(), np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="invalid image")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pixels = img.reshape(-1, 3).astype(np.float32)
    if pixels.shape[0] > 20000:
        idx = np.random.choice(pixels.shape[0], 20000, replace=False)
        pixels = pixels[idx]

    k = max(1, min(k, 12))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    total = counts.sum() or 1
    order = np.argsort(-counts)

    colors = []
    for i in order:
        r, g, b = (int(c) for c in centers[i])
        colors.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "weight": float(counts[i] / total)})
    return {"colors": colors}


@router.post("/image/tint")
async def tint(
    file: UploadFile = File(...),
    color: str = Form(...),
    intensity: float = Form(0.5),
    mode: str = Form("multiply"),
) -> Response:
    """Blend a flat color over an image at the given intensity (0–1)."""
    try:
        img = Image.open(io.BytesIO(await file.read())).convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}")

    hex_c = color.strip().lstrip("#")
    r, g, b = int(hex_c[0:2], 16), int(hex_c[2:4], 16), int(hex_c[4:6], 16)
    clamp = max(0.0, min(1.0, intensity))
    alpha = int(clamp * 255)

    overlay = Image.new("RGBA", img.size, (r, g, b, alpha))

    if mode == "multiply":
        base_rgb = img.convert("RGB")
        ov_rgb = overlay.convert("RGB")
        blended = ImageChops.multiply(base_rgb, ov_rgb).convert("RGBA")
        # Preserve original alpha.
        _, _, _, orig_a = img.split()
        blended.putalpha(orig_a)
        out = Image.alpha_composite(img, Image.new("RGBA", img.size, (0, 0, 0, 0)))
        out = blended
    else:
        # Default: alpha composite overlay on top.
        out = Image.alpha_composite(img, overlay)

    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


def _hex_to_rgb(h: str):
    h = h.strip().lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


@router.post("/image/recolor")
async def recolor(file: UploadFile = File(...), colors: str = Form(...), k: int = Form(0)) -> Response:
    """Remap an image's colours onto the brand palette (KMeans + nearest in Lab)."""
    import cv2
    import numpy as np

    raw = np.frombuffer(await file.read(), np.uint8)
    img = cv2.imdecode(raw, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(status_code=400, detail="invalid image")

    alpha = None
    if img.ndim == 3 and img.shape[2] == 4:
        alpha = img[:, :, 3]
        img = img[:, :, :3]
    elif img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]

    palette = [_hex_to_rgb(c) for c in colors.split(",") if c.strip()]
    if not palette:
        raise HTTPException(status_code=400, detail="no palette colours")
    palette_arr = np.array(palette, np.float32)

    flat = rgb.reshape(-1, 3)
    # Only cluster/recolor OPAQUE pixels — a transparent (background-removed)
    # area must stay untouched, and its arbitrary RGB values must not pollute
    # the KMeans clusters (which used to bleed the removed background's color).
    if alpha is not None:
        opaque_mask = alpha.reshape(-1) > 8
    else:
        opaque_mask = np.ones(flat.shape[0], dtype=bool)

    z = flat[opaque_mask].astype(np.float32)
    if z.shape[0] < 2:
        # Nothing opaque to recolor — return the input unchanged.
        ok, buf = cv2.imencode(".png", cv2.imdecode(raw, cv2.IMREAD_UNCHANGED))
        return Response(content=buf.tobytes(), media_type="image/png")

    kk = k if k > 0 else max(2, min(len(palette) * 2, 8))
    kk = min(kk, z.shape[0])
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(z, kk, None, criteria, 3, cv2.KMEANS_PP_CENTERS)

    def to_lab(a):
        return cv2.cvtColor(a.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)

    centers_lab = to_lab(centers)
    palette_lab = to_lab(palette_arr)
    mapped = np.zeros((kk, 3), np.uint8)
    for i in range(kk):
        d = np.linalg.norm(palette_lab - centers_lab[i], axis=1)
        mapped[i] = palette_arr[int(np.argmin(d))]

    # Write recolored values back only into the opaque positions.
    out_flat = flat.copy()
    out_flat[opaque_mask] = mapped[labels.flatten()]
    out = out_flat.reshape(h, w, 3)

    out_bgr = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
    if alpha is not None:
        out_bgr = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2BGRA)
        out_bgr[:, :, 3] = alpha
    ok, buf = cv2.imencode(".png", out_bgr)
    if not ok:
        raise HTTPException(status_code=500, detail="encode failed")
    return Response(content=buf.tobytes(), media_type="image/png")
