#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_remaining_male_bottom_alpha_repairs.py")


def load_module():
    spec = importlib.util.spec_from_file_location("remaining_male_bottom_repairs", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class RemainingMaleBottomAlphaRepairTests(unittest.TestCase):
    def test_failed_sources_are_checksum_locked(self) -> None:
        module = load_module()
        expected = {
            "washed_baggy_denim":
                "c5b38f5a16fed15796cc93a5399f34e10ffb05d168ff692bf7c678137f938264",
            "creative_utility_bottom":
                "55f3bf7797dbeef062505b9342fa22b0a35b303766a91f9af0d2e40494a02759",
            "colorblock_nylon_track_pants":
                "4f2baa53ce00a0a923c4a2829b038b66eefefe19d09172d77b29ab4b735a0669",
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

    def test_each_output_is_one_clean_connected_bottom(self) -> None:
        module = load_module()
        expected_bbox = {
            "washed_baggy_denim": (95, 276, 161, 337),
            "creative_utility_bottom": (94, 277, 161, 333),
            "colorblock_nylon_track_pants": (95, 265, 160, 338),
        }
        for slug, bbox in expected_bbox.items():
            cleaned = module.clean_residue(
                Image.open(module.source_path(slug)).convert("RGBA")
            )
            components = module.connected_component_sizes(
                np.asarray(cleaned.getchannel("A")) > 0
            )
            self.assertEqual(1, len(components), (slug, components))
            self.assertGreater(components[0], 3000, slug)
            self.assertEqual(bbox, cleaned.getchannel("A").getbbox(), slug)

    def test_only_nearby_antialias_survives_and_hidden_rgb_is_zero(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            source = Image.open(module.source_path(slug)).convert("RGBA")
            cleaned = module.clean_residue(source)
            alpha = np.asarray(source.getchannel("A"))
            strong = Image.fromarray(
                ((alpha > module.STRONG_ALPHA) * 255).astype(np.uint8)
            )
            support = np.asarray(
                strong.filter(ImageFilter.MaxFilter(module.SUPPORT_DIAMETER))
            ) > 0
            after = np.asarray(cleaned)
            self.assertFalse(np.any(after[~support, 3] > 0), slug)
            self.assertTrue(np.all(after[after[..., 3] == 0, :3] == 0), slug)
            self.assertGreater(
                int(np.count_nonzero((alpha > 0) & (after[..., 3] == 0))),
                500,
                slug,
            )


if __name__ == "__main__":
    unittest.main()
