from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_sunglasses_and_hair_wave2 import (
    HAIR_OUTPUTS,
    REVIEW_BOARD,
    SUNGLASSES_OUTPUTS,
    build_hair,
    build_sunglasses,
    produce,
)


class ProduceMaleSunglassesAndHairWave2Tests(unittest.TestCase):
    def assert_clean_transparency(self, image: Image.Image) -> None:
        pixels = np.asarray(image.convert("RGBA"))
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))

    def test_two_sunglasses_use_complete_slightly_larger_eye_line_profiles(self) -> None:
        expected = {
            "tortoiseshell_smoke_sunglasses": (94, 155, 162, 181),
            "matte_black_panto_sunglasses": (94, 155, 162, 181),
        }

        for slug, target in expected.items():
            with self.subTest(slug=slug):
                layer = build_sunglasses(slug)
                self.assertEqual(target, layer.getchannel("A").getbbox())
                self.assertGreater(layer.getpixel((128, 163))[3], 180)
                self.assertGreater(layer.getpixel((101, 166))[3], 80)
                self.assertGreater(layer.getpixel((155, 166))[3], 80)
                self.assert_clean_transparency(layer)

    def test_three_hairs_have_distinct_canonical_skull_fits(self) -> None:
        expected = {
            "copper_compact_quiff": (73, 102, 185, 195),
            "ash_blond_low_fade_crop": (72, 101, 185, 195),
            "blue_black_short_curls": (71, 101, 186, 196),
        }

        for slug, target in expected.items():
            with self.subTest(slug=slug):
                layer = build_hair(slug)
                self.assertEqual(target, layer.getchannel("A").getbbox())
                self.assertGreater(layer.getpixel((128, target[1] + 4))[3], 180)
                self.assert_clean_transparency(layer)

    def test_producer_keeps_all_five_items_candidate_only(self) -> None:
        manifest = produce()

        self.assertEqual(5, len(manifest["items"]))
        self.assertTrue(manifest["candidateOnly"])
        self.assertFalse(manifest["runtimePromoted"])
        self.assertFalse(manifest["explicitUserApproval"])
        for output in [*SUNGLASSES_OUTPUTS.values(), *HAIR_OUTPUTS.values()]:
            with Image.open(output) as image:
                self.assertEqual((256, 384), image.size)
                self.assertEqual("RGBA", image.mode)
        with Image.open(REVIEW_BOARD) as board:
            self.assertEqual("RGB", board.mode)
            self.assertEqual((2100, 760), board.size)


if __name__ == "__main__":
    unittest.main()
