#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_straight_utility_tailored_v2.py")
NAVY_SCRIPT = Path(__file__).with_name("produce_navy_straight_v2.py")


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class StraightUtilityTailoredV2Tests(unittest.TestCase):
    def test_item_has_an_independent_straight_utility_contract(self) -> None:
        utility = load_module(SCRIPT, "produce_utility_tailored_contract")
        navy = load_module(NAVY_SCRIPT, "navy_for_utility_compare")

        self.assertEqual(
            "straight_utility_tailored_trousers",
            utility._geometry()["item"],
        )
        self.assertEqual("male_straight", utility._geometry()["fitClass"])
        self.assertNotEqual(utility.GEOMETRY, navy.GEOMETRY)
        self.assertNotEqual(utility.REFERENCE, navy.REFERENCE)
        self.assertIsNot(utility._master_mask, navy._master_mask)
        self.assertFalse(hasattr(utility, "RUNTIME_OUTPUT"))
        self.assertEqual(
            "c6ac93f3a6f23014c78d2341ea8a663a54cd598a23e1b063bd95c30157a224ff",
            hashlib.sha256(utility.PREMIUM_ART.read_bytes()).hexdigest(),
        )

    def test_geometry_follows_the_canonical_waist_crotch_and_leg_gap(self) -> None:
        module = load_module(SCRIPT, "produce_utility_tailored_geometry")
        geometry = module._geometry()
        alpha = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))

        self.assertEqual(286, geometry["anchors"]["waistTopY"])
        self.assertEqual(302, geometry["anchors"]["crotchBridgeClosedThroughY"])
        self.assertEqual(303, geometry["anchors"]["innerLegGapStartsY"])
        self.assertEqual(337, geometry["anchors"]["hemExclusiveY"])
        for y in range(298, 303):
            self.assertGreater(alpha[y, 127], 220, y)
            self.assertGreater(alpha[y, 128], 220, y)
        pant_waist = np.flatnonzero(alpha[286] > 220)
        top_waist = np.flatnonzero(top[286] > 16)
        self.assertLessEqual(int(pant_waist.min()), int(top_waist.min()))
        self.assertGreaterEqual(int(pant_waist.max()), int(top_waist.max()))
        self.assertEqual(0, int(alpha[337:].max()))

    def test_utility_straight_leg_is_stable_but_distinct_from_navy(self) -> None:
        utility = load_module(SCRIPT, "produce_utility_tailored_width")
        navy = load_module(NAVY_SCRIPT, "navy_for_utility_width")
        utility_alpha = np.asarray(utility._native_mask())
        navy_alpha = np.asarray(navy._native_mask())

        widths = []
        for y in (300, 308, 318, 326, 336):
            xs = np.flatnonzero(utility_alpha[y] > 220)
            widths.append(int(xs.max() - xs.min() + 1))
        self.assertLessEqual(max(widths) - min(widths), 5)
        self.assertGreaterEqual(widths[-1], 52)
        self.assertFalse(np.array_equal(utility_alpha, navy_alpha))
        for side in ("leftLeg", "rightLeg"):
            hem_y = [point[1] for point in utility._geometry()[side]["hemContour"]]
            self.assertGreaterEqual(max(hem_y) - min(hem_y), 0.5)
            self.assertLessEqual(max(hem_y) - min(hem_y), 1.5)

    def test_utility_pockets_are_olive_and_garment_is_warm_graphite(self) -> None:
        module = load_module(SCRIPT, "produce_utility_tailored_material")
        pixels = np.asarray(module.downsample_preview(module.build_master()))
        alpha = pixels[..., 3]
        garment = pixels[(alpha > 220) & (np.indices(alpha.shape)[0] >= 288), :3]
        left_pocket = pixels[303:322, 101:111, :3]
        right_pocket = pixels[303:322, 145:155, :3]
        pocket = np.concatenate((left_pocket.reshape(-1, 3), right_pocket.reshape(-1, 3)))
        olive = (
            (pixels[..., 1].astype(np.int16) > pixels[..., 2].astype(np.int16) + 6)
            & (pixels[..., 1].astype(np.int16) >= pixels[..., 0].astype(np.int16) - 4)
            & (alpha > 220)
        )

        means = garment.astype(np.float32).mean(axis=0)
        pocket_means = pocket.astype(np.float32).mean(axis=0)
        self.assertLess(abs(float(means[0] - means[1])), 18.0)
        self.assertGreater(float(pocket_means[1]), float(pocket_means[2]) + 6.0)
        self.assertGreater(float(pocket_means[1]), float(pocket_means[0]) - 4.0)
        self.assertGreater(len(np.unique(garment, axis=0)), 220)
        self.assertGreaterEqual(int(np.count_nonzero(olive[303:317])), 80)
        self.assertLessEqual(int(np.count_nonzero(olive[318:])), 12)
        olive_y, olive_x = np.nonzero(olive[303:317])
        self.assertGreaterEqual(int(olive_x.min()), 102)
        self.assertLessEqual(int(olive_x.max()), 153)
        inner = pixels[303:330, 123:133]
        inner_luma = inner[..., :3].astype(np.float32).mean(axis=2)
        inner_opaque = inner[..., 3] > 220
        self.assertGreater(float(inner_luma[inner_opaque].min()), 42.0)

    def test_complete_native_shoe_silhouette_sits_in_front_of_the_hem(self) -> None:
        module = load_module(SCRIPT, "produce_utility_tailored_shoe_depth")
        preview = module.downsample_preview(module.build_master())
        shoes = module.downsample_contact_shoes(module.build_contact_shoes_master())
        depth = np.asarray(module._shoe_natural_foreground_mask(shoes))
        shoe = np.asarray(shoes)
        composite = np.asarray(module.composite_preview(preview))
        base = np.asarray(Image.open(module.BASE).convert("RGBA"))
        opaque_shoe = shoe[..., 3] > 245

        self.assertEqual("natural_full_shoe_foreground", module._geometry()["hemMode"])
        self.assertEqual((104, 326, 152, 348), shoes.getbbox())
        np.testing.assert_array_equal(depth, shoe[..., 3])
        self.assertLessEqual(
            float(
                np.abs(
                    composite[opaque_shoe, :3].astype(np.int16)
                    - shoe[opaque_shoe, :3].astype(np.int16)
                ).mean()
            ),
            2.0,
        )
        ankle = np.s_[332:340, 98:158]
        visible_base = (
            (base[ankle][..., 3] > 220)
            & (
                np.abs(
                    composite[ankle][..., :3].astype(np.int16)
                    - base[ankle][..., :3].astype(np.int16)
                ).max(axis=2)
                <= 2
            )
        )
        self.assertLessEqual(int(np.count_nonzero(visible_base)), 2)

    def test_export_is_4x_antialiased_and_has_no_hidden_rgb(self) -> None:
        module = load_module(SCRIPT, "produce_utility_tailored_export")
        master = module.build_master()
        preview = module.downsample_preview(master)
        pixels = np.asarray(preview)
        alpha = pixels[..., 3]
        core = np.asarray(
            module._native_mask().filter(ImageFilter.MinFilter(3))
        ).copy()
        core[303:module.HEM_EXCLUSIVE_Y, 123:133] = 0

        self.assertEqual(module.MASTER_CANVAS, master.size)
        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(alpha[core == 255] > 220))
        self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
