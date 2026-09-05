#!/usr/bin/env python3
"""TDD checks for the seated shoe-contoured trouser hem."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("extract_male_sitting_hem_contour_v7.py")
SPEC = importlib.util.spec_from_file_location("extract_male_sitting_hem_contour_v7", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SeatedHemContourV7Test(unittest.TestCase):
    def setUp(self) -> None:
        self.bottom = MODULE.extract_bottom(MODULE.load(MODULE.MASTER))

    def test_uses_the_canonical_native_canvas(self) -> None:
        self.assertEqual(self.bottom.size, MODULE.CANVAS)
        self.assertIsNotNone(self.bottom.getbbox())

    def test_hem_does_not_cover_the_canonical_shoe_tongues(self) -> None:
        alpha = np.asarray(self.bottom)[..., 3]
        shoe_top = MODULE.shoe_topline()
        for x in range(93, 163):
            self.assertFalse((alpha[shoe_top[x] + MODULE.HEM_CONTACT_DEPTH + 2 :, x] > 24).any(), x)

    def test_trouser_legs_remain_separate_above_shoes(self) -> None:
        alpha = np.asarray(self.bottom)[..., 3]
        self.assertFalse((alpha[329:338, 127:130] > 24).all())


if __name__ == "__main__":
    unittest.main()
