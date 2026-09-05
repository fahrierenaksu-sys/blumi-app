from __future__ import annotations

import sys
import json
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from promote_male_bottom_pose_native_batch import (  # noqa: E402
    ASSET_MANIFEST,
    ITEMS,
    REPO_ROOT,
    _transaction_paths,
    build_plan,
    validate_plan,
)


class PromoteMaleBottomPoseNativeBatchTests(unittest.TestCase):
    def test_plan_maps_two_exact_items_and_all_runtime_states(self) -> None:
        plan = build_plan(REPO_ROOT)
        self.assertEqual(2, len(ITEMS))
        self.assertEqual(12, len(plan))
        destinations = {entry.destination.name for entry in plan}
        self.assertIn(
            "avatar_room_bottom_male_soft_parachute_cargo_pants_v1.png",
            destinations,
        )
        self.assertIn(
            "room_avatar_bottom_male_colorblock_nylon_track_pants_v1_sitting_front_f01.png",
            destinations,
        )

    def test_all_sources_are_hash_bound_to_exact_user_approval(self) -> None:
        plan = build_plan(REPO_ROOT)
        result = validate_plan(plan)
        self.assertEqual([], result.errors)
        self.assertEqual(12, result.validated_entries)
        self.assertEqual(2, result.validated_items)

    def test_static_runtime_uses_board_approved_f01_not_stale_static(self) -> None:
        plan = build_plan(REPO_ROOT)
        static_entries = [entry for entry in plan if entry.state == "static"]
        self.assertEqual(2, len(static_entries))
        for entry in static_entries:
            self.assertIn("walking_front_f01", entry.source.name)

    def test_transaction_covers_runtime_and_all_promotion_records(self) -> None:
        plan = build_plan(REPO_ROOT)
        paths = set(_transaction_paths(plan))
        self.assertEqual(17, len(paths))
        self.assertIn(ASSET_MANIFEST, paths)
        for item in ITEMS:
            self.assertIn(item.approval, paths)
            self.assertIn(item.candidate_manifest, paths)
        for entry in plan:
            self.assertIn(entry.destination, paths)

    def test_approval_records_are_discoverable_candidate_only_evidence(self) -> None:
        for item in ITEMS:
            approval = json.loads(item.approval.read_text(encoding="utf-8"))
            self.assertIs(True, approval.get("candidateOnly"))

    def test_promotion_preserves_static_board_candidate_roots(self) -> None:
        manifest_path = (
            REPO_ROOT
            / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
            "asset-manifest.json"
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        by_slug = {entry["slug"]: entry for entry in manifest["items"]}
        for item in ITEMS:
            self.assertEqual(
                "docs/avatar-motion-pipeline/male-wardrobe-redesign/"
                f"2026-07-27/candidates/bottom/{item.slug}",
                by_slug[item.slug]["candidateRoot"],
            )


if __name__ == "__main__":
    unittest.main()
