#!/usr/bin/env python3
"""TDD gates for re-illustrated seated masters."""

import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_sitting_reillustrated_v1.py")
SPEC = importlib.util.spec_from_file_location("male_sitting_reillustrated_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReillustratedSittingTests(unittest.TestCase):
    def test_all_reillustrated_sources_exist(self) -> None:
        self.assertEqual(len(MODULE.REILLUSTRATED), 11)
        for slug, path in MODULE.REILLUSTRATED.items():
            with self.subTest(slug=slug):
                self.assertTrue(path.exists(), path)
                with Image.open(path) as image:
                    self.assertEqual(image.size, (1024, 1536))

    def test_packaged_outputs_are_canonical_size_and_clean(self) -> None:
        outputs = MODULE.expected_outputs()
        self.assertEqual(len(outputs), 19)
        for slug in MODULE.REILLUSTRATED:
            with self.subTest(slug=slug):
                with Image.open(outputs[slug]) as image:
                    rgba = np.asarray(image.convert("RGBA"))
                self.assertEqual(rgba.shape[:2], (384, 256))
                self.assertGreater(int((rgba[..., 3] > 24).sum()), 2_000)
                self.assertFalse(np.any(rgba[rgba[..., 3] == 0, :3]))
                # Shoes must remain visible at the bottom of the composite.
                self.assertGreater(int((rgba[330:360, ..., 3] > 24).sum()), 250)

    def test_center_inseam_is_not_carved_by_packager(self) -> None:
        # The generated master owns its inseam. A fixed transparent strip here
        # exposes the canonical skin layer and recreates the rejected orange
        # vertical artifact between the legs.
        mask = MODULE._garment_mask("mid_blue_straight_jeans")
        self.assertTrue(bool(mask[320, 128]))


if __name__ == "__main__":
    unittest.main()
