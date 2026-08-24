"""Shared pytest fixtures for the sidecar test suite.

Import-order notes (see backend/main.py and backend/routers/bg_remove.py):

- `main.py` does `from routers import bg_remove, health, image, video` — i.e.
  it expects `backend/` itself on sys.path, exactly like the production
  process (the Electron main process spawns python with cwd=backend/, see
  src/main/python/manager.ts). We replicate that here instead of importing
  `backend.main`, so the import behaviour under test matches production.
- Importing `main` pulls in `routers.bg_remove`, which imports rembg/scipy/
  skimage at module scope — a genuinely heavy, multi-second import the first
  time it happens in a process. There is no clean way to dodge that cost for
  any test that exercises the real app (even security-only tests need the
  app object), so we pay it once per test session via the session-scoped
  `app` fixture below rather than once per test module.
- `main.py`'s startup event also warms up an ONNX session in a background
  thread. That's wasted work under test (and a source of flakiness/log
  noise) since no test relies on the warm cache, so BS_DISABLE_MODEL_WARMUP
  is set before import to skip it — see the corresponding guard in
  `_warm_models`.
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

TEST_TOKEN = "test-secret-token"

# Must be set before `main` (and therefore the routers) is imported.
os.environ.setdefault("BS_DISABLE_MODEL_WARMUP", "1")


@pytest.fixture(scope="session")
def app():
    """The FastAPI app, imported once per test session.

    BS_SIDECAR_TOKEN must be set before import because main.py reads it into
    a module-level constant at import time (`_TOKEN = os.environ.get(...)`).
    """
    os.environ.setdefault("BS_SIDECAR_TOKEN", TEST_TOKEN)
    import main as sidecar_main

    return sidecar_main.app


@pytest.fixture()
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture()
def data_root(tmp_path, monkeypatch):
    """A fake BS_DATA_ROOT for tests that exercise _safe_path / video routes."""
    root = tmp_path / "data-root"
    root.mkdir()
    monkeypatch.setenv("BS_DATA_ROOT", str(root))
    return root
