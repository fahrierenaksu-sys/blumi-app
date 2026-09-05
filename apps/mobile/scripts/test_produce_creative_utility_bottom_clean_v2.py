from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_clean_v2 import (  # noqa: E402
    SOURCE,
    SOURCE_SHA256,
    clean_bottom,
)


class ProduceCreativeUtilityBottomCleanV2Tests(unittest.TestCase):
    def test_source_is_checksum_locked(self) -> None:
        self.assertEqual(SOURCE_SHA256, hashlib.sha256(SOURCE.read_bytes()).hexdigest())

    def test_cleaned_bottom_has_no_dangling_pixels_below_the_hem(self) -> None:
        alpha = np.asarray(clean_bottom().getchannel("A"))
        self.assertEqual(0, int(alpha[326:, :].max()))

    def test_outer_edges_have_no_magenta_or_purple_fringe(self) -> None:
        pixels = np.asarray(clean_bottom())
        yy, xx = np.indices(pixels.shape[:2])
        outer = ((xx <= 104) | (xx >= 152)) & (yy >= 282) & (yy <= 325)
        visible = pixels[..., 3] > 24
        red, green, blue = (pixels[..., index].astype(np.int16) for index in range(3))
        purple = (red > 120) & (blue > 150) & (red > green)
        self.assertEqual(0, int(np.count_nonzero(outer & visible & purple)))

    def test_inner_leg_gap_and_transparent_rgb_remain_clean(self) -> None:
        pixels = np.asarray(clean_bottom())
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
        alpha = pixels[..., 3]
        for y in range(304, 326):
            self.assertLessEqual(
                int(alpha[y, 127:130].max()),
                24,
                y,
            )


if __name__ == "__main__":
    unittest.main()
