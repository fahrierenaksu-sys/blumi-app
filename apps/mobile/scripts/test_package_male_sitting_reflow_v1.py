#!/usr/bin/env python3
"""TDD gates for family-aware seated bottom reflow candidates."""

import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_sitting_reflow_v1.py")
SPEC = importlib.util.spec_from_file_location("male_sitting_reflow_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SittingReflowTests(unittest.TestCase):
    def test_reflow_covers_only_the_failed_items(self) -> None:
        self.assertEqual(len(MODULE.FAILED_ITEMS), 11)
        self.assertTrue(set(MODULE.FAILED_ITEMS).issubset({item.slug for item in MODULE.ITEMS}))

    def test_reflow_outputs_keep_two_leg_contact_and_no_full_width_bridge(self) -> None:
        outputs = MODULE.expected_outputs()
        self.assertEqual(len(outputs), 19)
        for slug in MODULE.FAILED_ITEMS:
            with self.subTest(slug=slug):
                path = outputs[slug]
                self.assertTrue(path.exists(), path)
                rgba = np.asarray(Image.open(path).convert("RGBA"))
                self.assertEqual(rgba.shape[:2], (384, 256))
                alpha = rgba[..., 3] > 24
                self.assertGreater(int(alpha[300:340].sum()), 400)
                # A seated trouser/short must retain a readable center opening
                # near the shoe contact; a single opaque bridge is a hard fail.
                bottom = np.asarray(MODULE.reflow_bottom(MODULE.PROFILES[slug]))
                bottom_alpha = bottom[..., 3] > 24
                self.assertLess(int(bottom_alpha[324:340, 126:130].sum()), 28)
                self.assertFalse(np.any(rgba[rgba[..., 3] == 0, :3]))


if __name__ == "__main__":
    unittest.main()
