"""Brand Studio local processing sidecar (FastAPI + uvicorn).

Launched and supervised by the Electron main process on an ephemeral localhost
port. Stateless: receives image/video bytes, returns processed bytes. It never
touches the SQLite database — the Electron main process owns persistence.
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import bg_remove, health, image, video

app = FastAPI(title="Brand Studio Backend", version="0.1.0")

# Shared secret injected by the Electron main process at spawn time. Every
# request except /health must present it as `Authorization: Bearer <token>`.
# This prevents other local processes / web pages from driving the sidecar.
_TOKEN = os.environ.get("BS_SIDECAR_TOKEN", "")


@app.middleware("http")
async def require_token(request: Request, call_next):
    if request.url.path != "/health" and request.method != "OPTIONS":
        auth = request.headers.get("authorization", "")
        expected = f"Bearer {_TOKEN}"
        if not _TOKEN or auth != expected:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


# The renderer calls this sidecar directly over localhost. Origins are not a
# meaningful trust boundary here (any local page could spoof one), so the token
# above is the real guard; CORS is kept permissive only to let the fetch through.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(bg_remove.router)
app.include_router(image.router)
app.include_router(video.router)


@app.on_event("startup")
async def _warm_models() -> None:
    """Preload the default background-removal model in a background thread so the
    first real request doesn't pay the ~2s ONNX session load. /health stays
    responsive because this runs off the event loop.

    Skipped when BS_DISABLE_MODEL_WARMUP is set — used by the test suite so
    constructing a TestClient (which runs startup events) doesn't spawn an
    ONNX session load in the background of every test module."""
    if os.environ.get("BS_DISABLE_MODEL_WARMUP"):
        return

    import threading

    def _load() -> None:
        try:
            from routers.bg_remove import _get_session, DEFAULT_MODEL

            _get_session(DEFAULT_MODEL)
        except Exception:  # noqa: BLE001 — warm-up is best effort
            pass

    threading.Thread(target=_load, daemon=True).start()


# Entry point for the PyInstaller-frozen sidecar: the packaged app runs the exe
# directly (no uvicorn CLI), with the port injected via BS_PORT.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BS_PORT", "8756")))
