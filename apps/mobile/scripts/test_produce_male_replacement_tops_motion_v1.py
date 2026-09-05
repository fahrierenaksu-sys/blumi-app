from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_replacement_tops_motion_v1 import (  # noqa: E402
    CANVAS,
    ITEMS,
    ROOM,
    STATES,
    approval_matches_static,
    build_frame,
)


class ProduceMaleReplacementTopsMotionV1Tests(unittest.TestCase):
    def test_every_item_is_bound_to_the_exact_user_approved_static_hash(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item.slug):
                self.assertTrue(approval_matches_static(item))

    def test_walking_f01_is_the_exact_approved_static_layer(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item.slug):
                frame = build_frame(item, "walking_front_f01")
                static = Image.open(item.static_path).convert("RGBA")
                self.assertEqual(
                    hashlib.sha256(static.tobytes()).digest(),
                    hashlib.sha256(frame.tobytes()).digest(),
                )

    def test_every_item_builds_five_clean_pose_specific_frames(self) -> None:
        for item in ITEMS:
            hashes: set[bytes] = set()
            for state in STATES:
                with self.subTest(slug=item.slug, state=state):
                    frame = build_frame(item, state)
                    self.assertEqual(CANVAS, frame.size)
                    pixels = np.asarray(frame)
                    self.assertIsNotNone(frame.getchannel("A").getbbox())
                    self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                    hashes.add(hashlib.sha256(frame.tobytes()).digest())
            self.assertGreaterEqual(len(hashes), 4)

    def test_motion_stays_inside_each_pose_authority_envelope(self) -> None:
        for item in ITEMS:
            for state in STATES[1:]:
                with self.subTest(slug=item.slug, state=state):
                    frame_alpha = np.asarray(build_frame(item, state).getchannel("A"))
                    authority_path = item.authority_motion_path(state)
                    authority_alpha = np.asarray(
                        Image.open(authority_path).convert("RGBA").getchannel("A")
                    )
                    outside = (authority_alpha <= 8) & (frame_alpha > 24)
                    self.assertLessEqual(int(outside.sum()), 8)

    def test_user_approved_statics_and_4w1s_are_promoted_bit_exactly(self) -> None:
        for item in ITEMS:
            runtime_static = ROOM / f"avatar_room_top_male_{item.slug}_v1.png"
            with self.subTest(slug=item.slug, state="static"):
                self.assertEqual(item.static_path.read_bytes(), runtime_static.read_bytes())
            for state in STATES:
                runtime = ROOM / "motion" / f"room_avatar_top_male_{item.slug}_v1_{state}.png"
                candidate = item.output_directory / f"{state}.png"
                with self.subTest(slug=item.slug, state=state):
                    self.assertEqual(candidate.read_bytes(), runtime.read_bytes())


if __name__ == "__main__":
    unittest.main()
