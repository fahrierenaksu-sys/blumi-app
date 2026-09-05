from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from write_male_wardrobe_66_static_approval_record import (
    DEFAULT_BOARD,
    DEFAULT_SELECTION,
    create_static_approval_record,
)


class WriteMaleWardrobe66StaticApprovalRecordTests(unittest.TestCase):
    def test_record_binds_exact_66_candidates_and_keeps_promotion_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            output = temporary_root / "approval-record.json"
            review = temporary_root / "independent-review.json"
            review.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "verdict": "PASS",
                        "boardSha256": hashlib.sha256(
                            DEFAULT_BOARD.read_bytes()
                        ).hexdigest(),
                        "selectionSha256": hashlib.sha256(
                            DEFAULT_SELECTION.read_bytes()
                        ).hexdigest(),
                        "reviewedItemCount": 66,
                        "gates": {
                            "exact66IdentitySet": "PASS",
                            "canonicalBaseConsistency": "PASS",
                            "topFit": "PASS",
                            "bottomWaistCrotchHemShoeFit": "PASS",
                            "shoes": "PASS",
                            "hairHeadFit": "PASS",
                            "accessoryLayerOrder": "PASS",
                            "alphaHaloQuality": "PASS",
                        },
                    }
                ),
                encoding="utf-8",
            )
            record = create_static_approval_record(
                output,
                independent_review_path=review,
            )

        self.assertEqual(66, record["itemCount"])
        self.assertEqual(
            {"top": 27, "bottom": 19, "shoes": 8, "hair": 7, "accessory": 5},
            record["categoryCounts"],
        )
        self.assertEqual(
            hashlib.sha256(DEFAULT_BOARD.read_bytes()).hexdigest(),
            record["board"]["sha256"],
        )
        self.assertEqual("PASS", record["independentStaticReview"]["verdict"])
        self.assertRegex(record["workspaceSnapshotSha256"], r"^[a-f0-9]{64}$")
        self.assertFalse(record["userApproved"])
        self.assertFalse(record["motionGenerated"])
        self.assertFalse(record["runtimePromoted"])
        self.assertEqual(
            66,
            len({item["slug"] for item in record["items"]}),
        )
        by_slug = {item["slug"]: item for item in record["items"]}
        self.assertTrue(
            by_slug["wide_pleated_technical_trousers"]["layerPath"].endswith(
                "static-review-natural-fit-v18.png"
            )
        )
        self.assertTrue(
            by_slug["straight_utility_tailored_trousers"]["layerPath"].endswith(
                "static-review-system-v2.png"
            )
        )
        self.assertTrue(
            by_slug["colorblock_nylon_track_pants"]["layerPath"].endswith(
                "static-review-natural-fit-v5.png"
            )
        )

    def test_record_fails_closed_without_hash_bound_independent_review(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            missing_review = temporary_root / "missing-review.json"
            with self.assertRaisesRegex(
                FileNotFoundError,
                "independent static review evidence",
            ):
                create_static_approval_record(
                    temporary_root / "approval-record.json",
                    independent_review_path=missing_review,
                )


if __name__ == "__main__":
    unittest.main()
