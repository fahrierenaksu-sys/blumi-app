"""TDD contract for normalized six-pose onboarding run candidates."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("prepare_onboarding_run_candidates.py")
SPEC = importlib.util.spec_from_file_location("prepare_onboarding_run_candidates", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrepareOnboardingRunCandidatesTests(unittest.TestCase):
    def test_splits_each_sheet_into_six_distinct_canonical_frames(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = MODULE.prepare_candidates(output)

            self.assertEqual(manifest["status"], "candidate-only")
            self.assertFalse(manifest["runtimePromotionAllowed"])
            self.assertEqual(manifest["frameCountPerRole"], 6)

            for role in ("female", "male"):
                paths = sorted(output.glob(f"blumi_intro_run_{role}_f*.png"))
                self.assertEqual(len(paths), 6)
                hashes: set[bytes] = set()
                baselines: list[int] = []

                for path in paths:
                    with Image.open(path) as source:
                        frame = source.convert("RGBA")
                    self.assertEqual(frame.size, MODULE.CANVAS_SIZE)
                    pixels = np.asarray(frame)
                    alpha = pixels[..., 3]
                    self.assertGreater(int((alpha > 24).sum()), 9_000)
                    self.assertFalse(np.any(pixels[alpha == 0, :3]))
                    rows = np.where(alpha > 24)[0]
                    baselines.append(int(rows.max()))
                    hashes.add(frame.tobytes())
                    component_sizes = [
                        len(component)
                        for component in MODULE.alpha_components(alpha > 24)
                    ]
                    self.assertTrue(component_sizes)
                    self.assertGreaterEqual(
                        min(component_sizes), MODULE.MIN_ALPHA_COMPONENT_AREA
                    )

                self.assertEqual(len(hashes), 6)
                self.assertLessEqual(max(baselines) - min(baselines), 1)
                self.assertEqual(max(baselines), MODULE.FOOT_BASELINE_Y)

    def test_rejects_non_alpha_or_wrong_grid_sources(self) -> None:
        opaque = Image.new("RGB", (600, 100), "white")
        with self.assertRaisesRegex(ValueError, "transparent RGBA"):
            MODULE.split_sheet(opaque, "male")

        malformed = Image.new("RGBA", (5, 100), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "six cells"):
            MODULE.split_sheet(malformed, "female")

    def test_normalizes_both_six_pose_wave_cycles_before_ui_use(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = MODULE.prepare_wave_candidates(output)

            self.assertEqual(manifest["status"], "candidate-only")
            self.assertEqual(manifest["frameCountPerRole"], 6)
            self.assertFalse(manifest["runtimePromotionAllowed"])
            for role in ("female", "male"):
                paths = sorted(output.glob(f"blumi_intro_wave_{role}_f*.png"))
                self.assertEqual(len(paths), 6)
                baselines = []
                hashes = set()
                for path in paths:
                    with Image.open(path) as source:
                        frame = source.convert("RGBA")
                    alpha = np.asarray(frame)[..., 3]
                    rows = np.where(alpha > 24)[0]
                    baselines.append(int(rows.max()))
                    hashes.add(frame.tobytes())
                self.assertEqual(len(hashes), 6)
                self.assertEqual(min(baselines), MODULE.FOOT_BASELINE_Y)
                self.assertEqual(max(baselines), MODULE.FOOT_BASELINE_Y)


if __name__ == "__main__":
    unittest.main()
