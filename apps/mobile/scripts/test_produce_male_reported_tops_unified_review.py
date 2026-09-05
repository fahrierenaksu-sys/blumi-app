from __future__ import annotations

import sys
import unittest
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_reported_tops_unified_review import (
    PROFILES,
    REVIEW_BOARD,
    produce,
)


class ProduceMaleReportedTopsUnifiedReviewTests(unittest.TestCase):
    def test_profiles_keep_open_and_closed_necks_physically_distinct(self) -> None:
        self.assertEqual(
            "shirt_open_camp_collar",
            PROFILES["tonal_geometric_camp_collar_shirt"]["family"],
        )
        self.assertTrue(
            PROFILES["tonal_geometric_camp_collar_shirt"]["visibleNeck"]
        )
        self.assertEqual(
            "hoodie_or_sweat_closed_neck",
            PROFILES["modern_track_luxury_top"]["family"],
        )
        self.assertFalse(PROFILES["modern_track_luxury_top"]["visibleNeck"])

    def test_producer_writes_two_item_unified_body_review_board(self) -> None:
        manifest = produce()

        self.assertEqual(2, len(manifest["items"]))
        self.assertEqual(
            "single_unified_head_neck_body_layer",
            manifest["compositionContract"],
        )
        self.assertFalse(manifest["runtimePromoted"])
        with Image.open(REVIEW_BOARD) as board:
            self.assertEqual("RGB", board.mode)
            self.assertEqual((1680, 760), board.size)


if __name__ == "__main__":
    unittest.main()
