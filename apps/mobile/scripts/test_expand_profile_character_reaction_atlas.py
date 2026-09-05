#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).resolve().parent / "expand-profile-character-reaction-atlas.py"
SPEC = importlib.util.spec_from_file_location("expand_profile_character_reaction_atlas", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExpandProfileCharacterReactionAtlasTest(unittest.TestCase):
    def test_inserts_premultiplied_inbetweens_without_opaque_background(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.png"
            destination = Path(temp_dir) / "expanded.png"
            sheet = Image.new("RGBA", (MODULE.CANVAS[0] * 4, MODULE.CANVAS[1] * 3), (0, 0, 0, 0))
            for frame_index in range(12):
                x = (frame_index % 4) * MODULE.CANVAS[0] + 20 + frame_index
                y = (frame_index // 4) * MODULE.CANVAS[1] + 80
                for px in range(x, x + 24):
                    for py in range(y, y + 24):
                        sheet.putpixel((px, py), (255, 80, 140, 255))
            sheet.save(source)

            MODULE.build_inbetween_atlas(source, destination, insert_after=(0, 3, 5, 8))

            expanded = Image.open(destination).convert("RGBA")
            self.assertEqual(expanded.size, (1024, 1536))
            self.assertEqual(expanded.getpixel((0, 0))[3], 0)
            # The first synthetic frame sits between source frames 0 and 1.
            midpoint = expanded.crop((256, 0, 512, 384))
            self.assertIsNotNone(midpoint.getchannel("A").getbbox())
            self.assertLess(midpoint.getpixel((255, 255))[3], 255)

    def test_rejects_invalid_inbetween_indices(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.png"
            destination = Path(temp_dir) / "expanded.png"
            Image.new("RGBA", (1024, 1152), (0, 0, 0, 0)).save(source)

            with self.assertRaises(ValueError):
                MODULE.build_inbetween_atlas(source, destination, insert_after=(11,))


if __name__ == "__main__":
    unittest.main()
