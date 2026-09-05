#!/usr/bin/env python3

from __future__ import annotations

import unittest
from pathlib import Path

from PIL import Image


ASSET_DIR = (
    Path(__file__).resolve().parents[1]
    / "src/features/session/assets/profile-character-reaction-v4-candidate"
)


class ProfileCharacterReactionV4AssetsTest(unittest.TestCase):
    def test_both_atlases_are_alpha_safe_4x4_sheets_with_a_shared_foot_anchor(self) -> None:
        for name in (
            "blumi_profile_twirling_female_atlas_v4_final.png",
            "blumi_profile_collar_male_atlas_v4_final.png",
        ):
            with self.subTest(name=name):
                atlas = Image.open(ASSET_DIR / name).convert("RGBA")
                self.assertEqual(atlas.size, (1024, 1536))
                self.assertEqual(atlas.getpixel((0, 0))[3], 0)
                for index in range(16):
                    frame = atlas.crop(
                        (
                            (index % 4) * 256,
                            (index // 4) * 384,
                            (index % 4 + 1) * 256,
                            (index // 4 + 1) * 384,
                        )
                    )
                    bounds = frame.getchannel("A").getbbox()
                    self.assertIsNotNone(bounds)
                    assert bounds is not None
                    self.assertGreaterEqual(bounds[0], 0)
                    self.assertGreaterEqual(bounds[1], 0)
                    self.assertLessEqual(bounds[2], 256)
                    self.assertEqual(bounds[3], 372)


if __name__ == "__main__":
    unittest.main()
