from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v3 import (  # noqa: E402
    CANVAS,
    SOURCE,
    SOURCE_SHA256,
    build_candidate,
)


class ProduceCreativeUtilityBottomRiggedV3Tests(unittest.TestCase):
    def test_source_is_the_locked_canonical_cargo_rig_authority(self) -> None:
        self.assertEqual(SOURCE_SHA256, hashlib.sha256(SOURCE.read_bytes()).hexdigest())

    def test_candidate_preserves_the_authority_geometry_exactly(self) -> None:
        source = Image.open(SOURCE).convert("RGBA")
        candidate = build_candidate()
        self.assertEqual(CANVAS, candidate.size)
        self.assertEqual(source.getchannel("A").tobytes(), candidate.getchannel("A").tobytes())

    def test_candidate_is_olive_creative_utility_art_not_the_beige_source(self) -> None:
        source = np.asarray(Image.open(SOURCE).convert("RGBA"))
        candidate = np.asarray(build_candidate())
        visible = candidate[..., 3] > 32
        self.assertFalse(np.array_equal(source[visible, :3], candidate[visible, :3]))
        mean = candidate[visible, :3].mean(axis=0)
        self.assertGreater(float(mean[1]), float(mean[2]))
        self.assertGreater(float(mean[0]), float(mean[2]))
        self.assertLess(float(mean[0]), 145.0)

    def test_candidate_has_clean_transparent_rgb_and_two_leg_gap(self) -> None:
        pixels = np.asarray(build_candidate())
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
        alpha = pixels[..., 3]
        self.assertGreater(int((alpha[304:342, 126:130] <= 24).sum()), 20)
        self.assertIsNotNone(Image.fromarray(alpha).getbbox())


if __name__ == "__main__":
    unittest.main()
