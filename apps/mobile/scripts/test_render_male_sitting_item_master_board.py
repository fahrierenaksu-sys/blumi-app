"""Contract for the complete candidate-only seated-bottom review board."""

from pathlib import Path
import importlib.util
import unittest


SCRIPT_PATH = Path(__file__).with_name("render_male_sitting_item_master_board.py")
SPEC = importlib.util.spec_from_file_location("sitting_item_board", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RenderMaleSittingItemMasterBoardTests(unittest.TestCase):
    def test_board_covers_the_complete_19_item_bottom_inventory_once(self) -> None:
        keys = [panel.key for panel in MODULE.PANELS]

        self.assertEqual(len(keys), 19)
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_panel_uses_a_versioned_item_master(self) -> None:
        for panel in MODULE.PANELS:
            self.assertIn("item-masters", str(panel.source))
            self.assertTrue(panel.source.name.endswith("-sitting-master-v1-1024.png"))

    def test_render_writes_a_four_column_complete_review_board(self) -> None:
        image = MODULE.render_board()

        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (1080, 1760))


if __name__ == "__main__":
    unittest.main()
