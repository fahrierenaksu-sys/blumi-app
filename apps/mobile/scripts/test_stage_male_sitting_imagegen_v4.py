#!/usr/bin/env python3
"""Regression checks for the image-authored seated-bottom staging path."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("stage_male_sitting_imagegen_v4.py")
SPEC = importlib.util.spec_from_file_location("stage_male_sitting_imagegen_v4", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SeatedImageGenV4Test(unittest.TestCase):
    def setUp(self) -> None:
        self.layer = MODULE.seated_layer(MODULE.load(MODULE.SOURCE))

    def test_layer_has_canonical_canvas_and_opaque_garment(self) -> None:
        self.assertEqual(self.layer.size, MODULE.CANVAS)
        self.assertIsNotNone(self.layer.getbbox())

    def test_layer_stays_inside_seated_lower_body_envelope(self) -> None:
        bbox = self.layer.getbbox()
        assert bbox is not None
        x0, y0, x1, y1 = MODULE.TARGET_BOX
        self.assertGreaterEqual(bbox[0], x0)
        self.assertLessEqual(bbox[2], x1)
        self.assertGreaterEqual(bbox[1], y0)
        self.assertLessEqual(bbox[3], y1)

    def test_candidate_composite_preserves_visible_shoe_zone(self) -> None:
        image = MODULE.composite(self.layer)
        alpha = image.getchannel("A")
        self.assertGreater(alpha.crop((90, 331, 166, 353)).getbbox()[2], 0)


if __name__ == "__main__":
    unittest.main()
