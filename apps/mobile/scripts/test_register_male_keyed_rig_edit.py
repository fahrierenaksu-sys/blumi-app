import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from register_male_keyed_rig_edit import (
    cleanup_alpha_components,
    extract_keyed_foreground,
    keyed_bbox,
    main,
    register_keyed_edit,
    sanitize_bottom_foot_contact,
)


class RegisterMaleKeyedRigEditTests(unittest.TestCase):
    def test_registers_generated_art_to_canonical_keyed_body_bounds(self) -> None:
        guide = Image.new("RGB", (100, 100), (0, 255, 0))
        guide_draw = ImageDraw.Draw(guide)
        guide_draw.rectangle((20, 10, 79, 89), fill=(255, 0, 255))
        guide_draw.rectangle((35, 45, 64, 69), fill=(35, 35, 40))

        generated = Image.new("RGB", (200, 200), (12, 240, 8))
        generated_draw = ImageDraw.Draw(generated)
        generated_draw.rectangle((40, 20, 159, 179), fill=(255, 0, 255))
        generated_draw.rectangle((70, 90, 129, 139), fill=(35, 35, 40))

        registered = register_keyed_edit(generated, guide)

        self.assertEqual(registered.size, guide.size)
        self.assertEqual(keyed_bbox(registered), keyed_bbox(guide))
        self.assertEqual(registered.getpixel((50, 55)), (35, 35, 40, 255))
        self.assertEqual(registered.getpixel((5, 5)), (0, 255, 0, 255))

    def test_rejects_an_image_without_a_magenta_registration_body(self) -> None:
        guide = Image.new("RGB", (32, 32), (0, 255, 0))
        generated = guide.copy()
        with self.assertRaisesRegex(ValueError, "magenta"):
            register_keyed_edit(generated, guide)

    def test_cli_writes_exact_guide_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            guide = Image.new("RGB", (40, 60), (0, 255, 0))
            ImageDraw.Draw(guide).rectangle((10, 10, 29, 49), fill=(255, 0, 255))
            generated = guide.resize((80, 120), Image.Resampling.NEAREST)
            output = root / "registered.png"

            register_keyed_edit(generated, guide).save(output)

            with Image.open(output) as rendered:
                self.assertEqual(rendered.size, (40, 60))

    def test_bottom_contact_sanitizer_removes_generated_shoes_below_approved_hem(self) -> None:
        guide = Image.new("RGBA", (12, 12), (0, 255, 0, 255))
        guide_draw = ImageDraw.Draw(guide)
        guide_draw.rectangle((3, 1, 8, 5), fill=(255, 0, 255, 255))
        guide_draw.rectangle((3, 6, 4, 7), fill=(30, 35, 45, 255))
        guide_draw.rectangle((7, 6, 8, 7), fill=(30, 35, 45, 255))
        guide_draw.rectangle((3, 8, 4, 10), fill=(255, 0, 255, 255))
        guide_draw.rectangle((7, 8, 8, 10), fill=(255, 0, 255, 255))

        generated = guide.copy()
        generated_draw = ImageDraw.Draw(generated)
        generated_draw.rectangle((1, 6, 10, 11), fill=(245, 240, 220, 255))

        sanitized = sanitize_bottom_foot_contact(generated, guide)

        self.assertEqual(
            list(sanitized.crop((0, 6, 12, 12)).getdata()),
            list(guide.crop((0, 6, 12, 12)).getdata()),
        )
        self.assertEqual(sanitized.getpixel((3, 6)), (30, 35, 45, 255))
        self.assertEqual(sanitized.getpixel((1, 6)), (0, 255, 0, 255))
        self.assertEqual(sanitized.getpixel((3, 9)), (255, 0, 255, 255))
        self.assertEqual(sanitized.getpixel((1, 9)), (0, 255, 0, 255))

    def test_bottom_contact_sanitizer_requires_lower_body_registration(self) -> None:
        guide = Image.new("RGBA", (12, 12), (0, 255, 0, 255))
        ImageDraw.Draw(guide).rectangle((3, 1, 8, 4), fill=(255, 0, 255, 255))

        with self.assertRaisesRegex(ValueError, "lower-body"):
            sanitize_bottom_foot_contact(guide.copy(), guide)

    def test_extracts_only_non_keyed_foreground_with_clean_transparency(self) -> None:
        keyed = Image.new("RGBA", (4, 2), (0, 255, 0, 255))
        keyed.putpixel((1, 0), (255, 0, 255, 255))
        keyed.putpixel((2, 0), (45, 50, 65, 255))
        keyed.putpixel((3, 0), (12, 225, 20, 255))
        keyed.putpixel((2, 1), (225, 135, 190, 255))

        foreground = extract_keyed_foreground(keyed)

        self.assertEqual(foreground.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(foreground.getpixel((1, 0)), (0, 0, 0, 0))
        self.assertEqual(foreground.getpixel((2, 0)), (45, 50, 65, 255))
        self.assertEqual(foreground.getpixel((3, 0)), (0, 0, 0, 0))
        self.assertEqual(foreground.getpixel((2, 1)), (225, 135, 190, 255))

    def test_component_cleanup_retains_shoes_and_removes_key_residue(self) -> None:
        foreground = Image.new("RGBA", (20, 12), (0, 0, 0, 0))
        shoe_left = (44, 50, 70, 255)
        shoe_right = (80, 65, 55, 190)
        for position in ((2, 8), (3, 8), (4, 8), (2, 9), (3, 9)):
            foreground.putpixel(position, shoe_left)
        ImageDraw.Draw(foreground).rectangle((12, 8, 17, 10), fill=shoe_right)

        residue_pixels = (
            (0, 0),
            (4, 1),
            (8, 2),
            (19, 3),
            (10, 0),
            (11, 1),
            (12, 2),
            (13, 3),
            (14, 4),
            (9, 4),
            (9, 5),
            (9, 6),
            (1, 5),
        )
        for index, position in enumerate(residue_pixels):
            foreground.putpixel(position, (190, 25 + index, 180, 80 + index))

        cleaned = cleanup_alpha_components(foreground, min_pixel_count=5)

        self.assertEqual(cleaned.getpixel((2, 8)), shoe_left)
        self.assertEqual(cleaned.getpixel((17, 10)), shoe_right)
        self.assertTrue(
            all(cleaned.getpixel(position) == (0, 0, 0, 0) for position in residue_pixels)
        )

    def test_component_cleanup_zero_threshold_preserves_every_rgba_pixel(self) -> None:
        foreground = Image.new("RGBA", (3, 2), (0, 0, 0, 0))
        foreground.putpixel((0, 0), (10, 20, 30, 1))
        foreground.putpixel((2, 1), (40, 50, 60, 230))

        cleaned = cleanup_alpha_components(foreground, min_pixel_count=0)

        self.assertEqual(list(cleaned.getdata()), list(foreground.getdata()))

    def test_component_cleanup_rejects_negative_threshold(self) -> None:
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            cleanup_alpha_components(
                Image.new("RGBA", (1, 1), (1, 2, 3, 255)),
                min_pixel_count=-1,
            )

    def test_cli_applies_component_cleanup_only_to_foreground_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            guide = Image.new("RGBA", (12, 12), (0, 255, 0, 255))
            guide_draw = ImageDraw.Draw(guide)
            guide_draw.rectangle((2, 2, 9, 9), fill=(255, 0, 255, 255))
            generated = guide.copy()
            generated.putpixel((0, 0), (30, 35, 45, 255))
            generated_path = root / "generated.png"
            guide_path = root / "guide.png"
            output_path = root / "registered.png"
            foreground_path = root / "foreground.png"
            generated.save(generated_path)
            guide.save(guide_path)

            with patch.object(
                sys,
                "argv",
                [
                    "register_male_keyed_rig_edit.py",
                    "--generated",
                    str(generated_path),
                    "--guide",
                    str(guide_path),
                    "--output",
                    str(output_path),
                    "--output-foreground",
                    str(foreground_path),
                    "--min-foreground-component-pixels",
                    "2",
                ],
            ):
                main()

            with Image.open(output_path) as registered:
                self.assertEqual(registered.getpixel((0, 0)), (30, 35, 45, 255))
            with Image.open(foreground_path) as foreground:
                self.assertEqual(foreground.getpixel((0, 0)), (0, 0, 0, 0))

    def test_cli_rejects_negative_component_threshold(self) -> None:
        with patch.object(
            sys,
            "argv",
            [
                "register_male_keyed_rig_edit.py",
                "--generated",
                "generated.png",
                "--guide",
                "guide.png",
                "--output",
                "registered.png",
                "--min-foreground-component-pixels",
                "-1",
            ],
        ):
            with self.assertRaises(SystemExit):
                main()


if __name__ == "__main__":
    unittest.main()
