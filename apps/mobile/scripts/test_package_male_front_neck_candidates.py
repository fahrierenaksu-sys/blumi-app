#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_front_neck_candidates.py")


def load_module():
    spec = importlib.util.spec_from_file_location("male_front_neck_candidates", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleFrontNeckCandidateTests(unittest.TestCase):
    def test_reviewed_source_pixels_are_checksum_locked(self) -> None:
        module = load_module()
        self.assertEqual(7, len(module.ITEMS))
        for slug, item in module.ITEMS.items():
            self.assertEqual(
                item["sha256"],
                hashlib.sha256(module.source_path(slug).read_bytes()).hexdigest(),
                slug,
            )

    def test_every_source_is_native_rgba(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            source = Image.open(module.source_path(slug)).convert("RGBA")
            self.assertEqual(module.CANVAS, source.size, slug)

    def test_canonical_neck_core_contains_no_top_layer_rear_plane(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            alpha = np.asarray(
                Image.open(module.source_path(slug)).convert("RGBA").getchannel("A")
            )
            for x, y in module.NECK_CORE_PROBES:
                self.assertEqual(0, int(alpha[y, x]), (slug, x, y))

    def test_packaging_is_pixel_identity_not_a_silent_edit(self) -> None:
        module = load_module()
        for slug in module.ITEMS:
            source = Image.open(module.source_path(slug)).convert("RGBA")
            packaged = module.package_static(source)
            before = np.asarray(source)
            after = np.asarray(packaged)
            visible = before[..., 3] > 0
            np.testing.assert_array_equal(after[visible], before[visible], err_msg=slug)
            np.testing.assert_array_equal(after[..., 3], before[..., 3], err_msg=slug)
            self.assertTrue(np.all(after[~visible, :3] == 0), slug)


if __name__ == "__main__":
    unittest.main()
