from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("produce_male_glasses_natural_fit.py")
sys.path.insert(0, str(SCRIPT.parent))


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_male_glasses_natural_fit",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleGlassesNaturalFitTests(unittest.TestCase):
    def test_profiles_use_face_proportional_eye_line_boxes(self) -> None:
        module = load_module()
        self.assertEqual(
            (103, 157, 153, 181),
            module.PROFILES["slim_oval_glasses"]["targetBox"],
        )
        self.assertEqual(
            (104, 158, 152, 182),
            module.PROFILES["soft_rectangular_glasses"]["targetBox"],
        )
        self.assertEqual(
            (101, 157, 155, 180),
            module.PROFILES["translucent_wrap_glasses"]["targetBox"],
        )

    def test_exact_three_reported_glasses_are_targeted(self) -> None:
        module = load_module()
        self.assertEqual(
            {
                "slim_oval_glasses",
                "soft_rectangular_glasses",
                "translucent_wrap_glasses",
            },
            set(module.PROFILES),
        )

    def test_each_pair_is_centered_below_brows_in_its_own_target_box(self) -> None:
        module = load_module()
        for slug, profile in module.PROFILES.items():
            with self.subTest(slug=slug):
                repaired = module.build_repaired_glasses(slug)
                bbox = repaired.getchannel("A").getbbox()
                self.assertIsNotNone(bbox)
                self.assertEqual(profile["targetBox"], bbox)
                self.assertLessEqual(abs((bbox[0] + bbox[2]) / 2 - 128), 1)
                self.assertGreaterEqual(bbox[1], 153)
                self.assertLessEqual(bbox[3], 184)

    def test_sources_are_immutable_and_outputs_have_clean_native_alpha(self) -> None:
        module = load_module()
        for slug in module.PROFILES:
            with self.subTest(slug=slug):
                source = module.load_source(slug)
                before = source.tobytes()
                repaired = module.build_repaired_glasses(slug)
                pixels = np.asarray(repaired)
                self.assertEqual(before, source.tobytes())
                self.assertEqual((256, 384), repaired.size)
                self.assertEqual("RGBA", repaired.mode)
                self.assertTrue(
                    np.all(pixels[pixels[..., 3] == 0, :3] == 0)
                )

    def test_composite_uses_unified_body_and_keeps_both_eyes_readable(self) -> None:
        module = load_module()
        for slug in module.PROFILES:
            with self.subTest(slug=slug):
                composite = module.compose_repaired(slug)
                self.assertEqual((256, 384), composite.size)
                for point in ((112, 168), (144, 168)):
                    self.assertGreater(composite.getpixel(point)[3], 240)


if __name__ == "__main__":
    unittest.main()
