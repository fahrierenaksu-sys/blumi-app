from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_track_glasses_casual_hair_candidates import (
    ACCESSORY_OUTPUTS,
    HAIR_OUTPUTS,
    REVIEW_BOARD,
    TOP_OUTPUT,
    build_glasses,
    build_hair,
    build_track_top,
    produce,
)


class ProduceMaleTrackGlassesCasualHairCandidatesTests(unittest.TestCase):
    def assert_clean_transparency(self, image: Image.Image) -> None:
        pixels = np.asarray(image.convert("RGBA"))
        transparent_rgb = pixels[pixels[..., 3] == 0, :3]
        self.assertTrue(np.all(transparent_rgb == 0))

    def test_track_top_preserves_native_registration_and_closed_collar(self) -> None:
        top = build_track_top()

        self.assertEqual((256, 384), top.size)
        self.assertEqual("RGBA", top.mode)
        self.assertEqual((78, 219, 177, 298), top.getchannel("A").getbbox())
        self.assertGreater(top.getpixel((128, 224))[3], 180)
        self.assert_clean_transparency(top)

    def test_each_glasses_profile_is_small_and_seated_on_eye_line(self) -> None:
        expected_boxes = {
            "slim_oval_glasses": (101, 161, 155, 175),
            "soft_rectangular_glasses": (102, 160, 154, 175),
            "translucent_wrap_glasses": (101, 160, 155, 176),
        }

        for slug, expected_box in expected_boxes.items():
            with self.subTest(slug=slug):
                glasses = build_glasses(slug)
                self.assertEqual(expected_box, glasses.getchannel("A").getbbox())
                self.assertLessEqual(expected_box[3], 176)
                self.assert_clean_transparency(glasses)

    def test_each_casual_hair_fills_canonical_skull_envelope(self) -> None:
        expected_boxes = {
            "casual_side_swept_crop": (72, 102, 186, 199),
            "casual_soft_messy_fringe": (74, 102, 184, 199),
            "casual_relaxed_short_waves": (72, 103, 186, 198),
        }

        for slug, expected_box in expected_boxes.items():
            with self.subTest(slug=slug):
                hair = build_hair(slug)
                self.assertEqual(expected_box, hair.getchannel("A").getbbox())
                self.assertGreater(hair.getpixel((128, 106))[3], 180)
                self.assert_clean_transparency(hair)

    def test_producer_keeps_all_seven_items_candidate_only(self) -> None:
        manifest = produce()

        self.assertEqual(7, len(manifest["items"]))
        self.assertTrue(manifest["candidateOnly"])
        self.assertFalse(manifest["runtimePromoted"])
        self.assertFalse(manifest["explicitUserApproval"])

        for output in [TOP_OUTPUT, *ACCESSORY_OUTPUTS.values(), *HAIR_OUTPUTS.values()]:
            with Image.open(output) as image:
                self.assertEqual((256, 384), image.size)
                self.assertEqual("RGBA", image.mode)
        with Image.open(REVIEW_BOARD) as board:
            self.assertEqual("RGB", board.mode)
            self.assertEqual((1680, 1520), board.size)


if __name__ == "__main__":
    unittest.main()
