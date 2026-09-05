#!/usr/bin/env python3
"""TDD checks for the canonical seated on-base reference render."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("stage_male_sitting_on_base_reference_v6.py")
SPEC = importlib.util.spec_from_file_location("stage_male_sitting_on_base_reference_v6", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SeatedOnBaseReferenceV6Test(unittest.TestCase):
    def test_locked_reference_uses_canonical_canvas_and_opaque_background(self) -> None:
        image = MODULE.build_reference()
        self.assertEqual(image.size, MODULE.CANVAS)
        self.assertEqual(image.getpixel((0, 0))[3], 255)

    def test_reference_retains_both_sitting_shoe_anchors(self) -> None:
        image = MODULE.build_reference()
        self.assertNotEqual(image.getpixel((104, 341)), image.getpixel((0, 0)))
        self.assertNotEqual(image.getpixel((151, 341)), image.getpixel((0, 0)))


if __name__ == "__main__":
    unittest.main()
