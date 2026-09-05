from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_wide_pleated_technical_trousers_v21_motion import (  # noqa: E402
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


class WidePleatedTechnicalTrousersV21MotionTests(unittest.TestCase):
    def test_pose_native_alpha_masters_have_one_clean_garment(self) -> None:
        for state in STATES:
            pixels = np.asarray(
                Image.open(
                    GENERATED_ROOT / f"{state}-garment-alpha.png"
                ).convert("RGBA")
            )
            mask = pixels[..., 3] > 24
            with self.subTest(state=state):
                self.assertEqual((1536, 1024, 4), pixels.shape)
                self.assertTrue(np.all(pixels[~mask, :3] == 0))
                self.assertFalse(mask[0].any())
                self.assertFalse(mask[-1].any())

    def test_all_frames_are_clean_canonical_rgba(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1550)

    def test_full_length_two_leg_silhouette_is_not_a_short_culotte_block(self) -> None:
        for state in STATES:
            mask = np.asarray(build_frame(state))[..., 3] > 24
            ys, xs = np.where(mask)
            height = int(ys.max()) - int(ys.min()) + 1
            width = int(xs.max()) - int(xs.min()) + 1
            minimum = 0.62 if state == "sitting_front_f01" else 0.78
            with self.subTest(state=state):
                self.assertGreaterEqual(height / width, minimum)
                self.assertTrue((~mask[310:344, 120:136]).any())

    def test_waist_is_centered_and_fills_pose_envelope(self) -> None:
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
                    int((ax.max() - ax.min() + 1) * 0.82),
                )

    def test_hems_reach_each_shoe_without_hiding_toes(self) -> None:
        for state in STATES:
            garment = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            for index, (x0, shoe_top, x1, _bottom) in enumerate(
                shoe_bboxes(state)
            ):
                leg = garment[:, x0:x1]
                shoe = shoes[:, x0:x1]
                ys = np.where(leg)[0]
                with self.subTest(state=state, shoe=index):
                    self.assertGreaterEqual(int(ys.max()), shoe_top + 6)
                    self.assertLessEqual(int(ys.max()), shoe_top + 12)
                    self.assertGreaterEqual(
                        int((shoe & ~leg).sum()) / max(int(shoe.sum()), 1),
                        0.42,
                    )

    def test_sitting_remains_pose_native(self) -> None:
        sitting = np.asarray(build_frame("sitting_front_f01"))[..., 3] > 24
        walking = np.asarray(build_frame("walking_front_f01"))[..., 3] > 24
        xor = np.logical_xor(sitting, walking)
        union = np.logical_or(sitting, walking)
        self.assertGreater(int(xor.sum()) / max(int(union.sum()), 1), 0.22)

    def test_independent_review_is_bound_to_exact_frame_hashes(self) -> None:
        files = {
            state: {
                "sha256": _sha256(OUTPUT_ROOT / f"{state}-v21.png"),
            }
            for state in STATES
        }
        verdict, review_path = _validated_independent_review(files)
        self.assertEqual("PASS", verdict)
        self.assertIsNotNone(review_path)


if __name__ == "__main__":
    unittest.main()
