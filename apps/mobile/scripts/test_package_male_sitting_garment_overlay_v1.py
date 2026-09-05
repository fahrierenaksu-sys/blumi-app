#!/usr/bin/env python3
"""Regression gates for garment-only seated compositing."""

import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_garment_overlay_v1.py")
SPEC = importlib.util.spec_from_file_location("male_sitting_garment_overlay_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class GarmentOnlyCompositeTests(unittest.TestCase):
    def test_overlay_never_replaces_canonical_outer_arms_or_shoes(self) -> None:
        slug = "colorblock_nylon_track_pants"
        candidate = np.asarray(MODULE.compose(slug))
        underlay = np.asarray(MODULE.canonical_underlay())
        rows, cols = np.indices(candidate.shape[:2])
        protected = (
            (((rows >= 278) & ((cols < 92) | (cols > 164))) | (rows >= MODULE.SHOE_LOCK_Y))
            & (underlay[..., 3] > 8)
        )
        self.assertTrue(np.array_equal(candidate[protected], underlay[protected]))

    def test_garment_mask_does_not_use_skin_or_shoe_source_pixels(self) -> None:
        for slug in MODULE.TARGETS:
            with self.subTest(slug=slug):
                source = np.asarray(MODULE.normalized_source(MODULE.SOURCES[slug]))
                mask = MODULE.garment_mask(slug, source)
                self.assertGreater(int(mask.sum()), 800)
                self.assertFalse(mask[MODULE.SHOE_LOCK_Y:].any())

    def test_outputs_have_clean_transparency(self) -> None:
        for slug in MODULE.TARGETS:
            with self.subTest(slug=slug):
                rgba = np.asarray(MODULE.compose(slug))
                self.assertFalse(np.any(rgba[rgba[..., 3] == 0, :3]))


if __name__ == "__main__":
    unittest.main()
