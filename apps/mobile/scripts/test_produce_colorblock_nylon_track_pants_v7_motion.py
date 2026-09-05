from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_colorblock_nylon_track_pants_v7_motion import (  # noqa: E402
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


class ColorblockNylonTrackPantsV7MotionTests(unittest.TestCase):
    def test_frames_are_clean_runtime_rgba(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            with self.subTest(state=state):
                self.assertEqual((384, 256, 4), pixels.shape)
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                self.assertGreater(int((pixels[..., 3] > 24).sum()), 1700)

    def test_design_keeps_plum_body_and_light_side_panels(self) -> None:
        for state in STATES:
            pixels = np.asarray(build_frame(state))
            visible = pixels[..., 3] > 24
            red = pixels[..., 0].astype(np.int16)
            green = pixels[..., 1].astype(np.int16)
            blue = pixels[..., 2].astype(np.int16)
            plum = visible & (red > green + 20) & (blue > green + 12)
            light_panel = visible & (red > 170) & (green > 150) & (blue > 130)
            with self.subTest(state=state):
                self.assertGreater(int(plum.sum()), 850)
                self.assertGreater(int(light_panel.sum()), 80)

    def test_natural_waist_arc_is_centered_on_pose(self) -> None:
        for state in STATES:
            mask = np.asarray(build_frame(state))[..., 3] > 24
            authority = _alpha(
                MOTION
                / f"room_avatar_bottom_male_colorblock_nylon_track_pants_v1_{state}.png"
            )
            _cy, cx = np.where(mask[286:300])
            _ay, ax = np.where(authority[286:300])
            top = []
            for x in range(int(cx.min()), int(cx.max()) + 1):
                ys = np.where(mask[:, x])[0]
                if len(ys) and int(ys.min()) < 300:
                    top.append(int(ys.min()))
            with self.subTest(state=state):
                self.assertLessEqual(abs(float(cx.mean() - ax.mean())), 1.0)
                self.assertGreaterEqual(max(top) - min(top), 3)

    def test_each_hem_contacts_shoe_without_hiding_toe(self) -> None:
        for state in STATES:
            garment = np.asarray(build_frame(state))[..., 3] > 24
            shoes = _alpha(
                MOTION
                / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
            )
            expanded = np.asarray(
                Image.fromarray((shoes * 255).astype(np.uint8)).filter(
                    ImageFilter.MaxFilter(3)
                )
            ) > 0
            for index, (x0, shoe_top, x1, shoe_bottom) in enumerate(
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
                        0.45,
                    )
                    self.assertGreaterEqual(int(ys.max()), shoe_top - 1)
                    self.assertLessEqual(int(ys.max()), shoe_bottom)

    def test_independent_pass_is_bound_to_current_frame_hashes(self) -> None:
        files = {
            state: {
                "sha256": _sha256(OUTPUT_ROOT / f"{state}-v7.png"),
            }
            for state in STATES
        }
        verdict, review_path = _validated_independent_review(files)
        self.assertEqual("PASS", verdict)
        self.assertIsNotNone(review_path)


if __name__ == "__main__":
    unittest.main()
