#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_colorblock_track_reillustrated_v4.py")


def load_module():
    spec = importlib.util.spec_from_file_location(
        "colorblock_track_reillustrated_v4",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def connected_component_sizes(mask: np.ndarray) -> list[int]:
    remaining = mask.copy()
    height, width = remaining.shape
    sizes: list[int] = []
    for start_y, start_x in zip(*np.where(remaining)):
        if not remaining[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        remaining[start_y, start_x] = False
        size = 0
        while stack:
            y, x = stack.pop()
            size += 1
            for next_y, next_x in (
                (y - 1, x),
                (y + 1, x),
                (y, x - 1),
                (y, x + 1),
            ):
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and remaining[next_y, next_x]
                ):
                    remaining[next_y, next_x] = False
                    stack.append((next_y, next_x))
        sizes.append(size)
    return sorted(sizes, reverse=True)


class ColorblockTrackReillustratedV4Tests(unittest.TestCase):
    def test_source_master_is_checksum_locked(self) -> None:
        module = load_module()
        self.assertEqual(
            "c3e0a19b0d78f4c9e003b6029d94a3dc92388c4aa11a9a39104d31d3c1d8bbee",
            module.SOURCE_SHA256,
        )
        self.assertEqual(
            module.SOURCE_SHA256,
            hashlib.sha256(module.SOURCE.read_bytes()).hexdigest(),
        )

    def test_registered_layer_uses_uniform_scale_and_canonical_anchors(self) -> None:
        module = load_module()
        source = Image.open(module.SOURCE).convert("RGBA")
        source_bbox = source.getchannel("A").getbbox()
        self.assertIsNotNone(source_bbox)
        source_width = source_bbox[2] - source_bbox[0]
        source_height = source_bbox[3] - source_bbox[1]

        layer = module.build_registered_layer(source)
        self.assertEqual((256, 384), layer.size)
        self.assertEqual((93, 265, 163, 338), layer.getchannel("A").getbbox())
        output_bbox = layer.getchannel("A").getbbox()
        output_width = output_bbox[2] - output_bbox[0]
        output_height = output_bbox[3] - output_bbox[1]
        self.assertAlmostEqual(
            source_width / source_height,
            output_width / output_height,
            delta=0.02,
        )

    def test_layer_is_one_clean_garment_with_two_readable_legs(self) -> None:
        module = load_module()
        layer = module.build_registered_layer(
            Image.open(module.SOURCE).convert("RGBA")
        )
        rgba = np.asarray(layer)
        alpha = rgba[..., 3]
        components = connected_component_sizes(alpha > 8)
        self.assertEqual(1, len(components), components)
        self.assertGreater(components[0], 2800)
        self.assertTrue(np.all(rgba[alpha == 0, :3] == 0))

        for y in (305, 315, 330):
            self.assertTrue(bool(np.any(alpha[y, 126:130] <= 64)), y)
            self.assertTrue(bool(np.any(alpha[y, 94:127] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 129:162] > 8)), y)

    def test_waist_and_hem_respect_the_canonical_contact_contract(self) -> None:
        module = load_module()
        layer = module.build_registered_layer(
            Image.open(module.SOURCE).convert("RGBA")
        )
        alpha = np.asarray(layer.getchannel("A"))

        waist_rows = alpha[266:274] > 8
        self.assertTrue(np.all(np.any(waist_rows[:, 98:128], axis=1)))
        self.assertTrue(np.all(np.any(waist_rows[:, 129:159], axis=1)))
        self.assertFalse(bool(np.any(alpha[:265] > 0)))
        self.assertFalse(bool(np.any(alpha[338:] > 0)))

        hem_row = alpha[336] > 8
        self.assertTrue(bool(np.any(hem_row[92:127])))
        self.assertTrue(bool(np.any(hem_row[129:164])))
        self.assertFalse(bool(hem_row[128]))


if __name__ == "__main__":
    unittest.main()
