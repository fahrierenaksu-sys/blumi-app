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


SCRIPT = Path(__file__).with_name("produce_soft_parachute_cargo_v2.py")


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_soft_parachute_cargo_v2",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load soft parachute cargo producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SoftParachuteCargoV2Tests(unittest.TestCase):
    def test_generated_source_guide_and_approved_shoe_are_hash_bound(self) -> None:
        module = load_module()
        module.verify_inputs()

        self.assertEqual("generated-premium-v8.png", module.SOURCE.name)
        self.assertEqual(module.SOURCE_SHA256, module.sha256(module.SOURCE))
        self.assertEqual(module.GUIDE_SHA256, module.sha256(module.GUIDE))
        self.assertEqual(
            module.APPROVED_SHOE_SHA256,
            module.sha256(module.APPROVED_SHOES),
        )

    def test_registered_master_is_locked_to_canonical_magenta_geometry(self) -> None:
        module = load_module()
        registered = module.build_registered_master()
        guide = Image.open(module.GUIDE).convert("RGBA")

        self.assertEqual(module.keyed_bbox(guide), module.keyed_bbox(registered))
        self.assertEqual(
            module.REGISTERED_PIXEL_SHA256,
            hashlib.sha256(registered.tobytes()).hexdigest(),
        )

    def test_static_layer_keeps_one_clean_cargo_garment_and_two_legs(self) -> None:
        module = load_module()
        layer = module.build_static_layer()
        alpha = np.asarray(layer.getchannel("A"))
        bbox = layer.getchannel("A").point(
            lambda value: 255 if value > 16 else 0
        ).getbbox()

        self.assertEqual((256, 384), layer.size)
        self.assertEqual((95, 266, 160, 331), bbox)
        self.assertEqual(1, module.visible_component_count(layer, threshold=16))

        for y in range(288, 330):
            row = alpha[y] > 220
            left = np.flatnonzero(row[:128])
            right = np.flatnonzero(row[128:]) + 128
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            gap = int(right[0] - left[-1] - 1)
            self.assertGreaterEqual(gap, 1, y)
            self.assertLessEqual(gap, 16, y)

        self.assertEqual(
            0,
            int(np.count_nonzero(alpha[:264] > 0)),
            "body-guide residue exists above the garment",
        )
        self.assertEqual(
            0,
            int(np.count_nonzero(alpha[334:] > 0)),
            "foot-guide residue exists below the garment",
        )

    def test_waist_and_approved_shoe_contacts_are_controlled(self) -> None:
        module = load_module()
        layer = np.asarray(module.build_static_layer().getchannel("A"))
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))
        shoes = np.asarray(
            Image.open(module.APPROVED_SHOES).convert("RGBA").getchannel("A")
        )

        waist_contact = (layer[282:294] > 16) & (top[282:294] > 16)
        self.assertGreaterEqual(int(np.count_nonzero(waist_contact)), 500)

        overlap = (layer > 16) & (shoes > 16)
        self.assertEqual(0, int(np.count_nonzero(overlap[:318])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[318:334])), 100)
        self.assertLessEqual(int(np.count_nonzero(overlap[318:334])), 180)
        self.assertGreaterEqual(
            int(np.count_nonzero((shoes > 16) & (layer <= 16))),
            650,
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

    def test_render_is_candidate_only_and_manifest_hashes_are_exact(self) -> None:
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
        self.assertEqual("user_approval_pending", manifest["status"])
        self.assertEqual(
            {
                "visual": "PASS",
                "codeProvenance": "PASS",
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
