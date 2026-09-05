from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_wardrobe_66_motion_refresh_v1 import (  # noqa: E402
    CANVAS,
    MOTION_ITEMS,
    STATES,
    build_frame,
    load_inventory,
    split_leg_frame,
)


class ProduceMaleWardrobe66MotionRefreshV1Tests(unittest.TestCase):
    def test_scope_is_exactly_the_unresolved_48(self) -> None:
        inventory = load_inventory()
        self.assertEqual(48, len(MOTION_ITEMS))
        self.assertEqual(
            {item["slug"] for item in MOTION_ITEMS},
            {
                item["slug"]
                for item in inventory
                if item["slug"] not in {
                    "monochrome_street_tailoring_bottom",
                    "creative_utility_bottom",
                    "soft_parachute_cargo_pants",
                    "colorblock_nylon_track_pants",
                    "warm_sand_relaxed_pants",
                    "midnight_relaxed_tailoring_trousers",
                    "wide_pleated_technical_trousers",
                    "navy_straight_pants",
                    "mid_blue_straight_jeans",
                    "charcoal_tapered_chinos",
                    "milk_tea_court",
                    "cloud_white_trainers",
                    "cocoa_penny_loafers",
                    "dusty_blue_canvas_sneakers",
                    "retro_colorblock_runner",
                    "chunky_skate_sneakers",
                    "suede_penny_mules",
                    "lightweight_trail_sneakers",
                }
            },
        )

    def test_each_item_builds_five_clean_frames(self) -> None:
        for item in MOTION_ITEMS:
            hashes: set[str] = set()
            for state in STATES:
                with self.subTest(slug=item["slug"], state=state):
                    frame = build_frame(item, state)
                    self.assertEqual(CANVAS, frame.size)
                    pixels = np.asarray(frame)
                    self.assertIsNotNone(frame.getchannel("A").getbbox())
                    self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                    hashes.add(hashlib.sha256(frame.tobytes()).hexdigest())
            minimum_variants = 2 if item["category"] in {"top", "bottom"} else 1
            self.assertGreaterEqual(len(hashes), minimum_variants)

    def test_static_frame_is_bit_exact_selected_candidate(self) -> None:
        for item in MOTION_ITEMS:
            with self.subTest(slug=item["slug"]):
                source = Image.open(item["static_path"]).convert("RGBA")
                frame = build_frame(item, "static")
                self.assertEqual(source.tobytes(), frame.tobytes())

    def test_bottom_split_preserves_intentional_center_gap(self) -> None:
        for item in MOTION_ITEMS:
            if item["category"] != "bottom":
                continue
            for state in STATES:
                with self.subTest(slug=item["slug"], state=state):
                    alpha = np.asarray(build_frame(item, state).getchannel("A"))
                    center = alpha[296:356, 125:131]
                    self.assertGreater(int((center <= 24).sum()), 8)

    def test_split_helper_only_relocates_leg_regions(self) -> None:
        source = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        source.putalpha(Image.new("L", CANVAS, 255))
        moved = split_leg_frame(source, "walking_front_f02", 300, 350)
        self.assertEqual(255, moved.getpixel((10, 10))[3])
        self.assertEqual(255, moved.getpixel((128, 250))[3])


if __name__ == "__main__":
    unittest.main()
