from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_male_targeted_static_repairs.py")
sys.path.insert(0, str(SCRIPT.parent))


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_male_targeted_static_repairs",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleTargetedStaticRepairsTests(unittest.TestCase):
    def test_bottom_localized_guide_exposes_only_the_canonical_body(self) -> None:
        module = load_module()
        guide = module.build_bottom_localized_body_guide()
        pixels = np.asarray(guide.convert("RGB"))

        self.assertEqual((1024, 1024), guide.size)
        colors = np.unique(pixels.reshape(-1, 3), axis=0)
        self.assertTrue(
            all(
                tuple(color) in {(0, 255, 0), (255, 0, 255)}
                for color in colors
            )
        )
        magenta = np.all(pixels == (255, 0, 255), axis=2)
        ys, xs = np.nonzero(magenta)
        self.assertLessEqual(int(xs.min()), 48)
        self.assertGreaterEqual(int(xs.max()), 970)
        self.assertEqual(0, int(ys.min()))
        self.assertGreaterEqual(int(ys.max()), 920)

    def test_pixel_heart_top_follows_canonical_neck_arms_and_waist(self) -> None:
        module = load_module()
        top = module.build_pixel_heart_top()
        alpha = np.asarray(top.getchannel("A"))

        self.assertEqual((256, 384), top.size)
        self.assertEqual("RGBA", top.mode)
        left, upper, right, lower = top.getbbox()
        self.assertGreaterEqual(left, 80)
        self.assertLessEqual(right, 175)
        self.assertGreaterEqual(upper, 216)
        self.assertLessEqual(lower, 295)

        # The canonical neck remains visibly inside one clean crew opening.
        # A tiny 1-2 px slit is not enough at runtime scale: the center of the
        # neck must stay uncovered down through the collar-contact rows.
        self.assertEqual(0, int(alpha[220, 127]))
        self.assertTrue(np.all(alpha[221:224, 124:132] <= 16))
        self.assertGreater(int(alpha[222, 104]), 180)
        self.assertGreater(int(alpha[222, 151]), 180)

        # Sleeves end before the forearms; no pasted rectangular side mass.
        self.assertEqual(0, int(alpha[268, 82]))
        self.assertEqual(0, int(alpha[268, 173]))

        # The hem meets the canonical waist instead of hanging over the pelvis.
        self.assertLessEqual(top.getbbox()[3], 286)
        hem = np.flatnonzero(alpha[282] > 180)
        self.assertGreaterEqual(len(hem), 40)
        self.assertLessEqual(int(hem[0]), 108)
        self.assertGreaterEqual(int(hem[-1]), 147)
        self.assertEqual(0, int(alpha[286:, :].max()))
        pixels = np.asarray(top)
        self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))

    def test_espresso_hair_covers_the_canonical_scalp_arc_without_back_layer(self) -> None:
        module = load_module()
        hair = module.build_espresso_hair_front()
        face = np.asarray(Image.open(module.FACE).convert("RGBA"))
        hair_pixels = np.asarray(hair)
        face_alpha = face[..., 3]
        hair_alpha = hair_pixels[..., 3]

        scalp_arc = (face_alpha > 16)
        scalp_arc[:102] = False
        scalp_arc[110:] = False
        # Low-alpha hair still lets the orange scalp outline bleed through.
        # The crown band therefore needs visually opaque coverage, not merely
        # a non-zero alpha value.
        self.assertEqual(0, int(np.count_nonzero(scalp_arc & (hair_alpha < 180))))
        self.assertEqual((256, 384), hair.size)
        self.assertEqual("RGBA", hair.mode)
        self.assertLessEqual(hair.getbbox()[1], 103)
        self.assertTrue(np.all(hair_pixels[hair_alpha == 0, :3] == 0))

    def test_navy_straight_uses_closed_crotch_and_clean_two_leg_gap(self) -> None:
        module = load_module()
        pants = module.build_navy_straight_pants()
        alpha = np.asarray(pants.getchannel("A"))

        self.assertEqual((256, 384), pants.size)
        self.assertEqual("RGBA", pants.mode)
        self.assertGreater(int(alpha[302, 127]), 220)
        self.assertGreater(int(alpha[302, 128]), 220)

        gap_widths: list[int] = []
        for y in range(303, 331):
            left = np.flatnonzero(alpha[y, :128] > 180)
            right = np.flatnonzero(alpha[y, 128:] > 180) + 128
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            gap_widths.append(int(right[0] - left[-1] - 1))

        self.assertEqual(sorted(gap_widths), gap_widths)
        self.assertLessEqual(max(b - a for a, b in zip(gap_widths, gap_widths[1:])), 2)
        self.assertEqual(0, int(alpha[333:].max()))

        pixels = np.asarray(pants)
        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))

    def test_review_closeups_never_overflow_their_220_pixel_column(self) -> None:
        module = load_module()
        image = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
        for crop in (
            (76, 205, 180, 307),
            (64, 92, 192, 178),
            (88, 278, 168, 354),
        ):
            closeup = module._fit_closeup(image, crop, max_size=(200, 420))
            self.assertLessEqual(closeup.width, 200)
            self.assertLessEqual(closeup.height, 420)

    def test_manifest_filename_uses_the_actual_review_version(self) -> None:
        module = load_module()
        self.assertEqual(
            "espresso_crop_hair_front-natural-v2-manifest.json",
            module._manifest_filename(
                "espresso_crop_hair_front",
                "natural-v2",
            ),
        )


if __name__ == "__main__":
    unittest.main()
