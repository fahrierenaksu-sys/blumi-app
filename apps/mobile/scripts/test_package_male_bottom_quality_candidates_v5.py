from __future__ import annotations

import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name(
    "package_male_bottom_quality_candidates_v5.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "package_male_bottom_quality_candidates_v5",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PackageMaleBottomQualityCandidatesV5Tests(unittest.TestCase):
    def test_sources_are_checksum_locked(self) -> None:
        module = load_module()

        self.assertEqual(
            module.COLORBLOCK_SOURCE_SHA256,
            hashlib.sha256(module.COLORBLOCK_SOURCE.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            module.STRAIGHT_SOURCE_SHA256,
            hashlib.sha256(module.STRAIGHT_SOURCE.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            module.WIDE_SOURCE_SHA256,
            hashlib.sha256(module.WIDE_SOURCE.read_bytes()).hexdigest(),
        )

    def test_straight_candidate_keeps_approved_canonical_geometry(self) -> None:
        module = load_module()
        layer = module.build_straight_layer()
        alpha = np.asarray(layer.getchannel("A"))

        self.assertEqual((256, 384), layer.size)
        self.assertEqual("RGBA", layer.mode)
        self.assertEqual((99, 286, 156, 337), layer.getchannel("A").getbbox())
        self.assertFalse(bool(np.any(alpha[:286] > 0)))
        self.assertFalse(bool(np.any(alpha[337:] > 0)))
        for y in (304, 320, 334):
            self.assertTrue(bool(np.any(alpha[y, 99:127] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 129:157] > 8)), y)
        self.assertLess(int(np.min(alpha[304, 127:129])), 230)
        for y in (320, 334):
            self.assertTrue(bool(np.any(alpha[y, 127:129] <= 8)), y)

    def test_colorblock_candidate_fits_waist_and_keeps_two_clean_legs(self) -> None:
        module = load_module()
        source = Image.open(module.COLORBLOCK_SOURCE).convert("RGBA")
        layer = module.build_colorblock_layer(source)
        rgba = np.asarray(layer)
        alpha = rgba[..., 3]

        self.assertEqual((256, 384), layer.size)
        self.assertEqual("RGBA", layer.mode)
        bbox = layer.getchannel("A").getbbox()
        self.assertIsNotNone(bbox)
        self.assertGreaterEqual(bbox[0], 96)
        self.assertLessEqual(bbox[2], 160)
        self.assertEqual(286, bbox[1])
        self.assertEqual(339, bbox[3])
        self.assertFalse(bool(np.any(alpha[:286] > 0)))
        self.assertFalse(bool(np.any(alpha[339:] > 0)))
        self.assertFalse(bool(np.any(alpha[286:294, :99] > 8)))
        self.assertFalse(bool(np.any(alpha[286:294, 157:] > 8)))
        waistband = rgba[286:294, 99:157]
        visible_waistband = waistband[waistband[..., 3] > 8, :3].astype(np.int16)
        self.assertTrue(
            bool(np.all(visible_waistband[:, 0] > visible_waistband[:, 1] + 15))
        )
        self.assertTrue(
            bool(np.all(visible_waistband[:, 2] > visible_waistband[:, 1] + 8))
        )
        for y in (304, 320, 336):
            self.assertTrue(bool(np.any(alpha[y, 96:127] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 129:160] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 127:129] <= 8)), y)
        self.assertTrue(np.all(rgba[alpha == 0, :3] == 0))

    def test_wide_candidate_reads_as_full_length_separate_relaxed_legs(self) -> None:
        module = load_module()
        source = Image.open(module.WIDE_SOURCE).convert("RGBA")
        layer = module.build_wide_layer(source)
        rgba = np.asarray(layer)
        alpha = rgba[..., 3]

        self.assertEqual((256, 384), layer.size)
        self.assertEqual((96, 286, 160, 339), layer.getchannel("A").getbbox())
        self.assertFalse(bool(np.any(alpha[:286] > 0)))
        self.assertFalse(bool(np.any(alpha[339:] > 0)))
        self.assertTrue(bool(np.all(alpha[302, 127:129] > 8)))
        for y in (303, 320, 336):
            self.assertTrue(bool(np.any(alpha[y, 96:127] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 129:160] > 8)), y)
            self.assertTrue(bool(np.any(alpha[y, 127:129] <= 8)), y)
        self.assertTrue(np.all(rgba[alpha == 0, :3] == 0))

    def test_packaging_writes_candidate_only_static_and_composites(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory() as temporary_directory:
            destination = Path(temporary_directory)
            outputs = module.package_candidates(destination)

            self.assertEqual(
                {
                    "straight_static",
                    "straight_composite",
                    "colorblock_static",
                    "colorblock_composite",
                    "wide_static",
                    "wide_composite",
                    "review_board",
                    "manifest",
                },
                set(outputs),
            )
            for path in outputs.values():
                self.assertTrue(path.is_file(), path)
            for key in (
                "straight_static",
                "straight_composite",
                "colorblock_static",
                "colorblock_composite",
                "wide_static",
                "wide_composite",
            ):
                with Image.open(outputs[key]) as opened:
                    self.assertEqual((256, 384), opened.size)
                    self.assertEqual("RGBA", opened.mode)


if __name__ == "__main__":
    unittest.main()
