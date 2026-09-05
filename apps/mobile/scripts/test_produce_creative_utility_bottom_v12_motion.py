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
from produce_creative_utility_bottom_v12_motion import MOTION, STATES, build_frame, shoe_bboxes  # noqa: E402


class ProduceCreativeUtilityBottomV12MotionTests(unittest.TestCase):
    def test_walk_f01_is_exact_user_approved_static(self) -> None:
        self.assertEqual(
            hashlib.sha256(build_static().tobytes()).digest(),
            hashlib.sha256(build_frame("walking_front_f01").tobytes()).digest(),
        )

    def test_each_moving_pose_has_two_shoe_anchored_cuffs(self) -> None:
        for state in STATES[1:]:
            frame_alpha = np.asarray(build_frame(state))[..., 3]
            shoes = np.asarray(
                Image.open(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png").convert("RGBA")
            )[..., 3]
            boxes = shoe_bboxes(state)
            self.assertEqual(2, len(boxes))
            for index, (x0, y0, x1, _y1) in enumerate(boxes):
                with self.subTest(state=state, shoe=index):
                    overlap = (frame_alpha[y0 : y0 + 2, x0:x1] > 96) & (shoes[y0 : y0 + 2, x0:x1] > 24)
                    self.assertGreater(int(overlap.sum()), 2)
                    half = slice(0, 128) if index == 0 else slice(128, 256)
                    self.assertTrue(np.all(frame_alpha[y0 + 2 :, half] == 0))

    def test_shoes_are_not_swallowed_by_the_drape(self) -> None:
        for state in STATES[1:]:
            frame_alpha = np.asarray(build_frame(state))[..., 3]
            shoes = np.asarray(
                Image.open(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png").convert("RGBA")
            )[..., 3]
            overlap = (frame_alpha > 24) & (shoes > 24)
            self.assertLess(float(overlap.sum() / max((shoes > 24).sum(), 1)), 0.18)

    def test_all_frames_are_distinct_clean_and_keep_leg_separation(self) -> None:
        hashes = set()
        for state in STATES:
            frame = build_frame(state)
            pixels = np.asarray(frame)
            self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
            self.assertGreater(int((pixels[304:334, 126:131, 3] <= 24).sum()), 8)
            hashes.add(hashlib.sha256(frame.tobytes()).digest())
        self.assertEqual(5, len(hashes))


if __name__ == "__main__":
    unittest.main()
