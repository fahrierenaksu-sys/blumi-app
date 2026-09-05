#!/usr/bin/env python3
"""TDD checks for the no-warp seated-bottom candidate staging path."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("stage_male_bottom_sitting_reanchor_v5.py")
SPEC = importlib.util.spec_from_file_location("stage_male_bottom_sitting_reanchor_v5", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SeatedReanchorV5Test(unittest.TestCase):
    def test_every_known_bottom_has_an_opaque_canonical_static_layer(self) -> None:
        self.assertEqual(len(MODULE.SLUGS), 19)
        for slug in MODULE.SLUGS:
            layer = MODULE.static_layer(slug)
            self.assertEqual(layer.size, MODULE.CANVAS)
            self.assertIsNotNone(layer.getbbox(), slug)

    def test_reanchor_is_pixel_identical_to_approved_static_art(self) -> None:
        slug = "charcoal_tapered_chinos"
        self.assertEqual(MODULE.static_layer(slug).tobytes(), MODULE.load(
            MODULE.ROOM / f"avatar_room_bottom_male_{slug}_v1.png"
        ).tobytes())

    def test_seated_composite_keeps_shoes_visible_in_both_halves(self) -> None:
        image = MODULE.composite(MODULE.static_layer("charcoal_tapered_chinos"))
        alpha = image.getchannel("A")
        self.assertIsNotNone(alpha.crop((82, 328, 128, 354)).getbbox())
        self.assertIsNotNone(alpha.crop((128, 328, 174, 354)).getbbox())

    def test_washed_denim_drops_only_the_transparent_colored_halo(self) -> None:
        source = MODULE.load(MODULE.ROOM / "avatar_room_bottom_male_washed_baggy_denim_v1.png")
        candidate = MODULE.static_layer("washed_baggy_denim")
        source_core = source.getchannel("A").point(lambda alpha: 255 if alpha >= 36 else 0)
        self.assertEqual(source_core.getbbox(), candidate.getchannel("A").getbbox())
        self.assertFalse(any(0 < alpha < 36 for *_, alpha in candidate.getdata()))


if __name__ == "__main__":
    unittest.main()
