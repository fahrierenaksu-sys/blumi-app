import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_male_wardrobe_static_progress_qa import (
    CONTACT_CROP,
    _render_cell,
    render_progress_board,
)


class RenderMaleWardrobeStaticProgressQaTests(unittest.TestCase):
    def test_contact_crop_upscales_to_slot_while_full_body_only_downsizes(self) -> None:
        composite = Image.new("RGBA", (256, 384), (220, 40, 40, 255))

        cell = _render_cell(
            composite,
            "scale-regression",
            1,
            contact_crop=CONTACT_CROP,
        )

        red_mask = Image.new("1", cell.size, 0)
        red_mask.putdata(
            [
                1 if red > 180 and green < 100 and blue < 100 else 0
                for red, green, blue, _alpha in cell.getdata()
            ]
        )
        self.assertEqual(red_mask.crop((0, 0, 146, 270)).getbbox(), (8, 34, 136, 226))
        self.assertEqual(
            red_mask.crop((146, 34, 346, 258)).getbbox(),
            (11, 0, 188, 224),
        )

    def test_renders_sorted_full_body_and_contact_closeups(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for slug, color in (("zeta", (220, 40, 40, 255)), ("alpha", (30, 80, 210, 255))):
                rig = root / slug / "rig"
                rig.mkdir(parents=True)
                image = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
                for x in range(80, 176):
                    for y in range(170, 310):
                        image.putpixel((x, y), color)
                image.save(rig / "composite.png")

            output = root / "qa.png"
            result = render_progress_board(root, output, columns=2)

            self.assertEqual(result.item_count, 2)
            self.assertEqual(result.slugs, ("alpha", "zeta"))
            self.assertTrue(output.exists())
            with Image.open(output) as rendered:
                self.assertEqual(rendered.size, (720, 270))

    def test_rejects_missing_or_noncanonical_composites(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            rig = root / "broken" / "rig"
            rig.mkdir(parents=True)
            Image.new("RGBA", (128, 192), (0, 0, 0, 0)).save(rig / "composite.png")

            with self.assertRaisesRegex(ValueError, "256x384"):
                render_progress_board(root, root / "qa.png")

    def test_shoe_contact_region_includes_the_canonical_foot_zone(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            rig = root / "shoe" / "rig"
            rig.mkdir(parents=True)
            image = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
            for x in range(105, 151):
                for y in range(330, 365):
                    image.putpixel((x, y), (210, 50, 80, 255))
            image.save(rig / "composite.png")

            output = root / "shoe-qa.png"
            render_progress_board(root, output, columns=1, contact_region="shoe")

            with Image.open(output).convert("RGBA") as rendered:
                closeup = rendered.crop((146, 34, 346, 258))
                visible_red = sum(
                    1
                    for red, green, blue, alpha in closeup.getdata()
                    if alpha > 0 and red > 180 and green < 100 and blue < 120
                )
                self.assertGreater(visible_red, 100)

    def test_can_render_a_named_secondary_contact_composite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            rig = root / "shoe" / "rig"
            rig.mkdir(parents=True)
            Image.new("RGBA", (256, 384), (20, 40, 180, 255)).save(
                rig / "composite.png"
            )
            Image.new("RGBA", (256, 384), (210, 50, 80, 255)).save(
                rig / "composite-relaxed.png"
            )

            output = root / "relaxed-qa.png"
            result = render_progress_board(
                root,
                output,
                columns=1,
                composite_name="composite-relaxed.png",
            )

            self.assertEqual(result.item_count, 1)
            with Image.open(output).convert("RGBA") as rendered:
                self.assertEqual(rendered.getpixel((40, 80))[:3], (210, 50, 80))


if __name__ == "__main__":
    unittest.main()
