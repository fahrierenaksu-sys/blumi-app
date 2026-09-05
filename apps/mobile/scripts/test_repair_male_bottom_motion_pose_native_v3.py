#!/usr/bin/env python3
"""Regression gates for shoe-aware walking bottoms V3."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from repair_male_bottom_motion_pose_native_v3 import (  # noqa: E402
    ITEMS,
    WALK_STATES,
    build_frame,
    load_shoes,
)


REJECTED_WALK_ITEMS = {
    "straight_utility_tailored_trousers",
    "warm_sand_deconstructed_trousers",
    "contemporary_resort_street_bottom",
    "modern_track_luxury_bottom",
}


class ShoeAwareWalkingBottomTests(unittest.TestCase):
    def test_rejected_rows_follow_each_shoe_without_covering_tongue_or_toe(self) -> None:
        for item in ITEMS:
            if item.slug not in REJECTED_WALK_ITEMS:
                continue
            for state in WALK_STATES:
                bottom = np.asarray(build_frame(item, state))[..., 3] > 24
                shoe = np.asarray(load_shoes(state))[..., 3] > 24
                with self.subTest(item=item.slug, state=state):
                    # Garment may touch only the shallow upper shoe contact.
                    self.assertEqual(int((bottom[337:] & shoe[337:]).sum()), 0)
                    # Preserve a visible tongue/lace corridor for both shoes.
                    self.assertEqual(int((bottom[329:345, 105:120] & shoe[329:345, 105:120]).sum()), 0)
                    self.assertEqual(int((bottom[329:345, 137:152] & shoe[329:345, 137:152]).sum()), 0)

    def test_each_hem_tracks_its_current_shoe_center(self) -> None:
        for item in ITEMS:
            if item.slug not in REJECTED_WALK_ITEMS:
                continue
            neutral_bottom = np.asarray(build_frame(item, "walking_front_f01"))[..., 3] > 24
            neutral_shoe = np.asarray(load_shoes("walking_front_f01"))[..., 3] > 24
            for state in WALK_STATES:
                bottom = np.asarray(build_frame(item, state))[..., 3] > 24
                shoe = np.asarray(load_shoes(state))[..., 3] > 24
                for left, right in ((72, 128), (128, 184)):
                    garment_y, garment_x = np.where(bottom[316:338, left:right])
                    shoe_y, shoe_x = np.where(shoe[326:356, left:right])
                    _, neutral_garment_x = np.where(neutral_bottom[316:338, left:right])
                    _, neutral_shoe_x = np.where(neutral_shoe[326:356, left:right])
                    with self.subTest(item=item.slug, state=state, half=(left, right)):
                        self.assertGreater(len(garment_x), 8)
                        self.assertGreater(len(shoe_x), 8)
                        garment_delta = float(np.median(garment_x)) - float(np.median(neutral_garment_x))
                        shoe_delta = float(np.median(shoe_x)) - float(np.median(neutral_shoe_x))
                        self.assertLessEqual(abs(garment_delta - shoe_delta), 4.0)

    def test_rejected_rows_taper_into_leg_and_shoe_instead_of_rectangular_blocks(self) -> None:
        for item in ITEMS:
            if item.slug not in REJECTED_WALK_ITEMS:
                continue
            for state in WALK_STATES:
                alpha = np.asarray(build_frame(item, state))[..., 3] > 24
                for left, right in ((72, 128), (128, 184)):
                    upper = np.where(alpha[304, left:right])[0]
                    lower = np.where(alpha[326, left:right])[0]
                    with self.subTest(item=item.slug, state=state, half=(left, right)):
                        self.assertGreater(len(upper), 20)
                        self.assertGreaterEqual(len(lower), 12)
                        self.assertLessEqual(len(lower), 34)
                        self.assertLess(len(lower), len(upper))


if __name__ == "__main__":
    unittest.main()
