#!/usr/bin/env python3
"""Contract tests for the consolidated male-bottom 19/19 proof board."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("render_male_bottom_19_final_review_board.py")
SPEC = importlib.util.spec_from_file_location("male_bottom_final_board", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MaleBottomFinalBoardTests(unittest.TestCase):
    def test_inventory_is_exactly_the_canonical_nineteen(self) -> None:
        slugs = [item.slug for item in MODULE.ITEMS]
        self.assertEqual(len(slugs), 19)
        self.assertEqual(len(set(slugs)), 19)
        self.assertEqual(set(slugs), set(MODULE.SITTING_COMPOSITES))

    def test_every_item_has_four_walking_layers_and_one_current_sitting_composite(self) -> None:
        for item in MODULE.ITEMS:
            with self.subTest(item=item.slug):
                for state in MODULE.WALK_STATES:
                    layer = MODULE.walking_layer(item.slug, state)
                    self.assertTrue(layer.is_file())
                    self.assertEqual(MODULE.load(layer).size, MODULE.CANVAS)
                sitting = MODULE.sitting_composite(item.slug)
                self.assertTrue(sitting.is_file())
                image = MODULE.load(sitting)
                self.assertEqual(image.size, MODULE.CANVAS)
                self.assertGreater(int((np.asarray(image)[..., 3] > 24).sum()), 3000)

    def test_render_is_a_single_19_by_5_runtime_isolated_board(self) -> None:
        board = MODULE.render_board()
        self.assertEqual(board.size, MODULE.BOARD_SIZE)
        self.assertEqual(MODULE.OUTPUT.parents[0], MODULE.EVIDENCE)
        self.assertNotIn("apps/mobile/src", MODULE.OUTPUT.as_posix())


if __name__ == "__main__":
    unittest.main()
