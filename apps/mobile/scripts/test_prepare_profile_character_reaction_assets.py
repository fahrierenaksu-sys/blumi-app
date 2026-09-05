#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = (
    Path(__file__).resolve().parent / "prepare-profile-character-reaction-assets.py"
)
SPEC = importlib.util.spec_from_file_location(
    "prepare_profile_character_reaction_assets", MODULE_PATH
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrepareProfileCharacterReactionAssetsTest(unittest.TestCase):
    def test_keep_primary_component_removes_detached_islands(self) -> None:
        cell = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
        for x in range(20, 80):
            for y in range(10, 110):
                cell.putpixel((x, y), (255, 180, 180, 255))
        for x in range(100, 108):
            for y in range(60, 68):
                cell.putpixel((x, y), (255, 180, 180, 255))

        filtered = MODULE.keep_primary_component(cell)

        self.assertEqual(filtered.getbbox(), (20, 10, 80, 110))
        self.assertEqual(filtered.getpixel((104, 64))[3], 0)

    def test_build_atlas_normalizes_a_nearly_exact_grid(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.png"
            destination = Path(temp_dir) / "atlas.png"
            sheet = Image.new("RGBA", (1402, 1122), (0, 0, 0, 0))
            for row in range(2):
                for column in range(4):
                    offset_x = 30 + column * 350
                    offset_y = 24 + row * 560
                    for x in range(offset_x, offset_x + 110):
                        for y in range(offset_y, offset_y + 260):
                            sheet.putpixel((x, y), (255, 220, 220, 255))
            sheet.save(source)

            MODULE.build_atlas(source, destination)

            atlas = Image.open(destination).convert("RGBA")
            self.assertEqual(atlas.size, (1024, 768))
            self.assertIsNotNone(atlas.getbbox())

    def test_build_atlas_accepts_a_4x4_inbetween_sheet(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source-4x4.png"
            destination = Path(temp_dir) / "atlas-4x4.png"
            sheet = Image.new("RGBA", (1402, 2242), (0, 0, 0, 0))
            for row in range(4):
                for column in range(4):
                    offset_x = 30 + column * 350
                    offset_y = 24 + row * 560
                    for x in range(offset_x, offset_x + 110):
                        for y in range(offset_y, offset_y + 260):
                            sheet.putpixel((x, y), (255, 220, 220, 255))
            sheet.save(source)

            MODULE.build_atlas(source, destination, grid=(4, 4))

            atlas = Image.open(destination).convert("RGBA")
            self.assertEqual(atlas.size, (1024, 1536))
            self.assertIsNotNone(atlas.getbbox())

    def test_normalize_cell_drops_low_alpha_generation_halo(self) -> None:
        cell = Image.new("RGBA", (128, 192), (0, 0, 0, 0))
        for x in range(40, 88):
            for y in range(24, 184):
                cell.putpixel((x, y), (248, 182, 120, 255))
        # Image generation often leaves a colored, nearly transparent fringe.
        cell.putpixel((39, 100), (255, 220, 20, 4))

        cleaned = MODULE.remove_low_alpha_pixels(cell)
        self.assertEqual(cleaned.getpixel((39, 100))[3], 0)
        self.assertEqual(cleaned.getpixel((40, 100))[3], 255)

        normalized = MODULE.normalize_cell(cleaned)

        self.assertEqual(normalized.getpixel((0, 0))[3], 0)
        self.assertEqual(normalized.getchannel("A").getextrema()[0], 0)
        self.assertEqual(max(normalized.getchannel("A").getdata()), 255)


if __name__ == "__main__":
    unittest.main()
