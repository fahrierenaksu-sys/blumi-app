#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_monochrome_street_tailoring_v2.py")


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_monochrome_street_tailoring_v2",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load monochrome street tailoring producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MonochromeStreetTailoringV2Tests(unittest.TestCase):
    def test_source_and_approved_shoe_are_hash_bound(self) -> None:
        module = load_module()
        module.verify_inputs()

    def test_registered_master_matches_canonical_magenta_rig(self) -> None:
        module = load_module()
        registered = module.build_registered_master()
        guide = Image.open(module.GUIDE).convert("RGBA")

        self.assertEqual(module.keyed_bbox(guide), module.keyed_bbox(registered))
        self.assertEqual(
            module.REGISTERED_PIXEL_SHA256,
            hashlib.sha256(registered.convert("RGBA").tobytes()).hexdigest(),
        )

    def test_static_layer_is_a_clean_relaxed_two_leg_garment(self) -> None:
        module = load_module()
        layer = module.build_static_layer()
        alpha = np.asarray(layer.getchannel("A"))

        self.assertEqual((256, 384), layer.size)
        self.assertEqual((98, 271, 157, 337), layer.getchannel("A").point(
            lambda value: 255 if value > 16 else 0
        ).getbbox())

        gap_widths = []
        for y in range(296, 334):
            row = alpha[y] > 220
            left = np.flatnonzero(row[:128])
            right = np.flatnonzero(row[128:]) + 128
            self.assertGreater(len(left), 0, y)
            self.assertGreater(len(right), 0, y)
            gap_widths.append(int(right[0] - left[-1] - 1))

        self.assertGreaterEqual(gap_widths[0], 1)
        self.assertGreaterEqual(gap_widths[-1], 10)
        self.assertLessEqual(
            max(abs(current - previous) for previous, current in zip(
                gap_widths,
                gap_widths[1:],
            )),
            2,
        )

    def test_waist_and_approved_shoe_contacts_are_natural(self) -> None:
        module = load_module()
        layer = np.asarray(module.build_static_layer().getchannel("A"))
        top = np.asarray(Image.open(module.TOP).convert("RGBA").getchannel("A"))
        shoes = np.asarray(
            Image.open(module.APPROVED_SHOES).convert("RGBA").getchannel("A")
        )

        waist_contact = (layer[282:294] > 16) & (top[282:294] > 16)
        self.assertGreaterEqual(int(np.count_nonzero(waist_contact)), 450)

        overlap = (layer > 16) & (shoes > 16)
        self.assertEqual(0, int(np.count_nonzero(overlap[:325])))
        self.assertGreaterEqual(int(np.count_nonzero(overlap[325:337])), 150)
        self.assertLessEqual(int(np.count_nonzero(overlap[325:337])), 260)
        self.assertGreaterEqual(int(np.count_nonzero(shoes[337:] > 16)), 400)

    def test_static_layer_has_no_key_color_or_transparent_rgb_residue(self) -> None:
        module = load_module()
        pixels = np.asarray(module.build_static_layer())
        alpha = pixels[..., 3]
        opaque = alpha > 16
        visible = alpha > 0
        red = pixels[..., 0].astype(np.int16)
        green = pixels[..., 1].astype(np.int16)
        blue = pixels[..., 2].astype(np.int16)

        self.assertEqual(0, int(np.count_nonzero(pixels[alpha == 0, :3])))
        self.assertFalse(np.any(
            opaque
            & (pixels[..., 1] >= 150)
            & (pixels[..., 1] >= pixels[..., 0] + 60)
            & (pixels[..., 1] >= pixels[..., 2] + 60)
        ))
        self.assertFalse(np.any(
            opaque
            & (pixels[..., 0] >= 150)
            & (pixels[..., 2] >= 150)
            & (pixels[..., 0] >= pixels[..., 1] + 70)
            & (pixels[..., 2] >= pixels[..., 1] + 70)
        ))
        self.assertLessEqual(
            int(np.max(np.minimum(red[visible], blue[visible]) - green[visible])),
            4,
        )

    def test_render_is_candidate_only_and_preserves_runtime_asset(self) -> None:
        module = load_module()
        before = module.sha256(module.RUNTIME_ASSET)
        room_tree_before = module.tree_sha256(module.ROOM)
        original_load = module._load

        def forbid_late_shoe_reload(path: Path):
            if path == module.APPROVED_SHOES:
                raise AssertionError("approved shoe must come from one hash-bound snapshot")
            return original_load(path)

        with mock.patch.object(module, "_load", side_effect=forbid_late_shoe_reload):
            outputs = module.render()
        after = module.sha256(module.RUNTIME_ASSET)
        room_tree_after = module.tree_sha256(module.ROOM)

        self.assertEqual(before, after)
        self.assertEqual(room_tree_before, room_tree_after)
        self.assertTrue(all(path.is_file() for path in outputs))
        with Image.open(module.APPROVAL_CHECKER) as checker:
            self.assertEqual((2200, 1400), checker.size)
        with Image.open(module.APPROVAL_BLACK) as black:
            self.assertEqual((2200, 1400), black.size)

        manifest = json.loads(module.MANIFEST.read_text())
        self.assertEqual(
            manifest["runtimeRoomTreeSha256Before"],
            manifest["runtimeRoomTreeSha256After"],
        )
        output_hashes = manifest["outputs"]
        for path in (
            module.REGISTERED_MASTER,
            module.FOREGROUND_MASTER,
            module.STATIC_LAYER,
            module.COMPOSITE,
            module.APPROVAL_CHECKER,
            module.APPROVAL_BLACK,
        ):
            self.assertEqual(
                module.sha256(path),
                output_hashes[str(path.relative_to(module.REPO))],
            )


if __name__ == "__main__":
    unittest.main()
