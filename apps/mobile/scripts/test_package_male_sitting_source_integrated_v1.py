#!/usr/bin/env python3
"""TDD gates for source-integrated seated bottom candidates."""

import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_source_integrated_v1.py")
SPEC = importlib.util.spec_from_file_location("male_sitting_source_integrated_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SourceIntegratedSittingTests(unittest.TestCase):
    def test_six_rejected_items_have_one_integrated_source(self) -> None:
        self.assertEqual(set(MODULE.TARGETS), set(MODULE.SOURCES))
        self.assertEqual(len(MODULE.TARGETS), 6)
        for slug, source in MODULE.SOURCES.items():
            with self.subTest(slug=slug):
                self.assertTrue(source.exists(), source)

    def test_shoe_contact_is_from_same_source_not_a_second_layer(self) -> None:
        slug = "washed_baggy_denim"
        candidate = np.asarray(MODULE.compose(slug))
        source = np.asarray(MODULE.normalized_source(MODULE.SOURCES[slug]))
        rows, cols = np.indices(candidate.shape[:2])
        contact = (
            (rows >= MODULE.LOWER_START)
            & (rows < 362)
            & (cols >= 88)
            & (cols <= 168)
            & (source[..., 3] > 8)
        )
        self.assertTrue(np.array_equal(candidate[contact], source[contact]))

    def test_candidate_alpha_has_no_hidden_rgb_residue(self) -> None:
        for slug in MODULE.TARGETS:
            with self.subTest(slug=slug):
                rgba = np.asarray(MODULE.compose(slug))
                self.assertEqual(rgba.shape, (384, 256, 4))
                self.assertFalse(np.any(rgba[rgba[..., 3] == 0, :3]))


if __name__ == "__main__":
    unittest.main()
