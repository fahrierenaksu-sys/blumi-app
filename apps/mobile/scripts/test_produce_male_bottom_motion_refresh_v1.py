from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_bottom_motion_refresh_v1 import (  # noqa: E402
    CANVAS,
    ITEMS,
    ROOM,
    STATES,
    build_frame,
    creative_gap_mask,
)


class ProduceMaleBottomMotionRefreshV1Tests(unittest.TestCase):
    @staticmethod
    def _component_count(mask: np.ndarray) -> int:
        remaining = mask.copy()
        count = 0
        height, width = remaining.shape
        for y in range(height):
            for x in range(width):
                if not remaining[y, x]:
                    continue
                count += 1
                stack = [(y, x)]
                remaining[y, x] = False
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < height and 0 <= nx < width and remaining[ny, nx]:
                            remaining[ny, nx] = False
                            stack.append((ny, nx))
        return count

    def test_refresh_scope_contains_the_19_current_bottoms(self) -> None:
        self.assertEqual(19, len(ITEMS))
        self.assertEqual(19, len({item.slug for item in ITEMS}))

    def test_walking_f01_is_the_exact_current_static_bottom(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item.slug):
                frame = build_frame(item, "walking_front_f01")
                static = Image.open(item.static_path).convert("RGBA")
                self.assertEqual(
                    hashlib.sha256(static.tobytes()).digest(),
                    hashlib.sha256(frame.tobytes()).digest(),
                )

    def test_each_bottom_builds_five_clean_pose_specific_frames(self) -> None:
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

    def test_pose_transfer_does_not_spill_outside_the_existing_rig_envelope(self) -> None:
        for item in ITEMS:
            for state in STATES[1:]:
                with self.subTest(slug=item.slug, state=state):
                    frame_alpha = np.asarray(build_frame(item, state).getchannel("A"))
                    authority_alpha = np.asarray(
                        Image.open(item.authority_path(state))
                        .convert("RGBA")
                        .getchannel("A")
                    )
                    outside = (authority_alpha <= 8) & (frame_alpha > 24)
                    self.assertLessEqual(int(outside.sum()), 12)

    def test_every_frame_keeps_two_leg_readability_or_is_an_intentional_short(self) -> None:
        for item in ITEMS:
            for state in STATES:
                with self.subTest(slug=item.slug, state=state):
                    alpha = np.asarray(build_frame(item, state).getchannel("A"))
                    center_gap = alpha[304:344, 126:130]
                    self.assertGreater(int((center_gap <= 24).sum()), 8)

    def test_creative_utility_motion_never_reintroduces_pixels_inside_the_clean_v(self) -> None:
        item = next(item for item in ITEMS if item.slug == "creative_utility_bottom")
        for state in STATES[1:]:
            with self.subTest(state=state):
                frame_alpha = np.asarray(build_frame(item, state).getchannel("A"))
                mask = creative_gap_mask(item, state)
                self.assertEqual(0, int(frame_alpha[mask > 0].max()))
                self.assertEqual(1, self._component_count(frame_alpha > 0))

    def test_18_approved_static_bound_refreshes_are_promoted_bit_exactly(self) -> None:
        for item in ITEMS:
            if item.slug == "creative_utility_bottom":
                continue
            for state in STATES:
                runtime = ROOM / "motion" / f"room_avatar_bottom_male_{item.slug}_v1_{state}.png"
                candidate = item.output_directory / f"{state}.png"
                with self.subTest(slug=item.slug, state=state):
                    self.assertEqual(candidate.read_bytes(), runtime.read_bytes())


if __name__ == "__main__":
    unittest.main()
