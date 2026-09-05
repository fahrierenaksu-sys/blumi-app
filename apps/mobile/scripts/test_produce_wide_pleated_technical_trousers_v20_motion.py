from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_wide_pleated_technical_trousers_v20_motion import (  # noqa: E402
    MOTION,
    STATES,
    build_frame,
    shoe_bboxes,
)


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


class WidePleatedTechnicalTrousersV20MotionTests(unittest.TestCase):
    def test_all_frames_are_clean_canonical_rgba(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1700)

    def test_silhouette_reads_taller_than_culotte_v19(self) -> None:
        for state in STATES:
            mask = np.asarray(build_frame(state))[..., 3] > 24
            ys, xs = np.where(mask)
            with self.subTest(state=state):
                height = int(ys.max()) - int(ys.min()) + 1
                width = int(xs.max()) - int(xs.min()) + 1
                minimum = 0.62 if state == "sitting_front_f01" else 0.72
                self.assertGreaterEqual(height / width, minimum)

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
                    int((ax.max() - ax.min() + 1) * 0.78),
                )

    def test_each_leg_reaches_shoe_upper_but_keeps_toe_visible(self) -> None:
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
                    self.assertGreaterEqual(int(ys.max()), shoe_top + 7)
                    self.assertLessEqual(int(ys.max()), shoe_top + 13)
                    self.assertGreaterEqual(
                        int((shoe & ~leg).sum()) / max(int(shoe.sum()), 1),
                        0.4,
                    )

    def test_sitting_remains_pose_native(self) -> None:
        sitting = np.asarray(build_frame("sitting_front_f01"))[..., 3] > 24
        walking = np.asarray(build_frame("walking_front_f01"))[..., 3] > 24
        changed = int(np.logical_xor(sitting, walking).sum())
        combined = int(np.logical_or(sitting, walking).sum())
        self.assertGreater(changed / combined, 0.2)


if __name__ == "__main__":
    unittest.main()
