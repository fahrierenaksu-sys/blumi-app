#!/usr/bin/env python3
"""TDD gates for male-bottom sitting masters authored on the seated base."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from repair_male_bottom_sitting_pose_native_v3 import (  # noqa: E402
    ITEMS,
    SITTING_STATE,
    build_sitting_frame,
    seated_leg_masks,
    validate_sitting_frame,
)


class PoseNativeMaleBottomSittingTests(unittest.TestCase):
    def test_each_non_short_bottom_is_authored_against_two_canonical_seated_legs(self) -> None:
        for item in ITEMS:
            if item.family == "shorts":
                continue
            frame = build_sitting_frame(item)
            left, right = seated_leg_masks(item)
            alpha = np.asarray(frame.convert("RGBA"))[..., 3] > 24
            for side, target in (("left", left), ("right", right)):
                target_pixels = int(target.sum())
                covered = int((alpha & target).sum())
                self.assertGreaterEqual(
                    covered / target_pixels,
                    0.92,
                    f"{item.slug}: {side} seated thigh is not covered by the garment",
                )

    def test_sitting_preserves_approved_waist_and_crotch_art_without_center_fill(self) -> None:
        for item in ITEMS:
            if item.family == "shorts":
                continue
            errors = validate_sitting_frame(item, build_sitting_frame(item))
            self.assertEqual(errors, [], item.slug)

    def test_remapped_non_green_material_never_exposes_chroma_residue(self) -> None:
        for item in ITEMS:
            if item.family == "shorts" or item.slug == "creative_utility_bottom":
                continue
            pixels = np.asarray(build_sitting_frame(item).convert("RGBA"))
            visible = pixels[..., 3] > 24
            rgb = pixels[..., :3].astype(np.int16)
            green = (
                (rgb[..., 1] > 120)
                & (rgb[..., 1] > rgb[..., 0] + 50)
                & (rgb[..., 1] > rgb[..., 2] + 50)
            )
            self.assertFalse(np.any(green & visible), f"{item.slug}: chroma residue")


if __name__ == "__main__":
    unittest.main()
