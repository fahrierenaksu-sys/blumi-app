#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_navy_straight_v2.py")
MID_BLUE_SCRIPT = Path(__file__).with_name("produce_mid_blue_straight_v2.py")


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class NavyStraightV2Tests(unittest.TestCase):
    def test_item_has_its_own_straight_geometry_and_art_contract(self) -> None:
        navy = load_module(SCRIPT, "produce_navy_straight_v2")
        mid_blue = load_module(MID_BLUE_SCRIPT, "mid_blue_for_navy_compare")

        self.assertEqual("navy_straight_pants", navy._geometry()["item"])
        self.assertEqual("male_straight", navy._geometry()["fitClass"])
        self.assertNotEqual(navy.GEOMETRY, mid_blue.GEOMETRY)
        self.assertNotEqual(navy.REFERENCE, mid_blue.REFERENCE)
        self.assertIsNot(navy._master_mask, mid_blue._master_mask)

    def test_full_length_straight_leg_reaches_the_shoe_contact_zone(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_length")
        geometry = module._geometry()
        alpha = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )

        self.assertEqual(333, geometry["anchors"]["hemExclusiveY"])
        self.assertEqual(333, module.HEM_EXCLUSIVE_Y)
        self.assertGreaterEqual(int(np.count_nonzero(alpha[331] > 16)), 40)
        self.assertGreaterEqual(int(np.count_nonzero(alpha[332] > 16)), 40)
        self.assertLessEqual(int(np.count_nonzero(alpha[332] > 16)), 48)
        self.assertEqual(0, int(alpha[333:].max()))

    def test_full_length_hem_uses_natural_full_shoe_foreground(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_straight_hem")
        geometry = module._geometry()

        self.assertEqual(
            "natural_full_shoe_foreground",
            geometry["hemMode"],
        )
        self.assertTrue(hasattr(module, "_shoe_natural_foreground_mask"))
        self.assertFalse(hasattr(module, "_shoe_center_depth_mask"))
        self.assertFalse(hasattr(module, "_trouser_cuff_depth_mask"))
        self.assertFalse(hasattr(module, "_trouser_cuff_foreground"))
        self.assertFalse(hasattr(module, "_shoe_tongue_depth_mask"))
        self.assertFalse(hasattr(module, "_shoe_vamp_occlusion_mask"))
        self.assertFalse(hasattr(module, "_shoe_foreground_mask"))

        for side in ("leftLeg", "rightLeg"):
            hem = geometry[side]["hemContour"]
            y_values = [point[1] for point in hem]
            self.assertLessEqual(max(y_values) - min(y_values), 0.5)

        left_outer_ankle = geometry["leftLeg"]["outerContour"][-1][0]
        right_outer_ankle = geometry["rightLeg"]["outerContour"][-1][0]
        self.assertGreaterEqual(left_outer_ankle, 103)
        self.assertLessEqual(right_outer_ankle, 152)

    def test_canonical_scene_keeps_the_whole_native_shoe_upper_in_front(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_scene_depth")
        preview = module.downsample_preview(module.build_master())
        composite = np.asarray(module.composite_preview(preview))
        shoe_image = module.downsample_contact_shoes(
            module.build_contact_shoes_master()
        )
        shoe = np.asarray(shoe_image)
        pants = np.asarray(preview)
        depth = np.asarray(module._shoe_natural_foreground_mask(shoe_image))
        yy = np.indices(shoe.shape[:2])[0]

        contact_zone = (
            (shoe[..., 3] > 245)
            & (yy >= 326)
            & (yy < 340)
        )
        shoe_front = contact_zone & (depth > 245) & (pants[..., 3] > 245)
        pants_cutting_shoe = contact_zone & (depth == 0) & (pants[..., 3] > 245)
        opaque_overlap = contact_zone & (pants[..., 3] > 245)
        opaque_shoe = shoe[..., 3] > 245

        self.assertTrue(np.all(depth[shoe[..., 3] == 0] == 0))
        np.testing.assert_array_equal(depth, shoe[..., 3])
        self.assertGreater(int(np.count_nonzero(depth[326:330] > 16)), 10)
        self.assertGreater(int(np.count_nonzero(depth[340:348] > 16)), 100)
        self.assertGreaterEqual(int(np.count_nonzero(shoe_front)), 140)
        self.assertEqual(
            int(np.count_nonzero(opaque_overlap)),
            int(np.count_nonzero(shoe_front)),
        )
        self.assertEqual(0, int(np.count_nonzero(pants_cutting_shoe)))

        self.assertLessEqual(
            float(
                np.abs(
                    composite[shoe_front, :3].astype(np.int16)
                    - shoe[shoe_front, :3].astype(np.int16)
                ).mean()
            ),
            2.0,
        )
        self.assertLessEqual(
            float(
                np.abs(
                    composite[opaque_shoe, :3].astype(np.int16)
                    - shoe[opaque_shoe, :3].astype(np.int16)
                ).mean()
            ),
            2.0,
        )
    def test_contact_shoes_are_reillustrated_at_4x_on_the_canonical_rig(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_shoe_art")
        master = module.build_contact_shoes_master()
        shoes = module.downsample_contact_shoes(master)
        pixels = np.asarray(shoes)
        alpha = pixels[..., 3]

        self.assertEqual(module.MASTER_CANVAS, master.size)
        self.assertEqual(module.CANVAS, shoes.size)
        self.assertEqual((102, 322, 154, 349), shoes.getbbox())
        opaque_rgb = pixels[alpha > 220, :3].astype(np.float32)
        self.assertGreater(float(opaque_rgb.std()), 20.0)
        self.assertGreater(len(np.unique(opaque_rgb.astype(np.uint8), axis=0)), 24)
        self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))

    def test_straight_width_is_stable_without_skinny_taper(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_width")
        alpha = np.asarray(module._native_mask())
        widths = []
        for y in (300, 308, 318, 326, 332):
            xs = np.flatnonzero(alpha[y] > 220)
            widths.append(int(xs.max() - xs.min() + 1))

        self.assertLessEqual(max(widths) - min(widths), 5)
        self.assertGreaterEqual(widths[-1], 48)

    def test_waist_and_crotch_follow_the_canonical_male_rig(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_rig")
        preview = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))

        for y in range(285, 290):
            pant_x = np.flatnonzero(preview[y] > 16)
            top_x = np.flatnonzero(top[y] > 16)
            self.assertGreaterEqual(int(pant_x.min()), int(top_x.min()) - 1, y)
            self.assertLessEqual(int(pant_x.max()), int(top_x.max()) + 1, y)
        for y in range(298, 303):
            self.assertGreater(preview[y, 127], 220, y)
            self.assertGreater(preview[y, 128], 220, y)

    def test_inner_leg_gap_is_one_clean_monotonic_v(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_gap")
        alpha = np.asarray(module._master_mask())
        widths = []
        for y in range(
            302 * module.SCALE,
            (module.HEM_EXCLUSIVE_Y - 2) * module.SCALE,
        ):
            left = np.flatnonzero(alpha[y, : 128 * module.SCALE] > 220)
            right = (
                np.flatnonzero(alpha[y, 128 * module.SCALE :] > 220)
                + 128 * module.SCALE
            )
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            widths.append(int(right[0] - left[-1] - 1))

        self.assertEqual(0, widths[0])
        self.assertEqual(sorted(widths), widths)
        self.assertLessEqual(max(b - a for a, b in zip(widths, widths[1:])), 2)

    def test_material_is_deep_navy_tailoring_not_mid_blue_denim(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_material")
        preview = np.asarray(module.downsample_preview(module.build_master()))
        opaque = preview[..., 3] > 220
        rgb = preview[..., :3][opaque].astype(np.float32)
        means = rgb.mean(axis=0)
        luma = rgb.mean(axis=1)

        self.assertGreater(means[2], means[0] + 20)
        self.assertGreater(means[2], means[1] + 5)
        self.assertLess(float(luma.mean()), 105.0)
        self.assertGreater(float(luma.mean()), 35.0)
        self.assertGreater(float(luma.std()), 8.0)

    def test_shoe_contact_keeps_full_length_pant_behind_low_shoe_upper(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_shoe")
        preview_alpha = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )
        shoe_alpha = np.asarray(
            Image.open(module.SHOES).convert("RGBA").getchannel("A")
        )
        overlap = (preview_alpha > 16) & (shoe_alpha > 16)

        self.assertTrue(hasattr(module, "_shoe_natural_foreground_mask"))
        self.assertEqual(0, int(np.count_nonzero(overlap[:326])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[326:333])), 190)
        self.assertLessEqual(int(np.count_nonzero(overlap[326:333])), 250)
        self.assertGreaterEqual(int(np.count_nonzero(shoe_alpha[340:] > 16)), 300)
        self.assertEqual(0, int(preview_alpha[333:].max()))

    def test_export_is_antialiased_and_has_no_hidden_rgb_residue(self) -> None:
        module = load_module(SCRIPT, "produce_navy_straight_v2_export")
        preview = module.downsample_preview(module.build_master())
        pixels = np.asarray(preview)
        alpha = pixels[..., 3]
        core = np.asarray(
            module._native_mask().filter(ImageFilter.MinFilter(3))
        ).copy()
        core[303 : module.HEM_EXCLUSIVE_Y, 123:133] = 0

        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(alpha[core == 255] > 220))
        self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
