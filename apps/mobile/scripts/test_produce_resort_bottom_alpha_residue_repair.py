#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("produce_resort_bottom_alpha_residue_repair.py")


def load_module():
    spec = importlib.util.spec_from_file_location("resort_bottom_alpha_repair", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ResortBottomAlphaResidueRepairTests(unittest.TestCase):
    def test_source_is_locked_to_the_reviewed_failed_candidate(self) -> None:
        module = load_module()
        self.assertEqual(
            module.SOURCE_SHA256,
            hashlib.sha256(module.SOURCE.read_bytes()).hexdigest(),
        )

    def test_cleanup_preserves_strong_pant_pixels_and_removes_hand_outlines(self) -> None:
        module = load_module()
        source = Image.open(module.SOURCE).convert("RGBA")
        cleaned = module.clean_residue(source)
        before = np.asarray(source)
        after = np.asarray(cleaned)
        strong = before[..., 3] > module.STRONG_ALPHA
        np.testing.assert_array_equal(after[strong], before[strong])
        self.assertGreater(
            int(np.count_nonzero((before[..., 3] > 0) & (after[..., 3] == 0))),
            500,
        )
        self.assertEqual((95, 281, 162, 339), cleaned.getchannel("A").getbbox())

    def test_output_is_one_clean_connected_component(self) -> None:
        module = load_module()
        cleaned = module.clean_residue(Image.open(module.SOURCE).convert("RGBA"))
        components = module.connected_component_sizes(
            np.asarray(cleaned.getchannel("A")) > 0
        )
        self.assertEqual(1, len(components), components)
        self.assertGreater(components[0], 2500)
        pixels = np.asarray(cleaned)
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))

    def test_only_nearby_antialias_survives(self) -> None:
        module = load_module()
        source = Image.open(module.SOURCE).convert("RGBA")
        cleaned = module.clean_residue(source)
        alpha = np.asarray(source.getchannel("A"))
        strong = Image.fromarray(((alpha > module.STRONG_ALPHA) * 255).astype(np.uint8))
        support = np.asarray(
            strong.filter(ImageFilter.MaxFilter(module.SUPPORT_DIAMETER))
        ) > 0
        self.assertFalse(
            np.any(np.asarray(cleaned.getchannel("A"))[~support] > 0)
        )


if __name__ == "__main__":
    unittest.main()
