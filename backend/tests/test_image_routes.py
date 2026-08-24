"""Tests for /image/palette and /image/recolor.

Both are exercised end-to-end through the FastAPI app with synthetic PNGs
built in-memory via Pillow — no ONNX model involved, so these stay fast.
"""

import io

import pytest
from PIL import Image


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _two_color_image(size=(40, 40)) -> bytes:
    """Left half red, right half blue — a trivially separable 2-cluster image."""
    img = Image.new("RGB", size, "red")
    w, h = size
    for x in range(w // 2, w):
        for y in range(h):
            img.putpixel((x, y), (0, 0, 255))
    return _png_bytes(img)


def _image_with_transparent_region(size=(40, 40)) -> bytes:
    img = Image.new("RGBA", size, (255, 0, 0, 255))
    w, h = size
    for x in range(w // 2, w):
        for y in range(h):
            img.putpixel((x, y), (10, 200, 10, 0))  # transparent "background-removed" half
    return _png_bytes(img)


class TestPalette:
    def test_extracts_dominant_colors_from_two_color_image(self, client, auth_headers):
        resp = client.post(
            "/image/palette",
            headers=auth_headers,
            files={"file": ("test.png", _two_color_image(), "image/png")},
            data={"k": "2"},
        )
        assert resp.status_code == 200
        colors = resp.json()["colors"]
        assert len(colors) == 2
        hexes = {c["hex"] for c in colors}
        # Roughly red and roughly blue.
        assert any(h.startswith("#ff") or h.startswith("#fe") for h in hexes)
        assert any(h.endswith("ff") for h in hexes)
        weights = [c["weight"] for c in colors]
        assert pytest.approx(sum(weights), abs=1e-6) == 1.0

    def test_k_is_clamped_to_valid_range(self, client, auth_headers):
        # k=0 clamps to 1, k=999 clamps to 12 (per `k = max(1, min(k, 12))`).
        resp = client.post(
            "/image/palette",
            headers=auth_headers,
            files={"file": ("test.png", _two_color_image(), "image/png")},
            data={"k": "0"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["colors"]) == 1

    def test_invalid_image_bytes_is_400(self, client, auth_headers):
        resp = client.post(
            "/image/palette",
            headers=auth_headers,
            files={"file": ("bad.png", b"not a real png", "image/png")},
        )
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        resp = client.post(
            "/image/palette",
            files={"file": ("test.png", _two_color_image(), "image/png")},
        )
        assert resp.status_code == 401


class TestRecolor:
    def test_remaps_colors_onto_supplied_palette(self, client, auth_headers):
        resp = client.post(
            "/image/recolor",
            headers=auth_headers,
            files={"file": ("test.png", _two_color_image(), "image/png")},
            data={"colors": "00ff00,ffff00"},  # green, yellow
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        out = Image.open(io.BytesIO(resp.content)).convert("RGB")
        colors_present = {out.getpixel((x, y)) for x in (0, out.width - 1) for y in (0, out.height - 1)}
        # Every corner should now be one of the two target palette colors
        # (allowing for KMeans/Lab-nearest quantization, not exact source hues).
        assert not any(c in colors_present for c in [(255, 0, 0), (0, 0, 255)])

    def test_no_palette_colors_is_400(self, client, auth_headers):
        resp = client.post(
            "/image/recolor",
            headers=auth_headers,
            files={"file": ("test.png", _two_color_image(), "image/png")},
            data={"colors": ""},
        )
        # FastAPI rejects an empty required Form field during validation, before
        # the handler runs, so this is a 422 rather than our own 400.
        assert resp.status_code == 422

    def test_invalid_image_is_400(self, client, auth_headers):
        resp = client.post(
            "/image/recolor",
            headers=auth_headers,
            files={"file": ("bad.png", b"garbage", "image/png")},
            data={"colors": "ff0000"},
        )
        assert resp.status_code == 400

    def test_transparent_region_is_left_untouched(self, client, auth_headers):
        resp = client.post(
            "/image/recolor",
            headers=auth_headers,
            files={"file": ("test.png", _image_with_transparent_region(), "image/png")},
            data={"colors": "0000ff"},
        )
        assert resp.status_code == 200
        out = Image.open(io.BytesIO(resp.content))
        assert out.mode == "RGBA"
        # The transparent half must remain alpha=0 (untouched), regardless of
        # its RGB — recolor must not composite/pollute it.
        alpha = out.getchannel("A")
        right_half_alpha = [alpha.getpixel((x, y)) for x in range(out.width // 2, out.width) for y in (0,)]
        assert all(a == 0 for a in right_half_alpha)

    def test_requires_auth(self, client):
        resp = client.post(
            "/image/recolor",
            files={"file": ("test.png", _two_color_image(), "image/png")},
            data={"colors": "ff0000"},
        )
        assert resp.status_code == 401
