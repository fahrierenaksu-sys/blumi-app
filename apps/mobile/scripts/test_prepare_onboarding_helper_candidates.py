import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("prepare_onboarding_helper_candidates.py")
SPEC = importlib.util.spec_from_file_location("prepare_onboarding_helper_candidates", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrepareOnboardingHelperCandidatesTests(unittest.TestCase):
    def test_packages_two_distinct_six_frame_helper_cycles_without_promoting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = MODULE.prepare_helper_candidates(output)

            self.assertEqual(manifest["status"], "candidate-only")
            self.assertFalse(manifest["runtimePromotionAllowed"])
            self.assertEqual(manifest["frameCountPerRole"], 6)
            self.assertEqual(manifest["canvas"], [256, 384])

            for role in ("female", "male"):
                paths = sorted(output.glob(f"blumi_onboarding_helper_{role}_f*.png"))
                self.assertEqual(len(paths), 6)
                hashes = set()
                baselines = []
                for path in paths:
                    with Image.open(path) as source:
                        frame = source.convert("RGBA")
                    self.assertEqual(frame.size, (256, 384))
                    pixels = np.asarray(frame)
                    alpha = pixels[..., 3]
                    self.assertGreater(int((alpha > 24).sum()), 8_000)
                    self.assertFalse(np.any(pixels[alpha == 0, :3]))
                    rows = np.where(alpha > 24)[0]
                    baselines.append(int(rows.max()))
                    hashes.add(frame.tobytes())
                self.assertEqual(len(hashes), 6)
                self.assertLessEqual(max(baselines) - min(baselines), 1)
                self.assertEqual(max(baselines), 360)

    def test_three_by_two_split_preserves_authored_order(self) -> None:
        sheet = Image.new("RGBA", (300, 200), (0, 0, 0, 0))
        for index, color in enumerate((
            (255, 0, 0, 255),
            (0, 255, 0, 255),
            (0, 0, 255, 255),
            (255, 255, 0, 255),
            (255, 0, 255, 255),
            (0, 255, 255, 255),
        )):
            x = (index % 3) * 100
            y = (index // 3) * 100
            patch = Image.new("RGBA", (20, 20), color)
            sheet.alpha_composite(patch, (x + 40, y + 40))

        frames = MODULE.split_three_by_two_sheet(sheet, "test")
        self.assertEqual(len(frames), 6)
        self.assertEqual([frame.getpixel((50, 50)) for frame in frames], [
            (255, 0, 0, 255),
            (0, 255, 0, 255),
            (0, 0, 255, 255),
            (255, 255, 0, 255),
            (255, 0, 255, 255),
            (0, 255, 255, 255),
        ])


if __name__ == "__main__":
    unittest.main()
