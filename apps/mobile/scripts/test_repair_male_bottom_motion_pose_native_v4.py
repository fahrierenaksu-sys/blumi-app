#!/usr/bin/env python3
"""Regression gates for the targeted straight-trouser walking replacement."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("repair_male_bottom_motion_pose_native_v4.py")
SPEC = importlib.util.spec_from_file_location("male_bottom_motion_v4", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class WalkingV4Tests(unittest.TestCase):
    def test_targeted_frames_leave_shoe_owned_pixels_visible(self) -> None:
        for item in MODULE.TARGETS:
            model = next(candidate for candidate in MODULE.ITEMS if candidate.slug == item)
            for state in MODULE.WALK_STATES:
                with self.subTest(item=item, state=state):
                    frame = np.asarray(MODULE.build_frame(model, state))
                    garment = frame[..., 3] > 24
                    shoes = np.asarray(MODULE.load_shoes(state))[..., 3] > 24
                    self.assertEqual(int((garment & shoes).sum()), 0)

    def test_targeted_hem_is_tapered_before_each_shoe(self) -> None:
        for item in MODULE.TARGETS:
            model = next(candidate for candidate in MODULE.ITEMS if candidate.slug == item)
            for state in MODULE.WALK_STATES:
                with self.subTest(item=item, state=state):
                    frame = np.asarray(MODULE.build_frame(model, state))
                    garment = frame[..., 3] > 24
                    shoes = np.asarray(MODULE.load_shoes(state))[..., 3] > 24
                    for left, right in ((0, 128), (128, 256)):
                        shoe_rows = np.where(shoes[:, left:right])[0]
                        top = int(shoe_rows.min())
                        hem = garment[max(0, top - 1), left:right]
                        self.assertGreater(int(hem.sum()), 8)
                        self.assertLessEqual(int(hem.sum()), 32)


if __name__ == "__main__":
    unittest.main()
