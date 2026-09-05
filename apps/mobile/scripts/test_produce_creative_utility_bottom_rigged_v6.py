from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_rigged_v6 import (  # noqa: E402
    SOURCE,
    SOURCE_SHA256,
    build_candidate,
)


class ProduceCreativeUtilityBottomRiggedV6Tests(unittest.TestCase):
    def test_source_is_locked_user_selected_shoe_contact_authority(self) -> None:
        self.assertEqual(SOURCE_SHA256, hashlib.sha256(SOURCE.read_bytes()).hexdigest())

    def test_candidate_preserves_shoe_contact_alpha_pixel_exactly(self) -> None:
        source = Image.open(SOURCE).convert("RGBA")
        candidate = build_candidate()
        self.assertEqual(source.getchannel("A").tobytes(), candidate.getchannel("A").tobytes())

    def test_candidate_is_olive_and_keeps_native_painterly_variance(self) -> None:
        source = np.asarray(Image.open(SOURCE).convert("RGBA"))
        candidate = np.asarray(build_candidate())
        visible = candidate[..., 3] > 32
        mean = candidate[visible, :3].mean(axis=0)
        self.assertGreater(float(mean[1]), float(mean[0]))
        self.assertGreater(float(mean[0]), float(mean[2]))
        self.assertGreater(float(candidate[visible, :3].std()), 14.0)
        self.assertFalse(np.array_equal(source[visible, :3], candidate[visible, :3]))

    def test_candidate_keeps_clean_transparency_and_two_legs(self) -> None:
        candidate = np.asarray(build_candidate())
        alpha = candidate[..., 3]
        self.assertTrue(np.all(candidate[alpha == 0, :3] == 0))
        self.assertGreater(int((alpha[314:332, 126:131] == 0).sum()), 25)


if __name__ == "__main__":
    unittest.main()
