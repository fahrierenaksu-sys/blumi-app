#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT = Path(__file__).with_name("package_male_unversioned_static_candidates.py")


def load_module():
    spec = importlib.util.spec_from_file_location(
        "male_unversioned_static_candidates",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleUnversionedStaticCandidateTests(unittest.TestCase):
    def test_inventory_is_exactly_the_29_status_report_gaps(self) -> None:
        module = load_module()
        self.assertEqual(29, len(module.ITEMS))
        self.assertEqual(
            {"top": 18, "bottom": 11},
            {
                category: sum(item.category == category for item in module.ITEMS)
                for category in ("top", "bottom")
            },
        )
        self.assertEqual(len(module.ITEMS), len(set(module.ITEMS)))
        self.assertEqual(set(module.ITEMS), set(module.SOURCE_SHA256))

    def test_every_source_is_checksum_locked_and_on_the_canonical_canvas(self) -> None:
        module = load_module()
        for item in module.ITEMS:
            source = module.static_source(item)
            self.assertEqual(
                module.SOURCE_SHA256[item],
                hashlib.sha256(source.read_bytes()).hexdigest(),
                item,
            )
            with Image.open(source) as image:
                self.assertEqual((256, 384), image.size, item)
                self.assertEqual("RGBA", image.mode, item)

    def test_sanitization_preserves_all_visible_pixels_and_alpha(self) -> None:
        module = load_module()
        for item in module.ITEMS:
            source = Image.open(module.static_source(item)).convert("RGBA")
            sanitized = module.sanitize_layer(source)
            before = np.asarray(source)
            after = np.asarray(sanitized)
            visible = before[..., 3] > 0
            np.testing.assert_array_equal(after[visible], before[visible], err_msg=str(item))
            np.testing.assert_array_equal(after[..., 3], before[..., 3], err_msg=str(item))
            self.assertTrue(np.all(after[after[..., 3] == 0, :3] == 0), item)

    def test_residue_cleanup_preserves_strong_art_and_removes_unsupported_alpha(self) -> None:
        module = load_module()
        for item in module.ITEMS:
            source = Image.open(module.static_source(item)).convert("RGBA")
            cleaned = module.clean_residue(source)
            before = np.asarray(source)
            after = np.asarray(cleaned)
            strong = before[..., 3] > module.STRONG_ALPHA
            np.testing.assert_array_equal(after[strong], before[strong], err_msg=str(item))
            support = np.asarray(
                Image.fromarray((strong * 255).astype(np.uint8)).filter(
                    ImageFilter.MaxFilter(module.SUPPORT_DIAMETER)
                )
            ) > 0
            self.assertFalse(bool(np.any(after[~support, 3] > 0)), item)
            self.assertTrue(np.all(after[after[..., 3] == 0, :3] == 0), item)

    def test_rebuilt_composite_matches_the_selected_visible_outfit(self) -> None:
        module = load_module()
        for item in module.ITEMS:
            source = np.asarray(
                Image.open(module.static_source(item)).convert("RGBA")
            )
            layer = module.clean_residue(Image.fromarray(source))
            rebuilt = np.asarray(module.build_composite(item.category, layer))
            selected = np.asarray(
                Image.open(module.composite_source(item)).convert("RGBA")
            )
            strong = source[..., 3] > module.STRONG_ALPHA
            np.testing.assert_array_equal(
                rebuilt[strong],
                selected[strong],
                err_msg=str(item),
            )

    def test_manifest_requires_independent_review_and_user_approval(self) -> None:
        module = load_module()
        item = module.ITEMS[0]
        manifest = module.build_manifest(
            item,
            {
                Path("static.png"): "a" * 64,
                Path("composite.png"): "b" * 64,
                Path("proof.png"): "c" * 64,
            },
        )
        self.assertEqual("static_candidate_awaiting_independent_review", manifest["status"])
        self.assertEqual("PENDING", manifest["independentReview"])
        self.assertFalse(manifest["explicitUserApproval"])
        self.assertFalse(manifest["runtimePromoted"])


if __name__ == "__main__":
    unittest.main()
