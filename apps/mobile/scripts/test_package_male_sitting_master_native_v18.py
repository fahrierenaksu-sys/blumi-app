"""Regression contract for seated master-native evidence candidates."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_sitting_master_native_v18.py")
SPEC = importlib.util.spec_from_file_location("male_sitting_master_native_v18", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class MasterNativeSittingV18Tests(unittest.TestCase):
    def test_normalized_master_matches_native_canvas(self) -> None:
        for source in MODULE.SOURCES.values():
            candidate = MODULE.normalized_master(source)
            self.assertEqual(candidate.size, MODULE.CANVAS)
            self.assertIsNotNone(candidate.getbbox())

    def test_expected_outputs_cover_all_targets(self) -> None:
        outputs = MODULE.expected_outputs()
        self.assertEqual(set(outputs), set(MODULE.SOURCES))
        for path in outputs.values():
            self.assertTrue(path.name.endswith("-master-native-seated-v18.png"))

    def test_board_builder_writes_three_panels(self) -> None:
        sample = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        previews = {slug: sample for slug in MODULE.SOURCES}
        board, closeups = MODULE.build_boards(previews)
        self.assertGreaterEqual(board.size[0], 3 * 320)
        self.assertGreaterEqual(closeups.size[0], 3 * 320)


if __name__ == "__main__":
    unittest.main()
