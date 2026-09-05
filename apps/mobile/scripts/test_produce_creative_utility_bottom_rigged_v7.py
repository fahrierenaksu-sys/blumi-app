from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v7 import SOURCE, build_candidate  # noqa: E402


class ProduceCreativeUtilityBottomRiggedV7Tests(unittest.TestCase):
    def test_upper_rig_geometry_is_unchanged(self) -> None:
        source_alpha = np.asarray(Image.open(SOURCE).convert("RGBA"))[..., 3]
        candidate_alpha = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.array_equal(source_alpha[:320], candidate_alpha[:320]))

    def test_dangling_fragments_below_shoe_contact_are_removed(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.all(alpha[330:340] == 0))
        self.assertEqual(0, int((alpha[329, 96:160] > 24).sum()))

    def test_two_clean_cuffs_land_on_shoe_top(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        left = np.where(alpha[324, :128] > 96)[0]
        right = np.where(alpha[324, 128:] > 96)[0] + 128
        self.assertLessEqual(int(left.min()), 102)
        self.assertGreaterEqual(int(left.max()), 125)
        self.assertLessEqual(int(right.min()), 130)
        self.assertGreaterEqual(int(right.max()), 153)
        self.assertTrue(np.all(alpha[321:328, 127:129] < 48))

    def test_transparent_pixels_have_zero_rgb(self) -> None:
        candidate = np.asarray(build_candidate())
        self.assertTrue(np.all(candidate[candidate[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
