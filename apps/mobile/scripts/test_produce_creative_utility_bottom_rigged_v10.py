from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v9 import build_candidate as build_v9_candidate  # noqa: E402
from produce_creative_utility_bottom_rigged_v10 import ROOM, build_candidate  # noqa: E402


class ProduceCreativeUtilityBottomRiggedV10Tests(unittest.TestCase):
    def test_approved_upper_fit_is_unchanged(self) -> None:
        before = np.asarray(build_v9_candidate())
        after = np.asarray(build_candidate())
        self.assertTrue(np.array_equal(before[:325], after[:325]))

    def test_each_cuff_curves_onto_its_shoe_top(self) -> None:
        candidate_alpha = np.asarray(build_candidate())[..., 3]
        shoes_alpha = np.asarray(
            Image.open(ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png").convert("RGBA")
        )[..., 3]
        overlap = (candidate_alpha > 96) & (shoes_alpha > 24)
        self.assertGreater(int(overlap[326:328, 104:128].sum()), 10)
        self.assertGreater(int(overlap[326:328, 129:151].sum()), 9)

    def test_drape_is_shallow_and_shoes_remain_visible(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.all(alpha[328:] == 0))
        self.assertTrue(np.all(alpha[325, 125:131] < 48))
        self.assertTrue(np.all(alpha[326, 124:132] < 48))
        self.assertTrue(np.all(alpha[327, 122:135] < 48))

    def test_no_detached_fragments_or_transparent_rgb_residue(self) -> None:
        candidate = np.asarray(build_candidate())
        alpha = candidate[..., 3]
        self.assertTrue(np.all(alpha[326:328, :108] == 0))
        self.assertTrue(np.all(alpha[326:328, 148:] == 0))
        self.assertTrue(np.all(candidate[alpha == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
