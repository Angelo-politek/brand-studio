"""Security tests for the bearer-token middleware in backend/main.py.

This middleware is the ONLY thing standing between an arbitrary local
process/web page and the sidecar (see the comment above `require_token` in
main.py) for every route except /health. These tests are the highest
priority in this suite.
"""

import pytest

# Every route the sidecar exposes other than /health. Kept as a flat list
# (method, path) rather than looping over app.routes so the intent is
# explicit and a newly added route doesn't silently start bypassing auth
# coverage — a new route requires a conscious addition here.
PROTECTED_ROUTES = [
    ("POST", "/bg-remove"),
    ("POST", "/image/palette"),
    ("POST", "/image/recolor"),
    ("POST", "/video/export"),
    ("GET", "/video/jobs/does-not-exist"),
    ("POST", "/video/jobs/does-not-exist/cancel"),
]


def _call(client, method, path, **kw):
    return client.request(method, path, **kw)


class TestHealthIsPublic:
    def test_health_ok_without_any_auth_header(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_health_ok_with_garbage_auth_header(self, client):
        resp = client.get("/health", headers={"Authorization": "nonsense"})
        assert resp.status_code == 200


class TestProtectedRoutesRejectMissingToken:
    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_no_authorization_header_is_401(self, client, method, path):
        resp = _call(client, method, path)
        assert resp.status_code == 401
        assert resp.json()["detail"] == "unauthorized"


class TestProtectedRoutesRejectWrongToken:
    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_wrong_bearer_token_is_401(self, client, method, path):
        resp = _call(client, method, path, headers={"Authorization": "Bearer wrong-token"})
        assert resp.status_code == 401

    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_empty_bearer_token_is_401(self, client, method, path):
        resp = _call(client, method, path, headers={"Authorization": "Bearer "})
        assert resp.status_code == 401


class TestProtectedRoutesRejectMalformedHeader:
    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_missing_bearer_prefix_is_401(self, client, method, path, auth_headers):
        # Correct token value, but without the "Bearer " scheme prefix.
        token_only = auth_headers["Authorization"].removeprefix("Bearer ")
        resp = _call(client, method, path, headers={"Authorization": token_only})
        assert resp.status_code == 401

    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_wrong_scheme_is_401(self, client, method, path, auth_headers):
        token_only = auth_headers["Authorization"].removeprefix("Bearer ")
        resp = _call(client, method, path, headers={"Authorization": f"Basic {token_only}"})
        assert resp.status_code == 401

    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_case_sensitive_bearer_prefix_is_401(self, client, method, path, auth_headers):
        # HTTP header *names* are case-insensitive but the scheme token is
        # conventionally case-sensitive; assert the middleware does an exact
        # match rather than silently normalizing it.
        token_only = auth_headers["Authorization"].removeprefix("Bearer ")
        resp = _call(client, method, path, headers={"Authorization": f"bearer {token_only}"})
        assert resp.status_code == 401

    @pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
    def test_extra_whitespace_is_401(self, client, method, path, auth_headers):
        token_only = auth_headers["Authorization"].removeprefix("Bearer ")
        resp = _call(client, method, path, headers={"Authorization": f"Bearer  {token_only}"})
        assert resp.status_code == 401


class TestProtectedRoutesAcceptCorrectToken:
    def test_correct_token_reaches_the_route_handler(self, client, auth_headers):
        # video/jobs/{id} is the cheapest authenticated route to exercise: no
        # multipart body, no ffmpeg, no ONNX. A correct token should get past
        # the middleware and reach the handler, which then 404s on the
        # unknown job id — proving auth passed (an auth failure would be 401,
        # not 404).
        resp = client.get("/video/jobs/does-not-exist", headers=auth_headers)
        assert resp.status_code == 404

    def test_options_bypasses_auth_for_cors_preflight(self, client):
        # The middleware explicitly exempts OPTIONS (CORS preflight can't
        # attach the bearer token). Confirm it isn't rejected with 401 as a
        # regression check on that carve-out.
        resp = client.options(
            "/video/export",
            headers={
                "Origin": "http://localhost",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.status_code != 401


class TestNoTokenConfigured:
    """When BS_SIDECAR_TOKEN is unset/empty, every non-health route must be
    fail-closed (reject everything) rather than fail-open (accept anything).
    main.py's check is `if not _TOKEN or auth != expected`, which rejects
    whenever _TOKEN is falsy regardless of what the caller sends — including
    a caller who (accidentally or not) sends `Authorization: Bearer ` with an
    empty token, matching the empty _TOKEN. This locks the sidecar rather
    than opening it when misconfigured."""

    def test_empty_token_env_rejects_even_matching_empty_bearer(self, monkeypatch):
        monkeypatch.setenv("BS_SIDECAR_TOKEN", "")
        # BS_SIDECAR_TOKEN is read at import time, so this needs its own,
        # fresh app instance rather than the session-scoped `app` fixture.
        import importlib
        import os
        import sys

        os.environ.pop("BS_SIDECAR_TOKEN", None)
        monkeypatch.setenv("BS_SIDECAR_TOKEN", "")
        sys.modules.pop("main", None)
        import main as fresh_main

        try:
            from fastapi.testclient import TestClient

            with TestClient(fresh_main.app) as c:
                resp = c.get("/video/jobs/x", headers={"Authorization": "Bearer "})
                assert resp.status_code == 401
                # /health must remain public even in this misconfigured state.
                assert c.get("/health").status_code == 200
        finally:
            sys.modules.pop("main", None)
            importlib.invalidate_caches()
