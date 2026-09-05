#!/usr/bin/env python3
"""TDD gate for Wide Pleated Technical Trousers seated candidate."""

from collections import deque
import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_wide_pleated_v1.py")
SPEC = importlib.util.spec_from_file_location("package_wide_pleated", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageWidePleatedSittingTests(unittest.TestCase):
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
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = current_row + dr, current_col + dc
                    if 0 <= nr < mask.shape[0] and 0 <= nc < mask.shape[1] and remaining[nr, nc]:
                        remaining[nr, nc] = False
                        queue.append((nr, nc))
        return count

    def test_candidate_is_canonical_clean_and_atomic(self) -> None:
        self.assertEqual(self.layer.size, (256, 384))
        self.assertEqual(self._component_count(self.alpha), 1)
        self.assertFalse(np.any(self.pixels[self.pixels[..., 3] == 0, :3]))

    def test_controlled_waist_and_wide_thigh_volume(self) -> None:
        top = np.asarray(MODULE.load(MODULE.TOP))[..., 3] > 24
        for row in range(283, 288):
            bottom_x = np.where(self.alpha[row])[0]
            top_x = np.where(top[row])[0]
            self.assertGreater(len(bottom_x), 35)
            self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
            self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)
        self.assertGreater(int(self.alpha[316, 86:127].sum()), 30)
        self.assertGreater(int(self.alpha[316, 130:171].sum()), 30)

    def test_pleats_and_opaque_pelvis_seam_remain_readable(self) -> None:
        self.assertTrue(self.alpha[306:329, 126:131].all())
        luminance = self.pixels[..., :3].astype(np.float32).mean(axis=2)
        # Structural pleat contrast is a better gate than a global variance
        # threshold: the highlight ridge and dark fold must both survive.
        left_ridge = float(luminance[295:325, 104:108].mean())
        left_fold = float(luminance[295:325, 123:127].mean())
        center_seam = float(luminance[295:325, 128].mean())
        inner_panels = float(luminance[295:325, [120, 136]].mean())
        self.assertGreater(left_ridge - left_fold, 18.0)
        self.assertGreater(inner_panels - center_seam, 15.0)

    def test_wide_hems_reveal_shoes_progressively(self) -> None:
        shoes = np.asarray(MODULE.load(MODULE.SHOES))[..., 3] > 24
        overlap = self.alpha & shoes
        total = int(overlap.sum())
        self.assertGreater(total, 110)
        self.assertLess(total, 330)
        contacts = [int(overlap[row].sum()) for row in range(329, 334)]
        self.assertTrue(all(left > right for left, right in zip(contacts, contacts[1:])))
        self.assertGreater(contacts[-1], 0)
        self.assertEqual(int(overlap[334:].sum()), 0)
        self.assertFalse(self.alpha[329:338, 127:130].any())

    def test_no_arm_or_sole_residue(self) -> None:
        rows, cols = np.indices(self.alpha.shape)
        side_arm_zone = (rows >= 280) & (rows <= 326) & ((cols <= 86) | (cols >= 170))
        self.assertEqual(int((self.alpha & side_arm_zone).sum()), 0)
        self.assertEqual(int(self.alpha[340:].sum()), 0)


if __name__ == "__main__":
    unittest.main()
