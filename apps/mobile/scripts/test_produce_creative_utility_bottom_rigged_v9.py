from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v6 import build_candidate as build_v6_candidate  # noqa: E402
from produce_creative_utility_bottom_rigged_v9 import build_candidate  # noqa: E402


class ProduceCreativeUtilityBottomRiggedV9Tests(unittest.TestCase):
    def test_upper_rig_is_unchanged(self) -> None:
        before = np.asarray(build_v6_candidate())
        after = np.asarray(build_candidate())
        self.assertTrue(np.array_equal(before[:320], after[:320]))

    def test_cuffs_are_two_separate_tapered_shapes(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertGreater(int((alpha[320, 98:127] > 96).sum()), 24)
        self.assertGreater(int((alpha[320, 129:156] > 96).sum()), 23)
        self.assertLess(int((alpha[325, 108:123] > 96).sum()), 16)
        self.assertLess(int((alpha[325, 134:146] > 96).sum()), 13)
        self.assertTrue(np.all(alpha[323, 125:131] < 48))
        self.assertTrue(np.all(alpha[324, 124:132] < 48))
        self.assertTrue(np.all(alpha[325, 123:134] < 48))
        self.assertTrue(np.all(alpha[326, 121:136] < 48))

    def test_each_cuff_lands_on_its_own_shoe_top(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertGreater(int((alpha[325, 111:122] > 96).sum()), 8)
        self.assertGreater(int((alpha[325, 135:145] > 96).sum()), 7)
        self.assertTrue(np.all(alpha[328:] == 0))

    def test_no_detached_side_fragments_or_transparent_rgb_residue(self) -> None:
        candidate = np.asarray(build_candidate())
        alpha = candidate[..., 3]
        self.assertTrue(np.all(alpha[323:328, :101] == 0))
        self.assertTrue(np.all(alpha[323:328, 154:] == 0))
        self.assertTrue(np.all(candidate[alpha == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
