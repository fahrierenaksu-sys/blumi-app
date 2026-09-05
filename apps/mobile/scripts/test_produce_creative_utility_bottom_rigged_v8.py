from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v6 import build_candidate as build_v6_candidate  # noqa: E402
from produce_creative_utility_bottom_rigged_v8 import build_candidate  # noqa: E402


class ProduceCreativeUtilityBottomRiggedV8Tests(unittest.TestCase):
    def test_upper_garment_is_unchanged(self) -> None:
        before = np.asarray(build_v6_candidate())
        after = np.asarray(build_candidate())
        self.assertTrue(np.array_equal(before[:323], after[:323]))

    def test_broken_lower_fragments_are_fully_removed(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.all(alpha[326:] == 0))

    def test_cuff_contact_band_is_two_solid_pieces_without_skin_holes(self) -> None:
        alpha = np.asarray(build_candidate())[..., 3]
        self.assertTrue(np.all(alpha[323, 101:127] > 240))
        self.assertTrue(np.all(alpha[324, 102:127] > 240))
        self.assertTrue(np.all(alpha[325, 104:127] > 240))
        self.assertTrue(np.all(alpha[323, 129:155] > 240))
        self.assertTrue(np.all(alpha[324, 129:154] > 240))
        self.assertTrue(np.all(alpha[325, 129:152] > 240))
        self.assertTrue(np.all(alpha[323:326, 127:129] == 0))

    def test_contact_band_stays_olive_and_transparency_is_clean(self) -> None:
        candidate = np.asarray(build_candidate())
        band = candidate[323:326, 99:153]
        visible = band[..., 3] > 240
        mean = band[visible, :3].mean(axis=0)
        self.assertGreater(float(mean[1]), float(mean[0]))
        self.assertGreater(float(mean[0]), float(mean[2]))
        self.assertTrue(np.all(candidate[candidate[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
