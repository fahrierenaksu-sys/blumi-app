from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v4 import (  # noqa: E402
    CANVAS,
    SOURCE,
    SOURCE_SHA256,
    build_candidate,
)


class ProduceCreativeUtilityBottomRiggedV4Tests(unittest.TestCase):
    def test_source_is_locked_approved_relaxed_geometry(self) -> None:
        self.assertEqual(SOURCE_SHA256, hashlib.sha256(SOURCE.read_bytes()).hexdigest())

    def test_candidate_preserves_approved_geometry_pixel_exactly(self) -> None:
        source = Image.open(SOURCE).convert("RGBA")
        candidate = build_candidate()
        self.assertEqual(CANVAS, candidate.size)
        self.assertEqual(source.getchannel("A").tobytes(), candidate.getchannel("A").tobytes())

    def test_candidate_is_deep_olive_utility_art(self) -> None:
        source = np.asarray(Image.open(SOURCE).convert("RGBA"))
        candidate = np.asarray(build_candidate())
        visible = candidate[..., 3] > 32
        self.assertFalse(np.array_equal(source[visible, :3], candidate[visible, :3]))
        mean = candidate[visible, :3].mean(axis=0)
        self.assertGreater(float(mean[1]), float(mean[0]))
        self.assertGreater(float(mean[0]), float(mean[2]))
        self.assertLess(float(mean.max()), 125.0)

    def test_transparent_rgb_is_clean_and_leg_gap_remains_open(self) -> None:
        pixels = np.asarray(build_candidate())
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
        alpha = pixels[..., 3]
        self.assertTrue(np.all(alpha[314:329, 127] == 0))
        self.assertGreater(int((alpha[329:334, 120:137] == 0).sum()), 25)


if __name__ == "__main__":
    unittest.main()
