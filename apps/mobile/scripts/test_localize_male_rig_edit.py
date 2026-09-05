import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from localize_male_rig_edit import extract_registered_crop, restore_registered_crop


class LocalizeMaleRigEditTest(unittest.TestCase):
    def test_crop_round_trip_preserves_registration_box(self):
        source = Image.new("RGB", (8, 12), (0, 255, 0))
        source.putpixel((3, 5), (120, 60, 30))
        crop = extract_registered_crop(source, (2, 4, 6, 8), target_size=8)
        restored = restore_registered_crop(crop, (8, 12), (2, 4, 6, 8))

        self.assertEqual(crop.size, (8, 8))
        self.assertEqual(restored.size, (8, 12))
        self.assertEqual(restored.getpixel((0, 0)), (0, 255, 0))
        self.assertNotEqual(restored.getpixel((3, 5)), (0, 255, 0))

    def test_restore_can_preserve_alpha_on_a_transparent_full_canvas(self):
        crop = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        crop.putpixel((4, 4), (120, 60, 30, 255))

        restored = restore_registered_crop(
            crop,
            (8, 12),
            (2, 4, 6, 8),
            transparent_background=True,
        )

        self.assertEqual(restored.mode, "RGBA")
        self.assertEqual(restored.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertGreater(restored.getpixel((4, 6))[3], 0)

    def test_restore_composites_transparent_crop_pixels_over_key_green(self):
        crop = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
        crop.putpixel((1, 1), (120, 60, 30, 255))

        restored = restore_registered_crop(crop, (8, 12), (2, 4, 6, 8))

        self.assertEqual(restored.mode, "RGB")
        self.assertEqual(restored.getpixel((2, 4)), (0, 255, 0))
        self.assertEqual(restored.getpixel((3, 5)), (120, 60, 30))

    def test_extract_rejects_invalid_crop_geometry_and_target_size(self):
        source = Image.new("RGB", (8, 12), (0, 255, 0))
        invalid_cases = (
            ((2, 4, 6), 8, "four coordinates"),
            ((2, 4, 2, 4), 8, "positive"),
            ((2, 4, 6, 9), 8, "square"),
            ((-1, 4, 3, 8), 8, "within"),
            ((2, 5, 9, 12), 8, "within"),
            ((2, 4, 6, 8), 0, "target size must be positive"),
        )

        for box, target_size, error in invalid_cases:
            with self.subTest(box=box, target_size=target_size):
                with self.assertRaisesRegex(ValueError, error):
                    extract_registered_crop(
                        source,
                        box,
                        target_size=target_size,
                    )

    def test_restore_rejects_invalid_canvas_and_crop_geometry(self):
        crop = Image.new("RGB", (8, 8), (120, 60, 30))
        invalid_cases = (
            ((8,), (2, 4, 6, 8), "two dimensions"),
            ((0, 12), (2, 4, 6, 8), "positive"),
            ((8, 12), (2, 4, 6), "four coordinates"),
            ((8, 12), (2, 4, 2, 4), "positive"),
            ((8, 12), (2, 4, 6, 9), "square"),
            ((8, 12), (-1, 4, 3, 8), "within"),
            ((8, 12), (2, 5, 9, 12), "within"),
        )

        for full_size, box, error in invalid_cases:
            with self.subTest(full_size=full_size, box=box):
                with self.assertRaisesRegex(ValueError, error):
                    restore_registered_crop(crop, full_size, box)


if __name__ == "__main__":
    unittest.main()
