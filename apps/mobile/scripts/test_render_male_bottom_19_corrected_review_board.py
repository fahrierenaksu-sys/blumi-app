#!/usr/bin/env python3
"""Evidence gates for the corrected, candidate-only 19/19 board."""

import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v7"
MANIFEST = EVIDENCE / "male-bottom-19-corrected-4w1s-review-manifest.json"


class CorrectedMaleBottomBoardTests(unittest.TestCase):
    def test_manifest_is_19_by_5_hash_bound_and_not_promoted(self) -> None:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "candidate_pending_independent_review_and_user_approval")
        self.assertFalse(manifest["runtimePromoted"])
        self.assertEqual(manifest["itemCount"], 19)
        self.assertEqual(len(manifest["items"]), 19)
        self.assertEqual(len({item["slug"] for item in manifest["items"]}), 19)
        for item in manifest["items"]:
            self.assertEqual(set(item["frames"]), {"walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"})
            for frame in item["frames"].values():
                path = ROOT / frame["path"]
                self.assertTrue(path.is_file(), path)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), frame["sha256"])
        board = ROOT / manifest["board"]["path"]
        self.assertEqual(board.stat().st_size > 0, True)
        self.assertEqual(hashlib.sha256(board.read_bytes()).hexdigest(), manifest["board"]["sha256"])


if __name__ == "__main__":
    unittest.main()
