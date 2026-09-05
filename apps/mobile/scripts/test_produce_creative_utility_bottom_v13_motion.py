from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v11 import build_candidate as build_static  # noqa: E402
from produce_creative_utility_bottom_v13_motion import MOTION, STATES, build_frame, shoe_bboxes  # noqa: E402


class ProduceCreativeUtilityBottomV13MotionTests(unittest.TestCase):
    def test_f01_is_bit_exact_user_approved_v11(self) -> None:
        self.assertEqual(
            hashlib.sha256(build_static().tobytes()).digest(),
            hashlib.sha256(build_frame("walking_front_f01").tobytes()).digest(),
        )

    def test_waist_anchor_is_unchanged_in_every_pose(self) -> None:
        static = np.asarray(build_static())
        for state in STATES:
            frame = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertTrue(np.array_equal(static[:298], frame[:298]))

    def test_each_leg_lands_near_its_pose_shoe_without_swallowing_it(self) -> None:
        for state in STATES[1:]:
            frame_alpha = np.asarray(build_frame(state))[..., 3]
            shoes = np.asarray(
                Image.open(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png").convert("RGBA")
            )[..., 3]
            for index, (x0, y0, x1, _y1) in enumerate(shoe_bboxes(state)):
                with self.subTest(state=state, shoe=index):
                    region = frame_alpha[max(y0 - 2, 0) : y0 + 3, max(x0 - 3, 0) : min(x1 + 3, 256)]
                    self.assertGreater(int((region > 24).sum()), 4)
            overlap = (frame_alpha > 24) & (shoes > 24)
            self.assertLess(float(overlap.sum() / max((shoes > 24).sum(), 1)), 0.22)

    def test_no_lower_flap_extends_far_outside_shoes(self) -> None:
        for state in STATES[1:]:
            alpha = np.asarray(build_frame(state))[..., 3]
            for index, (x0, y0, x1, _y1) in enumerate(shoe_bboxes(state)):
                half = slice(0, 128) if index == 0 else slice(128, 256)
                band = alpha[max(y0 - 3, 0) : y0 + 4, half]
                offset = 0 if index == 0 else 128
                visible_x = np.where(band > 24)[1] + offset
                self.assertGreater(len(visible_x), 0)
                self.assertGreaterEqual(int(visible_x.min()), x0 - 12)
                self.assertLessEqual(int(visible_x.max()), x1 + 11)

    def test_frames_are_distinct_and_transparency_is_clean(self) -> None:
        hashes = set()
        for state in STATES:
            frame = build_frame(state)
            pixels = np.asarray(frame)
            self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
            hashes.add(hashlib.sha256(frame.tobytes()).digest())
        self.assertEqual(5, len(hashes))


if __name__ == "__main__":
    unittest.main()
