from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_replacement_tops_v2 import BODY, CANVAS, ITEMS, _fit_material


class ProduceMaleReplacementTopsV2Tests(unittest.TestCase):
    def test_every_replacement_uses_the_accepted_fit_alpha_exactly(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item["slug"]):
                generated = _fit_material(item)
                authority = Image.open(item["fit"]).convert("RGBA")
                self.assertEqual(CANVAS, generated.size)
                generated_alpha = np.asarray(generated.getchannel("A"))
                authority_alpha = np.asarray(authority.getchannel("A"))
                if item["slug"] in {
                    "fog_blue_relaxed_hoodie",
                    "indigo_denim_relaxed_workshirt",
                }:
                    self.assertTrue(np.all(generated_alpha <= authority_alpha))
                else:
                    self.assertTrue(np.array_equal(generated_alpha, authority_alpha))

    def test_workshirt_has_no_dark_rear_collar_wedge_inside_the_opening(self) -> None:
        workshirt_item = next(
            item for item in ITEMS if item["slug"] == "indigo_denim_relaxed_workshirt"
        )
        workshirt_alpha = np.asarray(_fit_material(workshirt_item).getchannel("A"))

        # The front-facing camp-collar opening must continue below the neck as
        # one clean V. The former opaque center wedge read as rear collar fabric.
        center_opening = workshirt_alpha[234:241, 128]
        self.assertLessEqual(int(center_opening.max()), 16)

    def test_hoodie_exposes_hands_and_uses_a_compact_neck_opening(self) -> None:
        hoodie_item = next(item for item in ITEMS if item["slug"] == "fog_blue_relaxed_hoodie")
        hoodie_alpha = np.asarray(_fit_material(hoodie_item).getchannel("A"))
        body_alpha = np.asarray(Image.open(BODY).convert("RGBA").getchannel("A"))
        yy, xx = np.indices(hoodie_alpha.shape)
        hand_mask = (body_alpha >= 128) & (yy >= 275) & ((xx < 106) | (xx > 150))
        sleeve_tail = (yy >= 275) & ((xx < 106) | (xx > 150))

        self.assertGreater(int(hand_mask.sum()), 150)
        self.assertLessEqual(int(hoodie_alpha[sleeve_tail].max()), 16)

        compact_opening = hoodie_alpha[212:223, 121:136]
        self.assertGreater(int((compact_opening <= 16).sum()), 45)
        self.assertLess(int((hoodie_alpha[212:230, 112:144] <= 16).sum()), 250)

        # No decorative seam may be composited back across the skin opening.
        # It reads as a grey W-shaped stain at the base of the neck.
        throat_stain_zone = hoodie_alpha[216:222, 125:132]
        self.assertLessEqual(int(throat_stain_zone.max()), 16)

    def test_replacement_layers_have_clean_transparent_rgb(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item["slug"]):
                pixels = np.asarray(_fit_material(item))
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))

    def test_replacement_layers_keep_nontrivial_material_detail(self) -> None:
        for item in ITEMS:
            with self.subTest(slug=item["slug"]):
                pixels = np.asarray(_fit_material(item))
                opaque_rgb = pixels[pixels[..., 3] >= 192, :3]
                self.assertGreater(len(np.unique(opaque_rgb, axis=0)), 160)


if __name__ == "__main__":
    unittest.main()
