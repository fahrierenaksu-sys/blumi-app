#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_mid_blue_straight_v2.py")
SLIM_SCRIPT = Path(__file__).with_name("produce_charcoal_redraw_v2.py")
RELAXED_SCRIPT = Path(__file__).with_name("produce_warm_sand_relaxed_v2.py")


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MidBlueStraightV2Tests(unittest.TestCase):
    def test_profile_is_straight_and_never_reuses_slim_or_relaxed_geometry(
        self,
    ) -> None:
        straight = load_module(SCRIPT, "produce_mid_blue_straight_v2")
        slim = load_module(SLIM_SCRIPT, "charcoal_for_straight_compare")
        relaxed = load_module(RELAXED_SCRIPT, "relaxed_for_straight_compare")
        geometry = straight._geometry()

        self.assertEqual("male_straight", geometry["fitClass"])
        self.assertIsNot(straight._native_mask, slim._native_mask)
        self.assertIsNot(straight._native_mask, relaxed._native_mask)

        straight_alpha = np.asarray(straight._native_mask())
        slim_alpha = np.asarray(slim._native_mask())
        relaxed_alpha = np.asarray(relaxed._native_mask())
        for y in (300, 316, 326):
            straight_width = int(np.count_nonzero(straight_alpha[y] > 220))
            slim_width = int(np.count_nonzero(slim_alpha[y] > 220))
            relaxed_width = int(np.count_nonzero(relaxed_alpha[y] > 220))
            self.assertGreaterEqual(straight_width, slim_width + 2, y)
            self.assertLessEqual(straight_width, relaxed_width + 2, y)

    def test_straight_leg_keeps_nearly_constant_width_without_skinny_taper(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_width")
        alpha = np.asarray(module._native_mask())
        widths = []
        for y in (300, 308, 318, 326):
            xs = np.flatnonzero(alpha[y] > 220)
            widths.append(int(xs.max() - xs.min() + 1))

        self.assertLessEqual(max(widths) - min(widths), 5)
        self.assertGreaterEqual(widths[-1], 48)

    def test_full_length_straight_inseam_reaches_the_lower_shoe_contact_zone(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_length")
        geometry = module._geometry()
        alpha = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )

        self.assertGreaterEqual(
            geometry["anchors"]["hemExclusiveY"]
            - geometry["anchors"]["waistTopY"],
            54,
        )
        self.assertEqual(340, geometry["anchors"]["hemExclusiveY"])
        row_337 = int(np.count_nonzero(alpha[337] > 16))
        row_338 = int(np.count_nonzero(alpha[338] > 16))
        row_339 = int(np.count_nonzero(alpha[339] > 16))
        self.assertGreaterEqual(row_337, 38)
        self.assertGreaterEqual(row_338, 18)
        self.assertLessEqual(row_338, 30)
        self.assertGreaterEqual(row_339, 4)
        self.assertLess(row_339, row_338)
        self.assertEqual(0, int(alpha[340:].max()))

    def test_inner_leg_gap_opens_as_one_narrow_monotonic_v(self) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_v")
        alpha = np.asarray(module._master_mask())
        widths = []
        for y in range(302 * module.SCALE, 339 * module.SCALE):
            left = np.flatnonzero(alpha[y, : 128 * module.SCALE] > 220)
            right = (
                np.flatnonzero(alpha[y, 128 * module.SCALE :] > 220)
                + 128 * module.SCALE
            )
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            widths.append(int(right[0] - left[-1] - 1))

        self.assertEqual(0, widths[0])
        self.assertGreaterEqual(widths[-1], 20)
        self.assertEqual(sorted(widths), widths)
        self.assertLessEqual(max(b - a for a, b in zip(widths, widths[1:])), 2)

    def test_waist_tucks_under_tee_before_straight_hip_release(self) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_waist")
        preview = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))

        for y in range(285, 290):
            pant_x = np.flatnonzero(preview[y] > 16)
            top_x = np.flatnonzero(top[y] > 16)
            self.assertGreaterEqual(int(pant_x.min()), int(top_x.min()) - 1, y)
            self.assertLessEqual(int(pant_x.max()), int(top_x.max()) + 1, y)

        hip = np.flatnonzero(preview[300] > 220)
        self.assertGreaterEqual(int(hip.max() - hip.min() + 1), 54)

    def test_master_contour_is_continuous_at_4x(self) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_contour")
        alpha = np.asarray(module.build_master().getchannel("A"))
        left_edges = []
        for y in range(1172, module.HEM_EXCLUSIVE_Y * module.SCALE - 4):
            xs = np.flatnonzero(alpha[y] > 220)
            self.assertGreater(len(xs), 0, y)
            left_edges.append(int(xs[0]))

        self.assertTrue(any(edge % module.SCALE != 0 for edge in left_edges))
        self.assertLessEqual(
            max(abs(b - a) for a, b in zip(left_edges, left_edges[1:])),
            1,
        )

    def test_art_is_mid_blue_denim_with_premium_variation(self) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_art")
        preview = np.asarray(module.downsample_preview(module.build_master()))
        opaque = preview[..., 3] > 220
        rgb = preview[..., :3][opaque].astype(np.float32)
        means = rgb.mean(axis=0)
        luma = rgb.mean(axis=1)

        self.assertGreater(means[2], means[0] + 18)
        self.assertGreater(means[2], means[1] + 5)
        self.assertGreater(float(luma.std()), 12.0)
        self.assertGreater(float(luma.mean()), 70.0)

    def test_straight_hem_has_controlled_shoe_break_and_keeps_shoe_readable(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_shoe")
        geometry = module._geometry()
        preview_alpha = np.asarray(
            module.downsample_preview(module.build_master()).getchannel("A")
        )
        shoe_alpha = np.asarray(
            Image.open(module.SHOES).convert("RGBA").getchannel("A")
        )
        overlap = (preview_alpha > 16) & (shoe_alpha > 16)

        self.assertEqual(
            "bottomStraightShoeAwareBreak",
            geometry["occlusionRole"],
        )
        self.assertEqual(340, module.HEM_EXCLUSIVE_Y)
        self.assertFalse(hasattr(module, "_shoe_foreground_mask"))
        self.assertEqual(0, int(np.count_nonzero(overlap[:326])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[326:340])), 250)
        self.assertLessEqual(int(np.count_nonzero(overlap[326:340])), 450)
        self.assertGreaterEqual(int(np.count_nonzero(shoe_alpha[340:] > 16)), 300)
        self.assertLessEqual(int(preview_alpha[337, 127]), 32)
        self.assertLessEqual(int(preview_alpha[337, 128]), 32)

    def test_export_has_antialias_closed_crotch_and_no_alpha_below_hem(
        self,
    ) -> None:
        module = load_module(SCRIPT, "produce_mid_blue_straight_v2_alpha")
        preview = module.downsample_preview(module.build_master())
        alpha = np.asarray(preview.getchannel("A"))
        core = np.asarray(
            module._native_mask().filter(ImageFilter.MinFilter(3))
        ).copy()
        core[303 : module.HEM_EXCLUSIVE_Y, 123:133] = 0

        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(alpha[core == 255] > 220))
        self.assertEqual(0, int(alpha[module.HEM_EXCLUSIVE_Y :, :].max()))
        for y in range(298, 303):
            self.assertGreater(alpha[y, 127], 220, (127, y))
            self.assertGreater(alpha[y, 128], 220, (128, y))


if __name__ == "__main__":
    unittest.main()
