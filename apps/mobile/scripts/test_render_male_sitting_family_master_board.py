"""Regression contract for the sitting-bottom family approval board."""

from pathlib import Path
import importlib.util
import unittest


SCRIPT_PATH = Path(__file__).with_name("render_male_sitting_family_master_board.py")
SPEC = importlib.util.spec_from_file_location("sitting_family_board", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RenderMaleSittingFamilyMasterBoardTests(unittest.TestCase):
    def test_the_board_has_one_unique_panel_for_each_fit_family(self) -> None:
        families = [panel.key for panel in MODULE.PANELS]

        self.assertEqual(families, ["straight", "relaxed", "cargo", "shorts"])
        self.assertEqual(len(families), len(set(families)))

    def test_panel_sources_are_versioned_candidate_masters(self) -> None:
        for panel in MODULE.PANELS:
            self.assertIn("-sitting-master-v1-256.png", panel.source.name)
            self.assertIn("family-masters", str(panel.source))

    def test_render_writes_a_two_by_two_review_board(self) -> None:
        image = MODULE.render_board()

        self.assertEqual(image.size, (760, 1040))
        self.assertEqual(image.mode, "RGBA")


if __name__ == "__main__":
    unittest.main()
