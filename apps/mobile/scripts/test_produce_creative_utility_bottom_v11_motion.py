from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v11 import build_candidate as build_static  # noqa: E402
from produce_creative_utility_bottom_v11_motion import STATES, build_frame  # noqa: E402


class ProduceCreativeUtilityBottomV11MotionTests(unittest.TestCase):
    def test_motion_contract_is_four_walk_frames_and_one_sit(self) -> None:
        self.assertEqual(
            (
                "walking_front_f01",
                "walking_front_f02",
                "walking_front_f03",
                "walking_front_f04",
                "sitting_front_f01",
            ),
            STATES,
        )

    def test_walk_f01_is_exact_user_approved_v11_static(self) -> None:
        expected = build_static().tobytes()
        actual = build_frame("walking_front_f01").tobytes()
        self.assertEqual(hashlib.sha256(expected).digest(), hashlib.sha256(actual).digest())

    def test_all_frames_are_distinct_clean_rgba_assets(self) -> None:
        hashes = set()
        for state in STATES:
            frame = build_frame(state)
            pixels = np.asarray(frame)
            self.assertEqual((256, 384), frame.size)
            self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
            self.assertIsNotNone(frame.getchannel("A").getbbox())
            hashes.add(hashlib.sha256(frame.tobytes()).digest())
        self.assertEqual(5, len(hashes))

    def test_pose_frames_remove_sparse_dangling_tails(self) -> None:
        for state in STATES[1:]:
            alpha = np.asarray(build_frame(state))[..., 3]
            with self.subTest(state=state):
                self.assertTrue(np.all(alpha[331:] == 0))

    def test_each_pose_preserves_two_leg_or_sitting_separation(self) -> None:
        for state in STATES:
            alpha = np.asarray(build_frame(state))[..., 3]
            with self.subTest(state=state):
                self.assertGreater(int((alpha[304:331, 126:131] <= 24).sum()), 8)


if __name__ == "__main__":
    unittest.main()
