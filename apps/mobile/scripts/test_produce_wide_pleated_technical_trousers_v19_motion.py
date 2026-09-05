from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_wide_pleated_technical_trousers_v19_motion import (  # noqa: E402
    GENERATED_ROOT,
    MOTION,
    STATES,
    build_frame,
    shoe_bboxes,
)


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


class WidePleatedTechnicalTrousersV19MotionTests(unittest.TestCase):
    def test_pose_native_sources_have_clean_alpha_borders(self) -> None:
        for state in STATES:
            pixels = np.asarray(
                Image.open(
                    GENERATED_ROOT / f"{state}-garment-alpha.png"
                ).convert("RGBA")
            )
            with self.subTest(state=state):
                self.assertGreaterEqual(pixels.shape[0], 1500)
                self.assertGreaterEqual(pixels.shape[1], 1000)
                self.assertTrue(np.all(pixels[[0, -1], :, 3] == 0))
                self.assertTrue(np.all(pixels[:, [0, -1], 3] == 0))

    def test_every_registered_frame_is_clean_canonical_rgba(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1800)

    def test_waist_follows_canonical_pose_envelope(self) -> None:
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
                self.assertLessEqual(int(cx.min()), int(ax.min()) + 2)
                self.assertGreaterEqual(int(cx.max()), int(ax.max()) - 2)

    def test_wide_hems_contact_shoes_and_preserve_toe_read(self) -> None:
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
                ys = np.where(leg)[0]
                with self.subTest(state=state, shoe=index):
                    self.assertGreater(int((leg & expanded).sum()), 0)
                    self.assertGreaterEqual(
                        int((shoe & ~leg).sum()) / max(int(shoe.sum()), 1),
                        0.4,
                    )
                    self.assertGreaterEqual(int(ys.max()), shoe_top - 1)
                    self.assertLessEqual(int(ys.max()), shoe_top + 15)

    def test_sitting_and_walking_are_not_reused_silhouettes(self) -> None:
        sitting = np.asarray(build_frame("sitting_front_f01"))[..., 3] > 24
        walking = np.asarray(build_frame("walking_front_f01"))[..., 3] > 24
        changed = int(np.logical_xor(sitting, walking).sum())
        combined = int(np.logical_or(sitting, walking).sum())
        self.assertGreater(changed / combined, 0.2)


if __name__ == "__main__":
    unittest.main()
