from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_male_five_neck_repairs.py")
sys.path.insert(0, str(SCRIPT.parent))


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_male_five_neck_repairs",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleFiveNeckRepairsTests(unittest.TestCase):
    def test_exact_five_live_products_are_targeted(self) -> None:
        module = load_module()
        self.assertEqual(
            {
                "cream_basic_tee",
                "diagonal_seam_zip_mock_neck",
                "soft_varsity_knit_jacket",
                "cropped_cocoa_moto_jacket",
                "asymmetric_utility_overshirt",
            },
            set(module.PRODUCTS),
        )

    def test_repairs_preserve_every_pixel_outside_the_collar_zone(self) -> None:
        module = load_module()
        for slug in module.PRODUCTS:
            with self.subTest(slug=slug):
                source = module.load_selected_top(slug)
                before = source.tobytes()
                repaired = module.build_repaired_top(slug)
                self.assertEqual(before, source.tobytes())
                source_pixels = np.asarray(source)
                repaired_pixels = np.asarray(repaired)
                changed = np.any(source_pixels != repaired_pixels, axis=2)
                allowed = np.zeros(changed.shape, dtype=bool)
                allowed[212:232, 110:148] = True
                self.assertEqual(
                    0,
                    int(np.count_nonzero(changed & ~allowed)),
                )

    def test_every_repaired_top_keeps_native_canvas_and_clean_alpha(self) -> None:
        module = load_module()
        for slug in module.PRODUCTS:
            with self.subTest(slug=slug):
                repaired = module.build_repaired_top(slug)
                pixels = np.asarray(repaired)
                alpha = pixels[..., 3]
                self.assertEqual((256, 384), repaired.size)
                self.assertEqual("RGBA", repaired.mode)
                self.assertTrue(np.all(pixels[alpha == 0, :3] == 0))

    def test_ring_and_high_collar_products_expose_one_continuous_neck_core(
        self,
    ) -> None:
        module = load_module()
        core_ranges = {
            "soft_varsity_knit_jacket": (219, 224),
            "cropped_cocoa_moto_jacket": (219, 224),
            "asymmetric_utility_overshirt": (219, 222),
        }
        for slug, (start, end) in core_ranges.items():
            with self.subTest(slug=slug):
                alpha = np.asarray(
                    module.build_repaired_top(slug).getchannel("A")
                )
                self.assertTrue(np.all(alpha[start:end, 126:131] <= 16))

    def test_front_collar_shoulders_survive_the_rear_plane_removal(self) -> None:
        module = load_module()
        probes = {
            "diagonal_seam_zip_mock_neck": ((119, 221), (137, 221)),
            "soft_varsity_knit_jacket": ((118, 225), (138, 225)),
            "cropped_cocoa_moto_jacket": ((118, 225), (138, 225)),
            "asymmetric_utility_overshirt": ((118, 222), (138, 222)),
        }
        for slug, points in probes.items():
            with self.subTest(slug=slug):
                alpha = module.build_repaired_top(slug).getchannel("A")
                self.assertTrue(
                    all(alpha.getpixel(point) >= 96 for point in points)
                )

    def test_closed_mock_neck_has_a_front_seat_not_a_punched_hole(self) -> None:
        module = load_module()
        alpha = module.build_repaired_top(
            "diagonal_seam_zip_mock_neck"
        ).getchannel("A")
        self.assertGreaterEqual(alpha.getpixel((128, 217)), 96)
        self.assertGreaterEqual(alpha.getpixel((128, 223)), 96)

    def test_moto_and_varsity_remove_rear_dark_collar_planes(self) -> None:
        module = load_module()
        probes = {
            "cropped_cocoa_moto_jacket": ((118, 218), (138, 218)),
            "soft_varsity_knit_jacket": ((120, 218), (136, 218)),
        }
        for slug, points in probes.items():
            with self.subTest(slug=slug):
                alpha = module.build_repaired_top(slug).getchannel("A")
                self.assertTrue(
                    all(alpha.getpixel(point) <= 16 for point in points)
                )

    def test_composites_use_the_continuous_face_not_the_split_runtime_face(
        self,
    ) -> None:
        module = load_module()
        composite = module.compose_repaired("cream_basic_tee")
        repaired_face = Image.open(module.CONTINUOUS_FACE).convert("RGBA")
        self.assertEqual(0, repaired_face.getpixel((128, 222))[3])
        self.assertGreater(sum(composite.getpixel((128, 222))[:3]), 600)

    def test_review_board_keeps_the_full_closeup_visible(self) -> None:
        module = load_module()
        composites = {
            slug: module.compose_repaired(slug)
            for slug in module.PRODUCTS
        }
        board = module._render_board(composites)
        self.assertGreaterEqual(board.height, 430 + 260)


if __name__ == "__main__":
    unittest.main()
