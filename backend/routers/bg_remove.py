"""One-click background removal via rembg (u2net / ONNX Runtime).

The model is resolved from U2NET_HOME (set by the Electron sidecar manager to
backend/models). If absent, rembg downloads it on first use — pre-fetch it
during venv setup to keep the app fully offline afterwards.
"""

import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter()

# Lazily created so importing this module (and /health) never blocks on the
# heavy ONNX session or a model download.
_session = None


def _get_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session("u2net")
    return _session


@router.post("/bg-remove")
async def bg_remove(file: UploadFile = File(...)) -> Response:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    try:
        from rembg import remove

        out = remove(data, session=_get_session())
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"background removal failed: {exc}")
    return Response(content=out, media_type="image/png")
