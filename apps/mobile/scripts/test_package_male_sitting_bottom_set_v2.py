"""Candidate-only package contract for all seated male-bottom item masters."""

from pathlib import Path
import importlib.util
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_bottom_set_v2.py")
SPEC = importlib.util.spec_from_file_location("package_sitting_bottom_set", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageMaleSittingBottomSetV2Tests(unittest.TestCase):
    def test_covers_each_bottom_sku_once(self) -> None:
        keys = [item.key for item in MODULE.ITEMS]
        self.assertEqual(len(keys), 19)
        self.assertEqual(len(keys), len(set(keys)))

    def test_each_candidate_is_on_the_canonical_canvas_and_keeps_shoes_clear(self) -> None:
        shoe_top = MODULE.shoe_topline()
        for item in MODULE.ITEMS:
            layer = MODULE.extract_bottom(MODULE.load(item.master), item.is_short)
            self.assertEqual(layer.size, MODULE.CANVAS, item.key)
            self.assertIsNotNone(layer.getbbox(), item.key)
            alpha = np.asarray(layer)[..., 3]
            for x in range(93, 163):
                self.assertFalse((alpha[shoe_top[x] + 2 :, x] > 24).any(), f"{item.key}:{x}")

    def test_known_shorts_keep_the_lower_leg_open(self) -> None:
        for item in MODULE.ITEMS:
            if not item.is_short:
                continue
            alpha = np.asarray(MODULE.extract_bottom(MODULE.load(item.master), item.is_short))[..., 3]
            self.assertFalse((alpha[320:338, 96:160] > 24).any(), item.key)


if __name__ == "__main__":
    unittest.main()
