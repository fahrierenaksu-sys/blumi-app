#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_charcoal_redraw_v2.py")


def load_module():
    spec = importlib.util.spec_from_file_location("produce_charcoal_redraw_v2", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load charcoal redraw producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CharcoalRedrawV2Tests(unittest.TestCase):
    def test_inner_leg_gap_opens_as_one_continuous_v_not_a_block_step(self) -> None:
        module = load_module()
        alpha = np.asarray(module._master_mask())
        widths = []
        for y in range(302 * module.SCALE, module.HEM_EXCLUSIVE_Y * module.SCALE):
            left = np.flatnonzero(alpha[y, : 128 * module.SCALE] > 220)
            right = np.flatnonzero(alpha[y, 128 * module.SCALE :] > 220) + 128 * module.SCALE
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            widths.append(int(right[0] - left[-1] - 1))

        self.assertEqual(0, widths[0])
        self.assertGreaterEqual(widths[-1], 14)
        self.assertLessEqual(max(b - a for a, b in zip(widths, widths[1:])), 2)
        self.assertEqual(sorted(widths), widths)

    def test_master_leg_contours_are_continuous_not_native_pixel_stairs(self) -> None:
        module = load_module()
        alpha = np.asarray(module.build_master().getchannel("A"))
        left_edges = []
        for y in range(1172, module.HEM_EXCLUSIVE_Y * module.SCALE - 4):
            xs = np.flatnonzero(alpha[y] > 220)
            self.assertGreater(len(xs), 0, y)
            left_edges.append(int(xs[0]))

        self.assertTrue(any(edge % module.SCALE != 0 for edge in left_edges))

    def test_quality_pass_is_neutral_charcoal_with_readable_fabric_variation(self) -> None:
        module = load_module()
        preview = np.asarray(module.downsample_preview(module.build_master()))
        opaque = preview[..., 3] > 220
        garment_rgb = preview[..., :3][opaque].astype(np.float32)
        channel_means = garment_rgb.mean(axis=0)
        luma = garment_rgb.mean(axis=1)

        self.assertLessEqual(float(np.ptp(channel_means)), 4.0, channel_means)
        self.assertGreater(float(luma.std()), 8.0)
        self.assertLess(float(luma.mean()), 72.0)

    def test_quality_pass_preserves_geometry_with_premium_antialiased_edges(self) -> None:
        module = load_module()
        approved_mask = module._native_mask()
        preview = module.downsample_preview(module.build_master())
        alpha = np.asarray(preview.getchannel("A"))
        approved_core = np.asarray(approved_mask.filter(ImageFilter.MinFilter(3))).copy()
        approved_core[303 : module.HEM_EXCLUSIVE_Y, 124:132] = 0

        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(alpha[approved_core == 255] > 220))
        self.assertEqual(0, int(alpha[module.HEM_EXCLUSIVE_Y :, :].max()))

    def test_master_uses_approved_geometry_without_base_or_shoe_leaks(self) -> None:
        module = load_module()
        master = module.build_master()
        preview = module.downsample_preview(master)

        self.assertEqual((1024, 1536), master.size)
        self.assertEqual((256, 384), preview.size)
        self.assertEqual((408, 1144, 616, 1316), master.getchannel("A").getbbox())

        base = Image.open(module.BASE).convert("RGBA")
        shoes = Image.open(module.SHOES).convert("RGBA")
        for y in range(294, 326):
            for x in range(100, 156):
                if base.getpixel((x, y))[3] > 16:
                    self.assertGreater(preview.getpixel((x, y))[3], 16, (x, y))
        for y in range(326):
            for x in range(256):
                if shoes.getpixel((x, y))[3] > 16:
                    self.assertLessEqual(preview.getpixel((x, y))[3], 16, (x, y))

    def test_master_has_no_detached_alpha_or_translucent_interior_tears(self) -> None:
        module = load_module()
        preview = module.downsample_preview(module.build_master())
        alpha = preview.getchannel("A")

        self.assertIsNone(
            alpha.crop((0, module.HEM_EXCLUSIVE_Y, 256, 384)).getbbox()
        )
        for y in range(298, 303):
            self.assertGreater(alpha.getpixel((127, y)), 220, (127, y))
            self.assertGreater(alpha.getpixel((128, y)), 220, (128, y))
        for x in range(126, 130):
            self.assertLessEqual(
                alpha.getpixel((x, module.HEM_EXCLUSIVE_Y - 1)),
                32,
                (x, module.HEM_EXCLUSIVE_Y - 1),
            )

    def test_narrow_hem_makes_a_small_natural_shoe_aware_break(self) -> None:
        module = load_module()
        geometry = module._geometry()
        preview = module.downsample_preview(module.build_master())
        preview_alpha = np.asarray(preview.getchannel("A"))
        shoe_alpha = np.asarray(
            Image.open(module.SHOES).convert("RGBA").getchannel("A")
        )

        self.assertEqual("bottomShoeAwareNarrowBreak", geometry["occlusionRole"])
        self.assertEqual(326, geometry["anchors"]["shoeUpperStartY"])
        self.assertEqual(329, geometry["anchors"]["hemExclusiveY"])
        self.assertEqual(329, module.HEM_EXCLUSIVE_Y)
        self.assertFalse(hasattr(module, "_shoe_foreground_mask"))

        overlap = (preview_alpha > 16) & (shoe_alpha > 16)
        self.assertEqual(0, int(np.count_nonzero(overlap[:326])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[326:329])), 45)
        self.assertLessEqual(int(np.count_nonzero(overlap[326:329])), 130)
        self.assertGreaterEqual(
            int(np.count_nonzero(shoe_alpha[module.HEM_EXCLUSIVE_Y :] > 16)),
            350,
        )

        # The center tongue/gap stays readable while the two narrow cuffs make
        # contact at the sides; this is not a flat rectangle over the shoe.
        self.assertLessEqual(int(preview_alpha[327, 127]), 32)
        self.assertLessEqual(int(preview_alpha[327, 128]), 32)
        self.assertGreater(int(np.count_nonzero(preview_alpha[327, 103:125] > 16)), 12)
        self.assertGreater(int(np.count_nonzero(preview_alpha[327, 131:153] > 16)), 12)


if __name__ == "__main__":
    unittest.main()
