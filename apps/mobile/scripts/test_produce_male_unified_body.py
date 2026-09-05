from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_male_unified_body.py")
sys.path.insert(0, str(SCRIPT.parent))


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_male_unified_body",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleUnifiedBodyTests(unittest.TestCase):
    def test_unified_body_contains_face_and_full_body_in_one_rgba_layer(self) -> None:
        module = load_module()
        base = Image.open(module.BASE).convert("RGBA")
        face = Image.open(module.FACE).convert("RGBA")

        unified = module.build_unified_body(base, face)

        self.assertEqual((256, 384), unified.size)
        self.assertEqual("RGBA", unified.mode)
        self.assertEqual(face.getpixel((128, 180)), unified.getpixel((128, 180)))
        self.assertEqual(base.getpixel((128, 340)), unified.getpixel((128, 340)))

    def test_sources_are_immutable_and_edits_stay_inside_joint_zone(self) -> None:
        module = load_module()
        base = Image.open(module.BASE).convert("RGBA")
        face = Image.open(module.FACE).convert("RGBA")
        base_before = base.tobytes()
        face_before = face.tobytes()
        raw = Image.alpha_composite(base, face)

        unified = module.build_unified_body(base, face)

        self.assertEqual(base_before, base.tobytes())
        self.assertEqual(face_before, face.tobytes())
        before = np.asarray(raw)
        after = np.asarray(unified)
        changed = np.any(before != after, axis=2)
        allowed = np.zeros(changed.shape, dtype=bool)
        allowed[212:243, 96:161] = True
        self.assertEqual(0, int(np.count_nonzero(changed & ~allowed)))

    def test_neck_and_shoulders_have_no_internal_split_or_transparent_notch(
        self,
    ) -> None:
        module = load_module()
        unified = module.build_unified_body(
            Image.open(module.BASE).convert("RGBA"),
            Image.open(module.FACE).convert("RGBA"),
        )
        pixels = np.asarray(unified)
        alpha = pixels[..., 3]

        for point in (
            (116, 220),
            (140, 220),
            (110, 222),
            (146, 222),
            (101, 229),
            (154, 229),
            (100, 231),
            (155, 231),
            (99, 236),
            (157, 236),
        ):
            self.assertGreaterEqual(alpha[point[1], point[0]], 200)
        self.assertTrue(np.all(pixels[221:225, 119:138, :3].sum(axis=2) > 600))
        center_rows = pixels[220:226, 128, :3].astype(int)
        differences = np.abs(np.diff(center_rows, axis=0)).sum(axis=1)
        self.assertLess(int(differences.max()), 22)

    def test_transparent_pixels_have_clean_rgb(self) -> None:
        module = load_module()
        unified = module.build_unified_body(
            Image.open(module.BASE).convert("RGBA"),
            Image.open(module.FACE).convert("RGBA"),
        )
        pixels = np.asarray(unified)
        self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
