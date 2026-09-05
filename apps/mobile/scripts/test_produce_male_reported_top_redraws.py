from __future__ import annotations

import sys
import unittest
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_male_reported_top_redraws import (
    OUTPUTS,
    REVIEW_BOARD,
    build_resort,
    build_track,
    produce,
)


class ProduceMaleReportedTopRedrawsTests(unittest.TestCase):
    def test_resort_uses_open_camp_collar_with_no_skin_plug(self) -> None:
        resort = build_resort()

        self.assertEqual((256, 384), resort.size)
        self.assertEqual("RGBA", resort.mode)
        self.assertLess(resort.getpixel((128, 219))[3], 16)
        self.assertGreater(resort.getpixel((114, 221))[3], 180)
        self.assertGreater(resort.getpixel((142, 221))[3], 180)

    def test_track_uses_closed_high_collar(self) -> None:
        track = build_track()

        self.assertEqual((256, 384), track.size)
        self.assertEqual("RGBA", track.mode)
        self.assertGreater(track.getpixel((128, 217))[3], 180)
        for y in range(216, 220):
            for x in range(120, 137):
                red, green, blue, alpha = track.getpixel((x, y))
                self.assertGreater(alpha, 220)
                self.assertGreater(red + green + blue, 105)

    def test_producer_writes_two_candidate_layers_and_review_board(self) -> None:
        manifest = produce()

        self.assertEqual(2, len(manifest["items"]))
        self.assertFalse(manifest["runtimePromoted"])
        for output in OUTPUTS.values():
            with Image.open(output) as image:
                self.assertEqual((256, 384), image.size)
                self.assertEqual("RGBA", image.mode)
        with Image.open(REVIEW_BOARD) as board:
            self.assertEqual("RGB", board.mode)
            self.assertEqual((1680, 760), board.size)


if __name__ == "__main__":
    unittest.main()
