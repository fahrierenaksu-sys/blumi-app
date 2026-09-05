#!/usr/bin/env python3
"""Regression gates for the pose-native male-bottom motion repair."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from repair_male_bottom_motion_pose_native_v2 import (  # noqa: E402
    ITEMS,
    STATES,
    build_frame,
    validate_frame,
)


class PoseNativeMaleBottomMotionTests(unittest.TestCase):
    def test_all_catalog_bottoms_have_pose_native_output_for_every_motion_state(self) -> None:
        self.assertEqual(len(ITEMS), 19)
        self.assertEqual(len(STATES), 5)
        for item in ITEMS:
            for state in STATES:
                frame = build_frame(item, state)
                self.assertEqual(frame.size, (256, 384), f"{item.slug}/{state}")
                self.assertEqual(validate_frame(item, state, frame), [], f"{item.slug}/{state}")

    def test_trouser_frames_keep_a_solid_waist_and_a_clean_inner_leg_opening(self) -> None:
        for item in ITEMS:
            if item.family == "shorts":
                continue
            pixels = np.asarray(build_frame(item, "walking_front_f03").convert("RGBA"))
            alpha = pixels[..., 3] > 24
            # The waistband must remain a continuous garment band; the leg gap
            # belongs below the crotch, never inside the body attachment rows.
            for y in range(289, 302):
                visible = np.where(alpha[y])[0]
                self.assertGreater(len(visible), 12, f"{item.slug}: empty waist row {y}")
                self.assertTrue(np.all(alpha[y, visible.min() : visible.max() + 1]), f"{item.slug}: torn waist row {y}")
            self.assertTrue(alpha[307:].any(), f"{item.slug}: no lower leg coverage")

    def test_transparent_pixels_never_keep_rgb_residue(self) -> None:
        for item in ITEMS:
            for state in STATES:
                pixels = np.asarray(build_frame(item, state).convert("RGBA"))
                self.assertFalse(np.any(pixels[pixels[..., 3] == 0, :3]), f"{item.slug}/{state}")

    def test_seated_trousers_preserve_approved_crotch_art_above_the_leg_motion_zone(self) -> None:
        for item in ITEMS:
            if item.family == "shorts":
                continue
            seated = np.asarray(build_frame(item, "sitting_front_f01").convert("RGBA"))
            static = np.asarray(Image.open(item.static_path).convert("RGBA")).copy()
            static[static[..., 3] == 0, :3] = 0
            # Sitting may pose the lower legs, but it must not synthesize a
            # solid centre patch over the approved waist/crotch illustration.
            preserved = (static[..., 3] > 24)
            preserved[item.seated_leg_start_y - 3 :] = False
            self.assertTrue(
                np.array_equal(seated[preserved], static[preserved]),
                f"{item.slug}: seated crotch art was replaced instead of preserved",
            )


if __name__ == "__main__":
    unittest.main()
