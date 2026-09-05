#!/usr/bin/env python3
"""Regression gates for the replacement seated short panels.

The rejected V7 candidates filled segmentation holes with source pixels. On
the seated masters those pixels can be exposed skin, which made the shorts
read as disconnected bands. V8 must produce a continuous, garment-coloured
front panel on the canonical composite.
"""

from pathlib import Path
import unittest

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v8"
)


class ReplacementShortPanelTests(unittest.TestCase):
    def _asset(self, slug: str, kind: str = "canonical") -> np.ndarray:
        if kind == "candidate":
            path = EVIDENCE / "candidates" / f"{slug.replace('-', '_')}-sitting-candidate-v2.png"
        else:
            path = EVIDENCE / f"{slug}-canonical-sitting-v2.png"
        self.assertTrue(path.exists(), f"missing V8 artifact: {path}")
        return np.asarray(Image.open(path).convert("RGBA"))

    def test_technical_and_resort_keep_full_seated_front_panels(self) -> None:
        expected = {
            "technical-sport-shorts": (20, 100, 185),
            "contemporary-resort-street-bottom": (20, 100, 185),
        }
        end_rows = {
            "technical-sport-shorts": 326,
            "contemporary-resort-street-bottom": 320,
        }
        for slug in expected:
            with self.subTest(slug=slug):
                pixels = self._asset(slug, "candidate")
                alpha = pixels[..., 3] > 24
                for row in range(304, end_rows[slug] + 1):
                    self.assertGreaterEqual(int(alpha[row, 92:126].sum()), 24)
                    self.assertGreaterEqual(int(alpha[row, 130:164].sum()), 24)
                self.assertGreater(int(alpha[304:end_rows[slug] + 1, 92:126].sum()), 390)
                self.assertGreater(int(alpha[304:end_rows[slug] + 1, 130:164].sum()), 390)

    def test_no_skin_coloured_fill_inside_the_two_short_panels(self) -> None:
        for slug in ("technical-sport-shorts", "contemporary-resort-street-bottom"):
            with self.subTest(slug=slug):
                pixels = self._asset(slug, "candidate")
                end_row = 327 if slug == "technical-sport-shorts" else 321
                sample = pixels[304:end_row, 92:164, :3].astype(np.int16)
                skin_like = (
                    (sample[..., 0] > 205)
                    & (sample[..., 0] > sample[..., 1] + 22)
                    & (sample[..., 1] > sample[..., 2] + 8)
                )
                self.assertLess(int(skin_like.sum()), 24)


if __name__ == "__main__":
    unittest.main()
