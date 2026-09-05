from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_replacement_tops_v1 import (
    HOODIE_OUTPUT,
    MANIFEST,
    REVIEW_BOARD,
    WORKSHIRT_OUTPUT,
    build_hoodie,
    build_workshirt,
    produce,
)


class ProduceMaleReplacementTopsV1Tests(unittest.TestCase):
    def assert_clean_layer(self, image: Image.Image) -> None:
        pixels = np.asarray(image.convert("RGBA"))
        self.assertEqual((256, 384), image.size)
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))

    def test_hoodie_uses_canonical_sweatshirt_fit_with_seated_hood(self) -> None:
        hoodie = build_hoodie()

        self.assertEqual((77, 207, 179, 301), hoodie.getchannel("A").getbbox())
        self.assertGreater(hoodie.getpixel((128, 212))[3], 180)
        self.assertGreater(hoodie.getpixel((128, 224))[3], 180)
        self.assert_clean_layer(hoodie)

    def test_workshirt_preserves_open_collar_and_canonical_short_sleeves(self) -> None:
        workshirt = build_workshirt()

        self.assertEqual((82, 213, 174, 302), workshirt.getchannel("A").getbbox())
        self.assertEqual(0, workshirt.getpixel((128, 220))[3])
        self.assertGreater(workshirt.getpixel((128, 245))[3], 180)
        self.assert_clean_layer(workshirt)

    def test_producer_keeps_both_replacements_candidate_only(self) -> None:
        manifest = produce()

        self.assertEqual(2, len(manifest["items"]))
        self.assertTrue(manifest["candidateOnly"])
        self.assertFalse(manifest["runtimePromoted"])
        self.assertFalse(manifest["explicitUserApproval"])
        for path in (HOODIE_OUTPUT, WORKSHIRT_OUTPUT):
            with Image.open(path) as image:
                self.assertEqual("RGBA", image.mode)
        self.assertTrue(REVIEW_BOARD.is_file())
        self.assertTrue(MANIFEST.is_file())


if __name__ == "__main__":
    unittest.main()
