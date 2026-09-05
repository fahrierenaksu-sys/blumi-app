#!/usr/bin/env python3
"""Evidence-contract tests for the remaining-ten independent review records."""

import unittest

from package_male_sitting_remaining_wave_v1 import PROFILES, sha256
from record_male_sitting_remaining_wave_review_v1 import build_review


class RemainingWaveReviewRecordTests(unittest.TestCase):
    def test_exact_ten_hash_bound_non_promoted_pass_records(self) -> None:
        self.assertEqual(len(PROFILES), 10)
        for profile in PROFILES:
            with self.subTest(profile=profile.slug):
                review = build_review(profile)
                self.assertEqual(review["verdict"], "PASS")
                self.assertTrue(review["candidateOnly"])
                self.assertFalse(review["runtimePromoted"])
                self.assertEqual(review["candidate"]["sha256"], sha256(profile.output))
                self.assertEqual(review["board"]["sha256"], sha256(profile.board))
                self.assertEqual(review["metrics"]["transparentRgbResidue"], 0)
                if profile.is_short:
                    self.assertTrue(review["metrics"]["twoLegOpeningClear"])
                    self.assertEqual(review["metrics"]["pixelsBelowClearRow"], 0)
                else:
                    self.assertEqual(review["metrics"]["pelvisSkinHoles294To328"], 0)
                    self.assertEqual(review["metrics"]["pixelsBelowShoeContact"], 0)


if __name__ == "__main__":
    unittest.main()
