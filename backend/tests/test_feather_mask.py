"""Tests for backend/routers/bg_remove.py's _feather_mask.

Pure numpy/PIL logic, no ONNX session required — this deliberately does NOT
use the `client`/`app` fixtures so it stays fast and independent of the
rembg/onnxruntime import weight.

Per the module docstring in bg_remove.py, _feather_mask replaces rembg's own
hard 0/255 re-threshold (which caused visibly jagged "staircase" edges) with
a morphological opening + Gaussian feather that keeps the edge antialiased.
The two properties that matter and must not regress:
  1. Antialiasing: the output has genuine intermediate alpha values at edges,
     not just 0 and 255.
  2. No erosion: the feathered result must not shrink the opaque subject —
     only soften its edge. (The opening step can remove small isolated
     specks/pinholes, which is intentional, but it must not eat into a
     solid, sizeable region.)
"""

import numpy as np
import pytest
from PIL import Image


@pytest.fixture()
def feather_mask():
    from routers.bg_remove import _feather_mask

    return _feather_mask


def _solid_square_mask(size=64, margin=16):
    """A hard-edged white square (the 'subject') on a black background,
    mimicking a binary segmentation mask straight out of the network."""
    arr = np.zeros((size, size), dtype=np.uint8)
    arr[margin : size - margin, margin : size - margin] = 255
    return Image.fromarray(arr, mode="L")


class TestFeatherMaskAntialiasing:
    def test_output_has_intermediate_alpha_values_at_the_edge(self, feather_mask):
        mask = _solid_square_mask()
        out = feather_mask(mask)
        arr = np.array(out)

        unique_values = np.unique(arr)
        intermediate = unique_values[(unique_values > 5) & (unique_values < 250)]
        assert intermediate.size > 0, (
            "expected soft/antialiased alpha values between 0 and 255 at the "
            "square's edge; got a hard-binary mask instead"
        )

    def test_output_is_same_size_and_mode(self, feather_mask):
        mask = _solid_square_mask()
        out = feather_mask(mask)
        assert out.size == mask.size
        assert out.mode == "L"

    def test_interior_stays_fully_opaque(self, feather_mask):
        # Far from any edge, feathering should not visibly dim the subject.
        mask = _solid_square_mask(size=64, margin=16)
        out = feather_mask(mask)
        arr = np.array(out)
        center = arr[28:36, 28:36]
        assert center.min() > 250

    def test_exterior_stays_fully_transparent_far_from_subject(self, feather_mask):
        mask = _solid_square_mask(size=64, margin=16)
        out = feather_mask(mask)
        arr = np.array(out)
        corner = arr[0:4, 0:4]
        assert corner.max() < 5


class TestFeatherMaskDoesNotErodeSubject:
    def test_opaque_area_is_not_meaningfully_smaller_than_input(self, feather_mask):
        """Regression guard: feathering must soften edges, not shrink the
        subject. We compare the count of 'clearly opaque' pixels (>127)
        before and after — a feather/blur naturally moves a thin edge band
        below the threshold on both sides, so allow a small tolerance, but
        the subject must not collapse inward significantly."""
        mask = _solid_square_mask(size=100, margin=20)
        input_arr = np.array(mask)
        out = feather_mask(mask)
        output_arr = np.array(out)

        input_opaque = int((input_arr > 127).sum())
        output_opaque = int((output_arr > 127).sum())

        # Allow the natural ~1px-ish edge softening (sigma=1.2 Gaussian) but
        # not systematic erosion of the whole subject.
        assert output_opaque >= input_opaque * 0.90

    def test_solid_full_frame_mask_stays_fully_opaque(self, feather_mask):
        # A mask that is white everywhere (no edge at all within the frame)
        # must come back fully opaque — nothing to erode from any side.
        arr = np.full((32, 32), 255, dtype=np.uint8)
        mask = Image.fromarray(arr, mode="L")
        out = feather_mask(mask)
        out_arr = np.array(out)
        assert out_arr.min() > 250

    def test_small_pinhole_speck_is_cleaned_up(self, feather_mask):
        # A single isolated foreground speck (a "pinhole" in reverse — an
        # errant lit pixel) should be removed by the morphological opening,
        # same as rembg's own post_process. This is intentional cleanup, not
        # erosion of the real subject.
        arr = np.zeros((32, 32), dtype=np.uint8)
        arr[15, 15] = 255  # single isolated pixel, smaller than the opening kernel
        mask = Image.fromarray(arr, mode="L")
        out = feather_mask(mask)
        out_arr = np.array(out)
        assert out_arr.max() < 50


class TestFeatherMaskAllTransparentInput:
    def test_all_black_mask_stays_fully_transparent(self, feather_mask):
        arr = np.zeros((32, 32), dtype=np.uint8)
        mask = Image.fromarray(arr, mode="L")
        out = feather_mask(mask)
        out_arr = np.array(out)
        assert out_arr.max() < 5
