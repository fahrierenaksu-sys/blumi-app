"""Contract tests for semantic seated garment extraction."""

from __future__ import annotations

import unittest
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_male_sitting_semantic_garment_v1 as subject


class SemanticGarmentTests(unittest.TestCase):
    def test_colorblock_mask_excludes_all_canonical_skin_and_shoe_pixels(self) -> None:
        mask = subject.colorblock_garment_mask(subject.source_rgba())
        source = subject.source_rgba()
        # Garment extraction must not include the peach source skin or tan shoes.
        selected = source[mask]
        self.assertGreater(len(selected), 200)
        self.assertFalse(np.any((selected[:, 0] > 180) & (selected[:, 1] > 115) & (selected[:, 2] < 125)))
        self.assertFalse(np.any((selected[:, 0] > 160) & (selected[:, 1] > 125) & (selected[:, 2] < 110)))

    def test_candidate_keeps_canonical_arms_and_shoes_unchanged(self) -> None:
        candidate = np.asarray(subject.compose_colorblock())
        underlay = np.asarray(subject.canonical_underlay())
        rows, cols = np.indices((subject.CANVAS[1], subject.CANVAS[0]))
        protected = ((cols < 86) | (cols > 170) | (rows >= subject.SHOE_LOCK_Y)) & (underlay[..., 3] > 8)
        self.assertTrue(np.array_equal(candidate[protected], underlay[protected]))

    def test_candidate_has_no_rectangular_bottom_cut(self) -> None:
        mask = subject.colorblock_garment_mask(subject.source_rgba())
        # At least one lower garment row must not be a solid x-range; a fitted
        # garment contour cannot be a copied rectangular strip.
        occupied = mask.sum(axis=1)
        self.assertTrue(any(0 < count < 78 for count in occupied[300:subject.SHOE_LOCK_Y]))


if __name__ == "__main__":
    unittest.main()
