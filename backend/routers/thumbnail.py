"""Thumbnail generation. Image thumbs use Pillow; video thumbs shell out to ffmpeg.

The renderer generates image thumbnails itself via an offscreen canvas, so
/thumbnail is mainly a convenience; /video-thumbnail is the one the renderer
genuinely needs (it cannot easily decode arbitrary video frames).
"""

import io
import os
import subprocess
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from ffmpeg_util import ffmpeg_path

router = APIRouter()


@router.post("/thumbnail")
async def thumbnail(file: UploadFile = File(...), size: int = Form(320)) -> Response:
    try:
        img = Image.open(io.BytesIO(await file.read())).convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}")
    img.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/video-thumbnail")
async def video_thumbnail(
    file: UploadFile = File(...), time: float = Form(1.0), size: int = Form(320)
) -> Response:
    suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tin:
        tin.write(await file.read())
        in_path = tin.name
    out_path = in_path + ".png"
    try:
        subprocess.run(
            [
                ffmpeg_path(), "-y", "-ss", str(time), "-i", in_path,
                "-frames:v", "1",
                "-vf", f"scale={size}:-1",
                out_path,
            ],
            check=True,
            capture_output=True,
        )
        with open(out_path, "rb") as fh:
            data = fh.read()
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"ffmpeg failed: {exc.stderr.decode()[:300]}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="ffmpeg not available")
    finally:
        for p in (in_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass
    return Response(content=data, media_type="image/png")
