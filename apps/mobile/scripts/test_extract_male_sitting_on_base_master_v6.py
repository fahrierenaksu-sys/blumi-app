#!/usr/bin/env python3
"""TDD checks for extracting a real seated-on-base bottom candidate."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("extract_male_sitting_on_base_master_v6.py")
SPEC = importlib.util.spec_from_file_location("extract_male_sitting_on_base_master_v6", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExtractMaleSittingOnBaseV6Test(unittest.TestCase):
    def setUp(self) -> None:
        self.bottom = MODULE.extract_bottom(MODULE.load(MODULE.MASTER))

    def test_bottom_is_a_canonical_transparent_layer(self) -> None:
        self.assertEqual(self.bottom.size, MODULE.CANVAS)
        self.assertIsNotNone(self.bottom.getbbox())
        self.assertEqual(self.bottom.getpixel((0, 0))[3], 0)

    def test_bottom_never_reaches_below_shoe_throat_zone(self) -> None:
        bbox = self.bottom.getbbox()
        assert bbox is not None
        self.assertLessEqual(bbox[3], MODULE.GARMENT_ZONE[3])

    def test_canonical_shoes_remain_visible_above_extracted_bottom(self) -> None:
        composite = MODULE.canonical_composite(self.bottom)
        self.assertNotEqual(composite.getpixel((105, 341)), composite.getpixel((0, 0)))
        self.assertNotEqual(composite.getpixel((151, 341)), composite.getpixel((0, 0)))


if __name__ == "__main__":
    unittest.main()
