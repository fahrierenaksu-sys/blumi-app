from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_v15_motion import (  # noqa: E402
    MOTION,
    STATES,
    build_frame,
    shoe_bboxes,
)


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _authority_alpha(state: str) -> np.ndarray:
    return _alpha(
        MOTION / f"room_avatar_bottom_male_navy_straight_pants_v1_{state}.png"
    )


def _component_sizes(mask: np.ndarray) -> list[int]:
    remaining = mask.copy()
    sizes: list[int] = []
    for y, x in zip(*np.where(remaining)):
        if not remaining[y, x]:
            continue
        size = 0
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        while stack:
            cy, cx = stack.pop()
            size += 1
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if (
                    0 <= ny < mask.shape[0]
                    and 0 <= nx < mask.shape[1]
                    and remaining[ny, nx]
                ):
                    remaining[ny, nx] = False
                    stack.append((ny, nx))
        sizes.append(size)
    return sorted(sizes, reverse=True)


def _central_gap_width(mask: np.ndarray, y: int) -> int:
    x = 128
    if mask[y, x]:
        return 0
    left = x
    while left > 0 and not mask[y, left - 1]:
        left -= 1
    right = x
    while right + 1 < mask.shape[1] and not mask[y, right + 1]:
        right += 1
    return right - left + 1


class ProduceCreativeUtilityBottomV15MotionTests(unittest.TestCase):
    def test_waist_band_tracks_each_pose_and_covers_pose_authority(self) -> None:
        waist_hashes: set[bytes] = set()
        for state in STATES:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            authority = _authority_alpha(state)
            cand_band = candidate[286:299]
            auth_band = authority[286:299]
            overlap = cand_band & auth_band
            union = cand_band | auth_band
            coverage = overlap.sum() / max(auth_band.sum(), 1)
            iou = overlap.sum() / max(union.sum(), 1)
            with self.subTest(state=state):
                self.assertGreaterEqual(coverage, 0.90)
                self.assertGreaterEqual(iou, 0.80)
            waist_hashes.add(cand_band.tobytes())
        self.assertGreaterEqual(len(waist_hashes), 3)

    def test_walking_thigh_envelope_stays_inside_pose_body_allowance(self) -> None:
        for state in STATES[:4]:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            authority = _authority_alpha(state)
            shoe_top = min(box[1] for box in shoe_bboxes(state))
            for y in range(298, shoe_top):
                for half in (slice(0, 128), slice(128, 256)):
                    cand_x = np.where(candidate[y, half])[0]
                    auth_x = np.where(authority[y, half])[0]
                    if not len(cand_x) or not len(auth_x):
                        continue
                    with self.subTest(state=state, y=y, half=half.start):
                        self.assertGreaterEqual(int(cand_x.min()), int(auth_x.min()) - 8)
                        self.assertLessEqual(int(cand_x.max()), int(auth_x.max()) + 8)

    def test_crotch_gap_follows_pose_anatomy_without_skin_wedge(self) -> None:
        for state in STATES:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            authority = _authority_alpha(state)
            shoe_top = min(box[1] for box in shoe_bboxes(state))
            for y in range(298, shoe_top):
                allowed = max(4, _central_gap_width(authority, y) + 2)
                with self.subTest(state=state, y=y):
                    self.assertLessEqual(_central_gap_width(candidate, y), allowed)

    def test_each_hem_contacts_its_own_shoe_and_preserves_toe(self) -> None:
        for state in STATES:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            for index, (x0, shoe_top, x1, _shoe_bottom) in enumerate(
                shoe_bboxes(state)
            ):
                region = np.zeros_like(candidate)
                region[:, x0:x1] = candidate[:, x0:x1]
                shoe_region = np.zeros_like(shoes)
                shoe_region[:, x0:x1] = shoes[:, x0:x1]
                overlap = int((region & shoe_region).sum())
                visible_shoe = int((shoe_region & ~region).sum())
                garment_y = np.where(region)[0]
                expanded_shoe = np.asarray(
                    Image.fromarray((shoe_region * 255).astype(np.uint8)).filter(
                        ImageFilter.MaxFilter(3)
                    )
                ) > 0
                adjacent_contact = int((region & expanded_shoe).sum())
                with self.subTest(state=state, shoe=index):
                    self.assertGreaterEqual(adjacent_contact, 1)
                    self.assertGreaterEqual(visible_shoe, 250)
                    overlap_limit = 0.35 if state == "sitting_front_f01" else 0.20
                    self.assertLessEqual(
                        overlap / max(shoe_region.sum(), 1), overlap_limit
                    )
                    self.assertGreaterEqual(int(garment_y.max()), shoe_top - 1)
                    max_contact_depth = 12 if state == "sitting_front_f01" else 7
                    self.assertLessEqual(
                        int(garment_y.max()), shoe_top + max_contact_depth
                    )

    def test_sitting_pelvis_and_thighs_follow_sitting_authority(self) -> None:
        state = "sitting_front_f01"
        candidate = np.asarray(build_frame(state))[..., 3] > 24
        authority = _authority_alpha(state)
        cand_band = candidate[286:322]
        auth_band = authority[286:322]
        overlap = cand_band & auth_band
        coverage = overlap.sum() / max(auth_band.sum(), 1)
        self.assertGreaterEqual(coverage, 0.90)
        for half in (slice(0, 128), slice(128, 256)):
            cand_x = np.where(cand_band[:, half])[1]
            auth_x = np.where(auth_band[:, half])[1]
            self.assertGreaterEqual(int(cand_x.min()), int(auth_x.min()) - 6)
            self.assertLessEqual(int(cand_x.max()), int(auth_x.max()) + 6)

    def test_all_frames_have_one_true_alpha_component_and_clean_transparency(
        self,
    ) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual([_component_sizes(pixels[..., 3] > 0)[0]], _component_sizes(pixels[..., 3] > 0))
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
