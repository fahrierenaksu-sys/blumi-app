#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_male_top_alpha_residue_repairs.py")


def load_module():
    spec = importlib.util.spec_from_file_location("male_top_alpha_residue_repairs", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleTopAlphaResidueRepairTests(unittest.TestCase):
    def test_locked_sources_are_the_reviewed_candidates(self) -> None:
        module = load_module()
        expected = {
            "contemporary_resort_street_top":
                "91ebe2ecdc22e1107650f8571d439f977351fc88c8816f56d841bd187271954d",
            "dusty_blue_weekend_crew_sweatshirt":
                "b92c3e8300330e5d4bde17d85e2f4e8c5599c5d45303b9bed94e015946fc0857",
        }
        self.assertEqual(expected, module.SOURCE_SHA256)
        for slug, checksum in expected.items():
            self.assertEqual(
                checksum,
                hashlib.sha256(module.source_path(slug).read_bytes()).hexdigest(),
            )

    def test_cleanup_preserves_every_strong_garment_pixel(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            source = Image.open(module.source_path(slug)).convert("RGBA")
            cleaned = module.clean_residue(source)
            before = np.asarray(source)
            after = np.asarray(cleaned)
            strong = before[..., 3] > module.STRONG_ALPHA
            np.testing.assert_array_equal(after[strong], before[strong], err_msg=slug)

    def test_cleanup_only_keeps_antialias_near_the_strong_garment(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            source = Image.open(module.source_path(slug)).convert("RGBA")
            cleaned = module.clean_residue(source)
            before_alpha = np.asarray(source.getchannel("A"))
            after_alpha = np.asarray(cleaned.getchannel("A"))
            strong = Image.fromarray(
                ((before_alpha > module.STRONG_ALPHA) * 255).astype(np.uint8)
            )
            support = np.asarray(
                strong.filter(ImageFilter.MaxFilter(module.SUPPORT_DIAMETER))
            ) > 0
            self.assertFalse(np.any(after_alpha[~support] > 0), slug)
            self.assertGreater(
                int(np.count_nonzero((before_alpha > 0) & (after_alpha == 0))),
                100,
                slug,
            )

    def test_cleaned_garment_is_one_connected_visible_component(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            cleaned = module.clean_residue(
                Image.open(module.source_path(slug)).convert("RGBA")
            )
            components = module.connected_component_sizes(
                np.asarray(cleaned.getchannel("A")) > 0
            )
            self.assertEqual(1, len(components), (slug, components))
            self.assertGreater(components[0], 3000, slug)

    def test_cleanup_has_no_hidden_rgb_and_keeps_native_canvas(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            cleaned = module.clean_residue(
                Image.open(module.source_path(slug)).convert("RGBA")
            )
            pixels = np.asarray(cleaned)
            self.assertEqual(module.CANVAS, cleaned.size)
            self.assertEqual("RGBA", cleaned.mode)
            self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0), slug)


if __name__ == "__main__":
    unittest.main()
