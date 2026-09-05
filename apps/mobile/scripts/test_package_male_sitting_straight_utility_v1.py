#!/usr/bin/env python3
"""TDD gate for Straight Utility-Tailored Trousers seated candidate."""

from collections import deque
import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_straight_utility_v1.py")
SPEC = importlib.util.spec_from_file_location("package_straight_utility_sitting", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageStraightUtilitySittingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.layer = MODULE.extract_bottom(MODULE.load(MODULE.MASTER))
        self.pixels = np.asarray(self.layer)
        self.alpha = self.pixels[..., 3] > 24

    @staticmethod
    def _component_count(mask: np.ndarray) -> int:
        remaining = mask.copy()
        count = 0
        for row, col in zip(*np.where(remaining)):
            if not remaining[row, col]:
                continue
            count += 1
            queue = deque([(int(row), int(col))])
            remaining[row, col] = False
            while queue:
                current_row, current_col = queue.popleft()
                for row_delta, col_delta in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    next_row = current_row + row_delta
                    next_col = current_col + col_delta
                    if (
                        0 <= next_row < mask.shape[0]
                        and 0 <= next_col < mask.shape[1]
                        and remaining[next_row, next_col]
                    ):
                        remaining[next_row, next_col] = False
                        queue.append((next_row, next_col))
        return count

    def test_candidate_is_canonical_clean_and_atomic(self) -> None:
        self.assertEqual(self.layer.size, (256, 384))
        self.assertEqual(self._component_count(self.alpha), 1)
        self.assertFalse(np.any(self.pixels[self.pixels[..., 3] == 0, :3]))

    def test_waist_contact_is_continuous_and_inside_top_envelope(self) -> None:
        top = np.asarray(MODULE.load(MODULE.TOP))[..., 3] > 24
        for row in range(283, 288):
            bottom_x = np.where(self.alpha[row])[0]
            top_x = np.where(top[row])[0]
            self.assertGreater(len(bottom_x), 35)
            self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
            self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)

    def test_tailored_thighs_gap_and_utility_pockets_remain_readable(self) -> None:
        self.assertGreater(int(self.alpha[316, 91:127].sum()), 24)
        self.assertGreater(int(self.alpha[316, 130:166].sum()), 24)
        self.assertFalse(self.alpha[318, 127:130].all())
        rgb = self.pixels[..., :3].astype(np.int16)
        olive = self.alpha & (rgb[..., 1] > rgb[..., 2] + 5) & (rgb[..., 0] < 140)
        self.assertGreater(int(olive[294:325, 88:108].sum()), 25)
        self.assertGreater(int(olive[294:325, 148:168].sum()), 25)

    def test_straight_hems_taper_over_shoe_sides(self) -> None:
        shoes = np.asarray(MODULE.load(MODULE.SHOES))[..., 3] > 24
        overlap = self.alpha & shoes
        total = int(overlap.sum())
        self.assertGreater(total, 70)
        self.assertLess(total, 260)
        contacts = [int(overlap[row].sum()) for row in range(329, 334)]
        self.assertTrue(all(left > right for left, right in zip(contacts, contacts[1:])))
        self.assertGreater(contacts[-1], 0)
        self.assertEqual(int(overlap[334:].sum()), 0)
        self.assertFalse(self.alpha[329:338, 127:130].any())
        for x in (110, 146):
            self.assertEqual(int(self.pixels[332, x, 3]), 0)

    def test_candidate_contains_no_arm_skin_or_sole_region(self) -> None:
        rows, cols = np.indices(self.alpha.shape)
        side_arm_zone = (rows >= 280) & (rows <= 326) & ((cols <= 87) | (cols >= 169))
        self.assertEqual(int((self.alpha & side_arm_zone).sum()), 0)
        self.assertEqual(int(self.alpha[340:].sum()), 0)

    def test_hidden_waist_contains_no_top_outline_or_skin_colored_side_fragments(self) -> None:
        self.assertEqual(int(self.alpha[:283].sum()), 0)
        rgb = self.pixels[..., :3].astype(np.int16)
        rows, cols = np.indices(self.alpha.shape)
        warm_fragment = (
            self.alpha
            & (rows >= 288)
            & (rows <= 300)
            & ((cols < 100) | (cols > 155))
            & (rgb[..., 0] > 120)
            & (rgb[..., 0] > rgb[..., 1] + 18)
        )
        self.assertEqual(int(warm_fragment.sum()), 0)


if __name__ == "__main__":
    unittest.main()
