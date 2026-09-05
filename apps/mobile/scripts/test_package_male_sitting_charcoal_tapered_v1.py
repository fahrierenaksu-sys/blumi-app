#!/usr/bin/env python3
"""TDD gate for the Charcoal Tapered Chinos seated candidate."""

from collections import deque
import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_charcoal_tapered_v1.py")
SPEC = importlib.util.spec_from_file_location("package_charcoal_sitting", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageCharcoalTaperedSittingTests(unittest.TestCase):
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

    def test_tapered_waist_is_joined_and_stays_inside_test_top_contact(self) -> None:
        top = np.asarray(MODULE.load(MODULE.TOP))[..., 3] > 24
        for row in range(283, 288):
            bottom_x = np.where(self.alpha[row])[0]
            top_x = np.where(top[row])[0]
            self.assertGreater(len(bottom_x), 35)
            self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
            self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)

    def test_chinos_keep_two_tapered_thighs_and_material_detail(self) -> None:
        self.assertGreater(int(self.alpha[318, 92:127].sum()), 22)
        self.assertGreater(int(self.alpha[318, 130:165].sum()), 22)
        self.assertFalse(self.alpha[318, 127:130].all())
        rgb = self.pixels[self.alpha, :3].astype(np.float32)
        self.assertGreater(float(rgb.std(axis=0).mean()), 10.0)
        self.assertLess(float(rgb.mean()), 105.0)

    def test_tapered_cuffs_reveal_shoe_tongues_without_square_overlap(self) -> None:
        shoes = np.asarray(MODULE.load(MODULE.SHOES))[..., 3] > 24
        overlap = self.alpha & shoes
        total = int(overlap.sum())
        self.assertGreater(total, 65)
        self.assertLess(total, 240)
        contacts = [int(overlap[row].sum()) for row in range(329, 334)]
        self.assertTrue(all(left > right for left, right in zip(contacts, contacts[1:])))
        self.assertGreater(contacts[-1], 0)
        self.assertEqual(int(overlap[334:].sum()), 0)
        self.assertFalse(self.alpha[329:338, 127:130].any())
        for x in (110, 146):
            self.assertEqual(int(self.pixels[332, x, 3]), 0)

    def test_candidate_contains_no_arm_skin_or_shoe_color_islands(self) -> None:
        rows, cols = np.indices(self.alpha.shape)
        side_arm_zone = (rows >= 280) & (rows <= 326) & ((cols <= 88) | (cols >= 168))
        self.assertEqual(int((self.alpha & side_arm_zone).sum()), 0)
        # Chino layer must stop before the canonical footwear sole region.
        self.assertEqual(int(self.alpha[340:].sum()), 0)


if __name__ == "__main__":
    unittest.main()
