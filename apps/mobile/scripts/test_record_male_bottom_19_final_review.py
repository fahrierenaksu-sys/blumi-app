#!/usr/bin/env python3
"""Evidence-contract test for the final 19/19 independent review."""

import unittest

from record_male_bottom_19_final_review import build_review


class FinalMaleBottomReviewTests(unittest.TestCase):
    def test_review_is_exact_hash_bound_19_by_5_pass_and_non_promoted(self) -> None:
        review = build_review()
        self.assertEqual(review["verdict"], "PASS")
        self.assertEqual(review["itemCount"], 19)
        self.assertEqual(review["stateCountPerItem"], 5)
        self.assertEqual(len(review["itemVerdicts"]), 19)
        self.assertEqual(len({entry["slug"] for entry in review["itemVerdicts"]}), 19)
        self.assertTrue(all(entry["verdict"] == "PASS" for entry in review["itemVerdicts"]))
        self.assertTrue(review["candidateOnly"])
        self.assertFalse(review["runtimePromoted"])
        self.assertEqual(review["board"]["dimensions"], "1150x6808")
        self.assertEqual(len(review["board"]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
