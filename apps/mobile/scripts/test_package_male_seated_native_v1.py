#!/usr/bin/env python3
"""TDD gates for native on-base seated composites."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_seated_native_v1.py")
SPEC = importlib.util.spec_from_file_location("male_seated_native_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeSeatedCompositeTests(unittest.TestCase):
    def test_every_bottom_has_a_transparent_canonical_composite(self) -> None:
        outputs = MODULE.expected_outputs()
        self.assertEqual(len(outputs), 19)
        for slug, path in outputs.items():
            with self.subTest(slug=slug):
                self.assertTrue(path.exists(), path)
                image = Image.open(path).convert("RGBA")
                self.assertEqual(image.size, (256, 384))
                pixels = np.asarray(image)
                alpha = pixels[..., 3] > 24
                self.assertGreater(int(alpha.sum()), 2_000)
                self.assertLess(int(alpha[:40].sum()), 20)
                self.assertFalse(np.any(pixels[pixels[..., 3] == 0, :3]))

    def test_seated_composite_keeps_full_body_and_lower_contact(self) -> None:
        for slug, path in MODULE.expected_outputs().items():
            with self.subTest(slug=slug):
                alpha = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24
                rows = np.where(alpha)[0]
                self.assertLessEqual(int(rows.min()), 110)
                self.assertGreaterEqual(int(rows.max()), 340)
                self.assertGreater(int(alpha[280:360].sum()), 500)


if __name__ == "__main__":
    unittest.main()
