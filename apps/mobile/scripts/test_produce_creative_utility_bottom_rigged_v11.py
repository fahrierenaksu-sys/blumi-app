from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v10 import build_candidate as build_v10_candidate  # noqa: E402
from produce_creative_utility_bottom_rigged_v11 import build_candidate  # noqa: E402


class ProduceCreativeUtilityBottomRiggedV11Tests(unittest.TestCase):
    def test_waist_and_shoe_drape_are_unchanged(self) -> None:
        before = np.asarray(build_v10_candidate())
        after = np.asarray(build_candidate())
        self.assertTrue(np.array_equal(before[:300], after[:300]))
        self.assertTrue(np.array_equal(before[320:], after[320:]))

    def test_only_one_outer_pixel_per_side_is_trimmed(self) -> None:
        before = np.asarray(build_v10_candidate())[..., 3]
        after = np.asarray(build_candidate())[..., 3]
        for y in range(300, 320):
            old_x = np.where(before[y] > 24)[0]
            new_x = np.where(after[y] > 24)[0]
            self.assertGreaterEqual(int(new_x.min()), int(old_x.min()) + 1)
            self.assertLessEqual(int(new_x.max()), int(old_x.max()) - 1)
            self.assertLessEqual(len(old_x) - len(new_x), 4)

    def test_center_leg_separation_is_preserved(self) -> None:
        before = np.asarray(build_v10_candidate())[..., 3]
        after = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.array_equal(before[300:320, 120:136], after[300:320, 120:136]))

    def test_transparent_rgb_is_clean(self) -> None:
        candidate = np.asarray(build_candidate())
        self.assertTrue(np.all(candidate[candidate[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
