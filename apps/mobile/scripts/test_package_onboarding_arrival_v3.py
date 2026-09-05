import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


SCRIPT = Path(__file__).with_name("package_onboarding_arrival_v3.py")
SPEC = importlib.util.spec_from_file_location("package_onboarding_arrival_v3", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PackageOnboardingArrivalV3Test(unittest.TestCase):
    def test_builds_a_texture_safe_six_by_five_runtime_atlas(self):
        frames = []
        for index in range(30):
            frame = Image.new("RGBA", MODULE.FRAME_SIZE, (index, 0, 0, 255))
            frames.append(frame)

        atlas = MODULE.build_runtime_atlas(frames)

        self.assertEqual(
            atlas.size,
            (MODULE.COLS * MODULE.FRAME_SIZE[0], MODULE.ROWS * MODULE.FRAME_SIZE[1]),
        )
        self.assertLessEqual(max(atlas.size), 2048)
        self.assertEqual(atlas.getpixel((0, 0)), (0, 0, 0, 255))
        self.assertEqual(
            atlas.getpixel((MODULE.FRAME_SIZE[0], 0)),
            (1, 0, 0, 255),
        )

    def test_removes_only_connected_checker_and_preserves_enclosed_light_detail(self):
        image = Image.new("RGB", (40, 40), (246, 246, 246))
        draw = ImageDraw.Draw(image)
        draw.ellipse((8, 8, 31, 31), fill=(90, 35, 30))
        draw.ellipse((14, 14, 25, 25), fill=(250, 250, 250))

        cleaned = MODULE.remove_connected_checker_background(image)

        self.assertEqual(cleaned.getpixel((0, 0))[3], 0)
        self.assertEqual(cleaned.getpixel((20, 20))[3], 255)

    def test_packages_exactly_thirty_rgba_frames(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            sheet = Image.new("RGB", (600, 500), (246, 246, 246))
            draw = ImageDraw.Draw(sheet)
            for row in range(5):
                for column in range(6):
                    x = column * 100 + 35
                    y = row * 100 + 25
                    draw.ellipse((x, y, x + 30, y + 50), fill=(180, 70, 90))
            source = root / "sheet.png"
            output = root / "frames"
            output.mkdir()
            sheet.save(source)

            MODULE.package_role(source, output, "female")

            frames = sorted(output.glob("blumi_intro_arrival_female_f[0-9][0-9].png"))
            self.assertEqual(len(frames), 30)
            self.assertTrue((output / "blumi_intro_arrival_female_atlas.png").exists())
            with Image.open(frames[0]) as packaged:
                self.assertEqual(packaged.mode, "RGBA")
                self.assertEqual(packaged.size, (256, 384))

            tail_bounds = []
            for frame_path in frames[-8:]:
                with Image.open(frame_path) as packaged:
                    bounds = packaged.getchannel("A").getbbox()
                    self.assertIsNotNone(bounds)
                    tail_bounds.append(bounds)

            self.assertEqual(
                {bounds[3] for bounds in tail_bounds if bounds is not None},
                {MODULE.RUN_HANDOFF_BASELINE_Y},
            )


if __name__ == "__main__":
    unittest.main()
