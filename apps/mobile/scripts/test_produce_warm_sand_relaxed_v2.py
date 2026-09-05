#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_warm_sand_relaxed_v2.py")
SLIM_SCRIPT = Path(__file__).with_name("produce_charcoal_redraw_v2.py")


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class WarmSandRelaxedV2Tests(unittest.TestCase):
    def test_profile_is_relaxed_baggy_and_materially_wider_than_slim(self) -> None:
        relaxed = load_module(SCRIPT, "produce_warm_sand_relaxed_v2")
        slim = load_module(SLIM_SCRIPT, "produce_charcoal_redraw_v2_for_width")
        geometry = relaxed._geometry()
        relaxed_mask = np.asarray(relaxed._native_mask())
        slim_mask = np.asarray(slim._native_mask())

        self.assertEqual("male_relaxed_baggy", geometry["fitClass"])
        for y, minimum_growth in ((300, 6), (316, 6), (325, 4)):
            relaxed_width = int(np.count_nonzero(relaxed_mask[y] > 220))
            slim_width = int(np.count_nonzero(slim_mask[y] > 220))
            self.assertGreaterEqual(relaxed_width - slim_width, minimum_growth, y)

    def test_inner_leg_gap_opens_as_a_continuous_v(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_v")
        alpha = np.asarray(module._master_mask())
        widths = []
        for y in range(302 * module.SCALE, 326 * module.SCALE):
            left = np.flatnonzero(alpha[y, : 128 * module.SCALE] > 220)
            right = np.flatnonzero(alpha[y, 128 * module.SCALE :] > 220) + 128 * module.SCALE
            widths.append(int(right[0] - left[-1] - 1))

        self.assertEqual(0, widths[0])
        self.assertGreaterEqual(widths[-1], 14)
        self.assertEqual(sorted(widths), widths)
        self.assertLessEqual(max(b - a for a, b in zip(widths, widths[1:])), 2)

    def test_relaxed_silhouette_stays_vertical_instead_of_ballooning(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_vertical")
        alpha = np.asarray(module._native_mask())
        bounds = []
        for y in (300, 316, 325):
            xs = np.flatnonzero(alpha[y] > 220)
            bounds.append((int(xs.min()), int(xs.max())))

        lefts = [left for left, _ in bounds]
        rights = [right for _, right in bounds]
        self.assertEqual(sorted(lefts), lefts)
        self.assertEqual(sorted(rights, reverse=True), rights)
        widths = [right - left + 1 for left, right in bounds]
        self.assertLessEqual(max(widths) - min(widths), 6)

        lower = np.flatnonzero(alpha[334] > 220)
        self.assertLessEqual(int(lower.min()), 105)
        self.assertGreaterEqual(int(lower.max()), 150)
        self.assertGreaterEqual(int(np.count_nonzero(alpha[334] > 220)), 38)

    def test_waist_corners_tuck_under_tee_before_relaxed_hip_opens(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_waist_fit")
        preview = np.asarray(module.downsample_preview(module.build_master()))[..., 3]
        top = np.asarray(Image.open(module.TOP).convert("RGBA"))[..., 3]

        for y in range(285, 290):
            pant_x = np.flatnonzero(preview[y] > 16)
            top_x = np.flatnonzero(top[y] > 16)
            self.assertGreater(len(pant_x), 0, y)
            self.assertGreater(len(top_x), 0, y)
            self.assertGreaterEqual(int(pant_x.min()), int(top_x.min()) - 1, y)
            self.assertLessEqual(int(pant_x.max()), int(top_x.max()) + 1, y)

        # The hip opens progressively below the shirt instead of creating a
        # sharp side step immediately under the tucked waistband.
        upper_hip_x = np.flatnonzero(preview[294] > 220)
        relaxed_hip_x = np.flatnonzero(preview[300] > 220)
        self.assertLessEqual(int(upper_hip_x.max() - upper_hip_x.min() + 1), 54)
        self.assertGreaterEqual(int(relaxed_hip_x.max() - relaxed_hip_x.min() + 1), 58)

    def test_master_outer_contour_is_continuous_not_upscaled_pixel_stairs(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_contour")
        alpha = np.asarray(module.build_master().getchannel("A"))
        left_edges = []
        for y in range(1172, 1300):
            xs = np.flatnonzero(alpha[y] > 220)
            self.assertGreater(len(xs), 0, y)
            left_edges.append(int(xs[0]))

        self.assertTrue(any(edge % module.SCALE != 0 for edge in left_edges))
        self.assertLessEqual(max(abs(b - a) for a, b in zip(left_edges, left_edges[1:])), 1)

    def test_art_is_warm_sand_with_readable_painterly_variation(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_art")
        preview = np.asarray(module.downsample_preview(module.build_master()))
        opaque = preview[..., 3] > 220
        rgb = preview[..., :3][opaque].astype(np.float32)
        means = rgb.mean(axis=0)
        luma = rgb.mean(axis=1)

        self.assertGreater(means[0], means[1] + 8)
        self.assertGreater(means[1], means[2] + 8)
        self.assertGreater(float(luma.std()), 8.0)
        self.assertGreater(float(luma.mean()), 120.0)

    def test_preview_creates_natural_waist_and_shoe_aware_drape(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_fit")
        preview = module.downsample_preview(module.build_master())
        base = Image.open(module.BASE).convert("RGBA")
        top = Image.open(module.TOP).convert("RGBA")
        shoes = Image.open(module.SHOES).convert("RGBA")
        preview_alpha = np.asarray(preview.getchannel("A"))
        top_alpha = np.asarray(top.getchannel("A"))
        shoe_alpha = np.asarray(shoes.getchannel("A"))

        for y in range(294, 326):
            for x in range(96, 160):
                if base.getpixel((x, y))[3] > 16:
                    self.assertGreater(preview.getpixel((x, y))[3], 16, (x, y))

        # The tee and waistband physically share a short contact zone. With
        # the top rendered above the bottom, this removes a skin strip or
        # doubled pasted-on waist edge.
        waist_contact = (preview_alpha[286:294] > 16) & (top_alpha[286:294] > 16)
        self.assertGreaterEqual(int(np.count_nonzero(waist_contact)), 100)

        # The accepted long-trouser contact uses one shoe-aware hem contour.
        # It may cover a small ankle band, but the shoe is never re-rendered on
        # top and the overlap cannot become a flat stacked rectangle.
        self.assertEqual(
            "bottomShoeAwareDrape", module._geometry()["occlusionRole"]
        )
        self.assertEqual(339, module.HEM_EXCLUSIVE_Y)
        self.assertFalse(hasattr(module, "_shoe_foreground_mask"))
        overlap = (preview_alpha > 16) & (shoe_alpha > 16)
        self.assertEqual(0, int(np.count_nonzero(overlap[:326])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[326:339])), 250)
        self.assertLessEqual(int(np.count_nonzero(overlap[326:339])), 450)

        visible_shoe_below_hem = (shoe_alpha[module.HEM_EXCLUSIVE_Y :] > 16)
        self.assertGreaterEqual(int(np.count_nonzero(visible_shoe_below_hem)), 350)
        self.assertIsNone(
            preview.getchannel("A").crop((0, module.HEM_EXCLUSIVE_Y, 256, 384)).getbbox()
        )

    def test_native_export_keeps_premium_antialias_and_closed_crotch_bridge(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_alpha")
        preview = module.downsample_preview(module.build_master())
        alpha = np.asarray(preview.getchannel("A"))
        core = np.asarray(module._native_mask().filter(ImageFilter.MinFilter(3))).copy()
        core[303:326, 122:134] = 0

        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.all(alpha[core == 255] > 220))
        for y in range(298, 303):
            self.assertGreater(alpha[y, 127], 220, (127, y))
            self.assertGreater(alpha[y, 128], 220, (128, y))

    def test_each_relaxed_hem_has_one_clean_broad_rounded_cuff(self) -> None:
        module = load_module(SCRIPT, "produce_warm_sand_relaxed_v2_hem")
        alpha = np.asarray(module._master_mask())

        # Inspect only the authored hem arc. The outermost transition belongs
        # to the vertical leg contour and is covered by the separate continuous
        # outer-contour contract above.
        for start_x, end_x in ((105, 124), (131, 150)):
            bottoms = []
            for x in range(start_x * module.SCALE, (end_x + 1) * module.SCALE):
                ys = np.flatnonzero(alpha[:, x] > 220)
                self.assertGreater(len(ys), 0, x)
                bottoms.append(int(ys[-1]))
            # Long/relaxed weight comes from the vertical leg body. The cuff
            # itself remains a normal broad seam with only a subpixel bow.
            self.assertGreaterEqual(max(bottoms) - min(bottoms), 14)
            self.assertLessEqual(max(bottoms) - min(bottoms), 18)
            self.assertLessEqual(max(abs(b - a) for a, b in zip(bottoms, bottoms[1:])), 2)


if __name__ == "__main__":
    unittest.main()
