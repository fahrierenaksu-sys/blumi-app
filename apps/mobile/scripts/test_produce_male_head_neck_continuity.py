from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name(
    "produce_male_head_neck_continuity.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_male_head_neck_continuity",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleHeadNeckContinuityTests(unittest.TestCase):
    def test_repair_is_immutable_and_changes_only_the_shared_neck_overlap(
        self,
    ) -> None:
        module = load_module()
        base = Image.open(module.BASE).convert("RGBA")
        face = Image.open(module.FACE).convert("RGBA")
        before = face.tobytes()

        repaired = module.build_continuous_face(base, face)

        self.assertEqual(before, face.tobytes())
        changed = []
        for y in range(384):
            for x in range(256):
                if repaired.getpixel((x, y)) != face.getpixel((x, y)):
                    changed.append((x, y))
        self.assertTrue(changed)
        self.assertTrue(
            all(
                220 <= y <= 222
                and base.getpixel((x, y))[3] > 0
                and face.getpixel((x, y))[3] > 0
                for x, y in changed
            )
        )

    def test_bottom_face_outline_no_longer_splits_head_from_body(self) -> None:
        module = load_module()
        base = Image.open(module.BASE).convert("RGBA")
        face = Image.open(module.FACE).convert("RGBA")
        repaired = module.build_continuous_face(base, face)
        composite = Image.alpha_composite(base, repaired)

        self.assertEqual(0, repaired.getpixel((128, 222))[3])
        row_222 = composite.getpixel((128, 222))[:3]
        row_223 = composite.getpixel((128, 223))[:3]
        self.assertGreater(sum(row_222), 600)
        self.assertLess(
            sum(abs(a - b) for a, b in zip(row_222, row_223)),
            12,
        )

    def test_output_remains_the_canonical_native_face_layer(self) -> None:
        module = load_module()
        repaired = module.build_continuous_face(
            Image.open(module.BASE).convert("RGBA"),
            Image.open(module.FACE).convert("RGBA"),
        )
        self.assertEqual((256, 384), repaired.size)
        self.assertEqual("RGBA", repaired.mode)
        self.assertEqual(
            Image.open(module.FACE).convert("RGBA").getpixel((128, 180)),
            repaired.getpixel((128, 180)),
        )


if __name__ == "__main__":
    unittest.main()
