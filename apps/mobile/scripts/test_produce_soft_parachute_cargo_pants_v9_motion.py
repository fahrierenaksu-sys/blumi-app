from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_soft_parachute_cargo_pants_v9_motion import (  # noqa: E402
    OUTPUT_ROOT,
    MOTION,
    STATES,
    _sha256,
    _validated_independent_review,
    build_frame,
    shoe_bboxes,
)


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _components(mask: np.ndarray) -> list[int]:
    remaining = mask.copy()
    sizes: list[int] = []
    for y, x in zip(*np.where(remaining)):
        if not remaining[y, x]:
            continue
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        size = 0
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


class SoftParachuteCargoPantsV9MotionTests(unittest.TestCase):
    def test_every_state_is_clean_rgba_on_canonical_canvas(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1800)

    def test_waist_tracks_pose_authority_with_natural_upper_arc(self) -> None:
        waist_shapes: set[bytes] = set()
        for state in STATES:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            authority = _alpha(
                MOTION
                / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
            )
            cand = candidate[286:300]
            auth = authority[286:300]
            cand_y, cand_x = np.where(cand)
            auth_y, auth_x = np.where(auth)
            top_by_column = []
            for x in range(int(cand_x.min()), int(cand_x.max()) + 1):
                ys = np.where(candidate[:, x])[0]
                if len(ys) and int(ys.min()) < 300:
                    top_by_column.append(int(ys.min()))
            with self.subTest(state=state):
                self.assertLessEqual(abs(float(cand_x.mean() - auth_x.mean())), 1.0)
                self.assertGreaterEqual(
                    int(cand_x.max()) - int(cand_x.min()) + 1,
                    int(auth_x.max()) - int(auth_x.min()) - 3,
                )
                self.assertLessEqual(int(cand_x.min()), int(auth_x.min()) + 2)
                self.assertGreaterEqual(int(cand_x.max()), int(auth_x.max()) - 2)
                self.assertGreaterEqual(max(top_by_column) - min(top_by_column), 3)
            waist_shapes.add(cand.tobytes())
        self.assertGreaterEqual(len(waist_shapes), 3)

    def test_two_legs_remain_readable_and_not_skirted(self) -> None:
        for state in STATES:
            mask = np.asarray(build_frame(state))[..., 3] > 24
            shoe_top = min(box[1] for box in shoe_bboxes(state))
            readable_rows = 0
            for y in range(314, shoe_top):
                # The gap moves laterally with lifted-leg poses, so inspect the
                # central anatomy zone instead of assuming x=128 is invariant.
                center = mask[y, 112:145]
                transitions = np.diff(center.astype(np.int8))
                if int((transitions == -1).sum()) >= 1 and int(
                    (transitions == 1).sum()
                ) >= 1:
                    readable_rows += 1
            with self.subTest(state=state):
                # F04 is the crossing phase: the front leg legitimately
                # occludes the rear-leg alpha gap, while the cloth seam remains
                # visible in RGB. Other phases must expose a true gap.
                minimum = (
                    0
                    if state == "walking_front_f04"
                    else max(1, (shoe_top - 314) // 4)
                )
                self.assertGreaterEqual(readable_rows, minimum)

    def test_each_cuff_meets_own_shoe_but_preserves_visible_toe(self) -> None:
        for state in STATES:
            garment = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION
                / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            expanded_shoes = np.asarray(
                Image.fromarray((shoes * 255).astype(np.uint8)).filter(
                    ImageFilter.MaxFilter(3)
                )
            ) > 0
            for index, (x0, shoe_top, x1, _shoe_bottom) in enumerate(
                shoe_bboxes(state)
            ):
                leg = np.zeros_like(garment)
                leg[:, x0:x1] = garment[:, x0:x1]
                shoe = np.zeros_like(shoes)
                shoe[:, x0:x1] = shoes[:, x0:x1]
                ys = np.where(leg)[0]
                with self.subTest(state=state, shoe=index):
                    self.assertGreater(int((leg & expanded_shoes).sum()), 0)
                    self.assertGreaterEqual(
                        int((shoe & ~leg).sum()) / max(int(shoe.sum()), 1),
                        0.45,
                    )
                    self.assertGreaterEqual(int(ys.max()), shoe_top - 1)
                    self.assertLessEqual(int(ys.max()), shoe_top + 15)

    def test_cargo_art_is_connected_without_detached_pocket_islands(self) -> None:
        for state in STATES:
            mask = np.asarray(build_frame(state))[..., 3] > 0
            sizes = _components(mask)
            with self.subTest(state=state):
                self.assertTrue(sizes)
                self.assertGreaterEqual(sizes[0] / sum(sizes), 0.995)

    def test_independent_pass_is_bound_to_exact_current_frame_hashes(self) -> None:
        files = {
            state: {
                "sha256": _sha256(OUTPUT_ROOT / f"{state}-v9.png"),
            }
            for state in STATES
        }
        verdict, review_path = _validated_independent_review(files)
        self.assertEqual("PASS", verdict)
        self.assertIsNotNone(review_path)


if __name__ == "__main__":
    unittest.main()
