from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_charcoal_tapered_chinos_v4_motion import (  # noqa: E402
    GENERATED_ROOT,
    MOTION,
    OUTPUT_ROOT,
    STATES,
    _sha256,
    _validated_independent_review,
    build_frame,
    shoe_bboxes,
)


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


class CharcoalTaperedChinosV4MotionTests(unittest.TestCase):
    def test_pose_native_masters_are_rgba_with_clean_transparent_corners(self) -> None:
        for state in STATES:
            path = GENERATED_ROOT / f"{state}-garment-alpha.png"
            pixels = np.asarray(Image.open(path).convert("RGBA"))
            with self.subTest(state=state):
                self.assertEqual((1536, 1024, 4), pixels.shape)
                self.assertTrue(np.all(pixels[[0, -1], :, 3] == 0))
                self.assertTrue(np.all(pixels[:, [0, -1], 3] == 0))

    def test_every_frame_is_clean_canonical_rgba(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1300)

    def test_waist_tracks_pose_authority_without_side_wings(self) -> None:
        for state in STATES:
            candidate = np.asarray(build_frame(state))[..., 3] > 24
            authority = _alpha(
                MOTION
                / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
            )
            _cy, cx = np.where(candidate[286:300])
            _ay, ax = np.where(authority[286:300])
            with self.subTest(state=state):
                self.assertLessEqual(abs(float(cx.mean() - ax.mean())), 1.0)
                self.assertGreaterEqual(
                    int(cx.max()) - int(cx.min()) + 1,
                    int((ax.max() - ax.min() + 1) * 0.76),
                )
                self.assertLessEqual(int(cx.min()), int(ax.min()) + 7)
                self.assertGreaterEqual(int(cx.max()), int(ax.max()) - 7)

    def test_two_full_length_legs_keep_a_clean_gap(self) -> None:
        for state in STATES:
            garment = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            with self.subTest(state=state):
                lower = garment[306:346]
                self.assertTrue(np.any(~lower[:, 116:140], axis=0).any())
                self.assertGreater(int((garment & shoes).sum()), 0)

    def test_hems_touch_shoe_uppers_but_keep_toes_visible(self) -> None:
        for state in STATES:
            garment = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            expanded = np.asarray(
                Image.fromarray((shoes * 255).astype(np.uint8)).filter(
                    ImageFilter.MaxFilter(3)
                )
            ) > 0
            for index, (x0, shoe_top, x1, _bottom) in enumerate(
                shoe_bboxes(state)
            ):
                leg = np.zeros_like(garment)
                leg[:, x0:x1] = garment[:, x0:x1]
                shoe = np.zeros_like(shoes)
                shoe[:, x0:x1] = shoes[:, x0:x1]
                with self.subTest(state=state, shoe=index):
                    self.assertGreater(int((leg & expanded).sum()), 0)
                    self.assertGreaterEqual(
                        int((shoe & ~leg).sum()) / max(int(shoe.sum()), 1),
                        0.48,
                    )

    def test_sitting_is_not_reused_walking_geometry(self) -> None:
        sitting = np.asarray(build_frame("sitting_front_f01"))[..., 3] > 24
        walking = np.asarray(build_frame("walking_front_f01"))[..., 3] > 24
        union = np.logical_or(sitting, walking)
        xor = np.logical_xor(sitting, walking)
        self.assertGreater(int(xor.sum()) / max(int(union.sum()), 1), 0.22)

    def test_independent_review_is_bound_to_exact_frame_hashes(self) -> None:
        files = {
            state: {
                "sha256": _sha256(OUTPUT_ROOT / f"{state}-v4.png"),
            }
            for state in STATES
        }
        verdict, review_path = _validated_independent_review(files)
        self.assertEqual("PASS", verdict)
        self.assertIsNotNone(review_path)


if __name__ == "__main__":
    unittest.main()
