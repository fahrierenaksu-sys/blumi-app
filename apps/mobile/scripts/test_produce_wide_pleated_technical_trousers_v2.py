#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name(
    "produce_wide_pleated_technical_trousers_v2.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_wide_pleated_technical_trousers_v2",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load wide pleated technical producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def row_gap(alpha: np.ndarray, y: int) -> int:
    row = alpha[y] > 220
    left = np.flatnonzero(row[:128])
    right = np.flatnonzero(row[128:]) + 128
    if len(left) == 0 or len(right) == 0:
        return -1
    return int(right[0] - left[-1] - 1)


class WidePleatedTechnicalTrousersV2Tests(unittest.TestCase):
    def test_generated_source_guide_and_approved_shoe_are_hash_bound(self) -> None:
        module = load_module()
        module.verify_inputs()

        self.assertEqual("generated-premium-local-v11.png", module.SOURCE.name)
        self.assertEqual(module.SOURCE_SHA256, module.sha256(module.SOURCE))
        self.assertEqual(module.GUIDE_SHA256, module.sha256(module.GUIDE))
        self.assertEqual(
            module.APPROVED_SHOE_SHA256,
            module.sha256(module.APPROVED_SHOES),
        )

    def test_registered_master_is_locked_to_canonical_item_geometry(self) -> None:
        module = load_module()
        guide = Image.open(module.GUIDE).convert("RGBA")
        foreground = module.build_foreground_master()
        registered = module.build_registered_master(foreground)

        self.assertEqual(module.GUIDE_KEYED_BBOX, module.keyed_bbox(guide))
        self.assertEqual(
            module.SOURCE_GARMENT_BBOX,
            foreground.getchannel("A").getbbox(),
        )
        self.assertEqual(
            module.CANONICAL_GARMENT_BOX,
            registered.getchannel("A").getbbox(),
        )
        self.assertEqual(
            module.REGISTERED_PIXEL_SHA256,
            hashlib.sha256(registered.tobytes()).hexdigest(),
        )

    def test_static_layer_is_full_length_wide_and_reads_as_two_legs(self) -> None:
        module = load_module()
        layer = module.build_static_layer()
        alpha = np.asarray(layer.getchannel("A"))
        bbox = layer.getchannel("A").point(
            lambda value: 255 if value > 16 else 0
        ).getbbox()

        self.assertEqual((256, 384), layer.size)
        self.assertIsNotNone(bbox)
        assert bbox is not None
        self.assertEqual((96, 284, 160, 336), bbox)
        self.assertEqual(1, module.visible_component_count(layer, threshold=16))

        self.assertEqual(0, int(np.count_nonzero(alpha[:282] > 0)))
        self.assertEqual(0, int(np.count_nonzero(alpha[338:] > 0)))

        gap_widths = [row_gap(alpha, y) for y in range(302, 329)]
        self.assertTrue(all(gap >= 1 for gap in gap_widths), gap_widths)
        self.assertLessEqual(gap_widths[0], 2)
        self.assertLessEqual(max(gap_widths), 4)
        self.assertLessEqual(
            max(
                abs(current - previous)
                for previous, current in zip(gap_widths, gap_widths[1:])
            ),
            2,
        )

        self.assertGreaterEqual(int(np.count_nonzero(alpha[300] > 220)), 44)
        self.assertGreaterEqual(int(np.count_nonzero(alpha[326] > 220)), 55)

    def test_waist_and_approved_shoe_contacts_are_natural(self) -> None:
        module = load_module()
        layer = np.asarray(module.build_static_layer().getchannel("A"))
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))
        shoes = np.asarray(
            Image.open(module.APPROVED_SHOES).convert("RGBA").getchannel("A")
        )

        waist_contact = (layer[282:294] > 16) & (top[282:294] > 16)
        self.assertGreaterEqual(int(np.count_nonzero(waist_contact)), 300)

        overlap = (layer > 16) & (shoes > 16)
        self.assertEqual(0, int(np.count_nonzero(overlap[:322])))
        shoe_band_overlap = int(np.count_nonzero(overlap[322:341]))
        self.assertGreaterEqual(shoe_band_overlap, 100)
        self.assertLessEqual(shoe_band_overlap, 260)
        self.assertGreaterEqual(
            int(np.count_nonzero((shoes > 16) & (layer <= 16))),
            520,
        )

    def test_static_layer_has_clean_alpha_and_no_key_colors(self) -> None:
        module = load_module()
        pixels = np.asarray(module.build_static_layer())
        alpha = pixels[..., 3]
        opaque = alpha > 16
        red = pixels[..., 0].astype(np.int16)
        green = pixels[..., 1].astype(np.int16)
        blue = pixels[..., 2].astype(np.int16)

        self.assertEqual(0, int(np.count_nonzero(pixels[alpha == 0, :3])))
        self.assertFalse(np.any(
            opaque
            & (green >= 150)
            & (green >= red + 60)
            & (green >= blue + 60)
        ))
        self.assertFalse(np.any(
            opaque
            & (red >= 150)
            & (blue >= 150)
            & (red >= green + 70)
            & (blue >= green + 70)
        ))

    def test_render_is_candidate_only_and_preserves_runtime_tree(self) -> None:
        module = load_module()
        runtime_before = module.tree_sha256(module.ROOM)
        outputs = module.render()
        runtime_after = module.tree_sha256(module.ROOM)

        self.assertEqual(runtime_before, runtime_after)
        self.assertTrue(all(path.is_file() for path in outputs))
        with Image.open(module.APPROVAL_CHECKER) as checker:
            self.assertEqual((2200, 1400), checker.size)
        with Image.open(module.APPROVAL_BLACK) as black:
            self.assertEqual((2200, 1400), black.size)

        manifest = json.loads(module.MANIFEST.read_text())
        self.assertTrue(manifest["candidateOnly"])
        self.assertFalse(manifest["runtimePromoted"])
        self.assertEqual("independent_review_pending", manifest["status"])
        self.assertEqual(
            {
                "visual": "PENDING",
                "codeProvenance": "PENDING",
                "scope": "static-premium-v8",
            },
            manifest["independentReview"],
        )
        expected_inputs = {
            str(path.relative_to(module.REPO)): module.sha256(path)
            for path in (
                module.SOURCE,
                module.GUIDE,
                module.APPROVED_SHOES,
                module.BASE,
                module.FACE,
                module.TOP,
                module.HAIR,
            )
        }
        self.assertEqual(expected_inputs, manifest["inputs"])
        self.assertEqual(
            module.REGISTERED_PIXEL_SHA256,
            manifest["registeredPixelSha256"],
        )
        self.assertEqual(
            module.sha256(module.RUNTIME_ASSET),
            manifest["runtimeAssetSha256"],
        )
        self.assertEqual(
            manifest["runtimeRoomTreeSha256Before"],
            manifest["runtimeRoomTreeSha256After"],
        )
        for relative_path, expected_hash in manifest["outputs"].items():
            self.assertEqual(
                expected_hash,
                module.sha256(module.REPO / relative_path),
                relative_path,
            )

    def test_render_is_deterministic(self) -> None:
        module = load_module()
        module.render()
        first = json.loads(module.MANIFEST.read_text())
        module.render()
        second = json.loads(module.MANIFEST.read_text())

        self.assertEqual(first["outputs"], second["outputs"])
        self.assertEqual(first["metrics"], second["metrics"])


if __name__ == "__main__":
    unittest.main()
