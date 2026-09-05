#!/usr/bin/env python3

from __future__ import annotations

import dataclasses
import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name("male_bottom_system_v2.py")


def load_module():
    spec = importlib.util.spec_from_file_location("male_bottom_system_v2", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load male bottom system v2")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleBottomSystemV2Tests(unittest.TestCase):
    def test_registry_covers_every_live_male_bottom_without_fallback(self) -> None:
        module = load_module()
        expected = {
            "charcoal_tapered_chinos",
            "colorblock_nylon_track_pants",
            "contemporary_resort_street_bottom",
            "creative_utility_bottom",
            "mid_blue_straight_jeans",
            "midnight_relaxed_tailoring_trousers",
            "modern_track_luxury_bottom",
            "monochrome_street_tailoring_bottom",
            "navy_straight_pants",
            "refined_utility_cargo_shorts",
            "relaxed_tailored_shorts",
            "sage_cuffed_shorts",
            "soft_parachute_cargo_pants",
            "straight_utility_tailored_trousers",
            "technical_sport_shorts",
            "warm_sand_deconstructed_trousers",
            "warm_sand_relaxed_pants",
            "washed_baggy_denim",
            "wide_pleated_technical_trousers",
        }

        self.assertEqual(expected, set(module.MALE_BOTTOM_PROFILES))
        self.assertFalse(hasattr(module, "DEFAULT_PROFILE"))
        self.assertFalse(hasattr(module, "GENERIC_TROUSERS_PROFILE"))

    def test_profiles_are_immutable_and_keep_item_level_construction(self) -> None:
        module = load_module()

        self.assertTrue(
            module.MaleBottomProfile.__dataclass_params__.frozen
        )
        for item_id, profile in module.MALE_BOTTOM_PROFILES.items():
            with self.subTest(item_id=item_id):
                self.assertEqual(item_id, profile.item_id)
                self.assertTrue(profile.requires_direct_master)
                self.assertTrue(profile.requires_user_static_approval)
                with self.assertRaises(dataclasses.FrozenInstanceError):
                    profile.design_language = "mutated"
        self.assertFalse(hasattr(module, "_PROFILES"))
        with self.assertRaises(TypeError):
            module.MALE_BOTTOM_PROFILES["injected"] = next(
                iter(module.MALE_BOTTOM_PROFILES.values())
            )

    def test_family_counts_match_the_reviewed_inventory(self) -> None:
        module = load_module()
        counts = {
            family: sum(
                profile.family == family
                for profile in module.MALE_BOTTOM_PROFILES.values()
            )
            for family in module.MaleBottomFamily
        }

        self.assertEqual(
            {
                module.MaleBottomFamily.SLIM_TAPERED: 1,
                module.MaleBottomFamily.STRAIGHT: 4,
                module.MaleBottomFamily.RELAXED_WIDE: 6,
                module.MaleBottomFamily.CARGO_PARACHUTE_TRACK: 4,
                module.MaleBottomFamily.SHORTS: 4,
            },
            counts,
        )

    def test_each_family_has_a_distinct_real_life_fit_contract(self) -> None:
        module = load_module()
        contracts = module.FAMILY_CONTRACTS

        self.assertEqual(set(module.MaleBottomFamily), set(contracts))
        self.assertEqual(
            len(contracts),
            len(
                {
                    (
                        contract.waist_release,
                        contract.leg_shape,
                        contract.hem_shape,
                        contract.shoe_occlusion_role,
                    )
                    for contract in contracts.values()
                }
            ),
        )
        self.assertEqual(
            "bottomShoeAwareDrape",
            contracts[module.MaleBottomFamily.RELAXED_WIDE].shoe_occlusion_role,
        )
        self.assertEqual(
            "shortAboveKneeNoShoeOverlap",
            contracts[module.MaleBottomFamily.SHORTS].shoe_occlusion_role,
        )
        self.assertNotEqual(
            contracts[module.MaleBottomFamily.SLIM_TAPERED].hem_exclusive_range,
            contracts[module.MaleBottomFamily.STRAIGHT].hem_exclusive_range,
        )
        self.assertNotEqual(
            contracts[module.MaleBottomFamily.STRAIGHT].hem_exclusive_range,
            contracts[module.MaleBottomFamily.RELAXED_WIDE].hem_exclusive_range,
        )

    def test_straight_items_never_inherit_the_slim_tapered_geometry_family(
        self,
    ) -> None:
        module = load_module()
        expected_straight = {
            "mid_blue_straight_jeans",
            "navy_straight_pants",
            "straight_utility_tailored_trousers",
            "warm_sand_deconstructed_trousers",
        }
        actual_straight = {
            profile.item_id
            for profile in module.MALE_BOTTOM_PROFILES.values()
            if profile.family is module.MaleBottomFamily.STRAIGHT
        }

        self.assertEqual(expected_straight, actual_straight)
        self.assertIs(
            module.MaleBottomFamily.SLIM_TAPERED,
            module.MALE_BOTTOM_PROFILES["charcoal_tapered_chinos"].family,
        )

    def test_cargo_parachute_track_items_keep_item_specific_fit_variants(self) -> None:
        module = load_module()
        utility = {
            profile.fit_variant
            for profile in module.MALE_BOTTOM_PROFILES.values()
            if profile.family
            is module.MaleBottomFamily.CARGO_PARACHUTE_TRACK
        }

        self.assertEqual(
            {
                "cargo",
                "parachute",
                "track_clean",
                "track_colorblock",
            },
            utility,
        )

    def test_long_bottoms_keep_crotch_and_inner_leg_contracts(self) -> None:
        module = load_module()
        for family, contract in module.FAMILY_CONTRACTS.items():
            with self.subTest(family=family.value):
                self.assertEqual(286, contract.waist_top_y)
                self.assertLessEqual(
                    contract.crotch_bridge_closed_through_y,
                    contract.inner_leg_gap_starts_y,
                )
                if family is module.MaleBottomFamily.SHORTS:
                    self.assertLessEqual(contract.hem_exclusive_range[1], 320)
                else:
                    self.assertGreaterEqual(
                        contract.inner_leg_gap_starts_y,
                        303,
                    )
                    self.assertGreaterEqual(
                        contract.hem_exclusive_range[0],
                        326,
                    )

    def test_all_source_assets_are_canonical_rgba_canvas_files(self) -> None:
        module = load_module()
        for item_id, profile in module.MALE_BOTTOM_PROFILES.items():
            with self.subTest(item_id=item_id):
                self.assertTrue(profile.runtime_asset_path.exists())
                with Image.open(profile.runtime_asset_path) as image:
                    self.assertEqual((256, 384), image.size)
                    self.assertEqual("RGBA", image.mode)

    def test_every_item_resolves_distinct_staged_geometry_master_and_evidence_paths(
        self,
    ) -> None:
        module = load_module()
        path_sets = {
            "geometry": set(),
            "master": set(),
            "preview": set(),
            "evidence": set(),
            "manifest": set(),
        }
        for item_id, profile in module.MALE_BOTTOM_PROFILES.items():
            with self.subTest(item_id=item_id):
                self.assertTrue(
                    profile.geometry_path.is_relative_to(module.MALE_QA_ROOT)
                )
                self.assertTrue(
                    profile.source_master_path.is_relative_to(module.MALE_QA_ROOT)
                )
                self.assertTrue(
                    profile.candidate_preview_path.is_relative_to(
                        module.MALE_QA_ROOT
                    )
                )
                self.assertTrue(
                    profile.evidence_dir.is_relative_to(module.MALE_QA_ROOT)
                )
                self.assertTrue(
                    profile.evidence_manifest_path.is_relative_to(
                        module.MALE_QA_ROOT
                    )
                )
                self.assertFalse(
                    profile.source_master_path.is_relative_to(module.ROOM)
                )
                self.assertFalse(
                    profile.candidate_preview_path.is_relative_to(module.ROOM)
                )
                self.assertEqual(module.TEST_TOP, profile.test_top_path)
                self.assertEqual(module.TEST_SHOES, profile.test_shoes_path)
                path_sets["geometry"].add(profile.geometry_path)
                path_sets["master"].add(profile.source_master_path)
                path_sets["preview"].add(profile.candidate_preview_path)
                path_sets["evidence"].add(profile.evidence_dir)
                path_sets["manifest"].add(profile.evidence_manifest_path)

        for label, paths in path_sets.items():
            with self.subTest(path_kind=label):
                self.assertEqual(19, len(paths))

    def test_only_the_exact_reviewed_pilots_are_user_approved_static(self) -> None:
        module = load_module()
        approved = {
            item_id
            for item_id, profile in module.MALE_BOTTOM_PROFILES.items()
            if profile.static_status is module.StaticApprovalStatus.USER_APPROVED
        }

        self.assertEqual(
            {
                "charcoal_tapered_chinos",
                "mid_blue_straight_jeans",
                "warm_sand_relaxed_pants",
            },
            approved,
        )
        relaxed = module.MALE_BOTTOM_PROFILES["warm_sand_relaxed_pants"]
        self.assertEqual(
            module.APPROVED_RELAXED_EVIDENCE,
            relaxed.evidence_dir,
        )
        self.assertTrue(relaxed.geometry_path.exists())
        self.assertTrue(relaxed.source_master_path.exists())
        self.assertTrue(relaxed.candidate_preview_path.exists())
        self.assertTrue(
            (
                relaxed.evidence_dir
                / "step-4-relaxed-baggy-approval-board.png"
            ).exists()
        )

    def test_charcoal_profile_points_to_the_current_unpromoted_review_candidate(
        self,
    ) -> None:
        module = load_module()
        charcoal = module.MALE_BOTTOM_PROFILES["charcoal_tapered_chinos"]

        self.assertEqual(module.CHARCOAL_EVIDENCE, charcoal.evidence_dir)
        self.assertTrue(charcoal.geometry_path.exists())
        self.assertTrue(charcoal.source_master_path.exists())
        self.assertTrue(charcoal.candidate_preview_path.exists())
        self.assertIs(
            module.StaticApprovalStatus.USER_APPROVED,
            charcoal.static_status,
        )
        self.assertFalse(module.promotion_allowed(charcoal, receipt=None))

    def test_mid_blue_profile_points_to_the_straight_review_candidate(
        self,
    ) -> None:
        module = load_module()
        mid_blue = module.MALE_BOTTOM_PROFILES["mid_blue_straight_jeans"]

        self.assertEqual(module.MID_BLUE_STRAIGHT_EVIDENCE, mid_blue.evidence_dir)
        self.assertTrue(mid_blue.geometry_path.exists())
        self.assertTrue(mid_blue.source_master_path.exists())
        self.assertTrue(mid_blue.candidate_preview_path.exists())
        self.assertIs(
            module.StaticApprovalStatus.USER_APPROVED,
            mid_blue.static_status,
        )
        self.assertFalse(module.promotion_allowed(mid_blue, receipt=None))

    def test_navy_profile_points_to_its_own_straight_review_candidate(
        self,
    ) -> None:
        module = load_module()
        navy = module.MALE_BOTTOM_PROFILES["navy_straight_pants"]

        self.assertEqual(module.NAVY_STRAIGHT_EVIDENCE, navy.evidence_dir)
        self.assertEqual(
            "step-0-navy-straight-contact-reference-v2.png",
            navy.art_reference_path.name,
        )
        self.assertTrue(navy.geometry_path.exists())
        self.assertTrue(navy.source_master_path.exists())
        self.assertTrue(navy.candidate_preview_path.exists())
        self.assertIs(
            module.StaticApprovalStatus.INDEPENDENT_REVIEWED_PENDING_USER_APPROVAL,
            navy.static_status,
        )
        self.assertFalse(module.promotion_allowed(navy, receipt=None))

    def test_approved_static_still_cannot_write_runtime_before_group_promotion(self) -> None:
        module = load_module()
        relaxed = module.MALE_BOTTOM_PROFILES["warm_sand_relaxed_pants"]

        self.assertIs(
            module.StaticApprovalStatus.USER_APPROVED,
            relaxed.static_status,
        )
        self.assertEqual(
            module.PromotionStatus.STATIC_ONLY_NOT_PROMOTED,
            relaxed.promotion_status,
        )
        self.assertFalse(module.promotion_allowed(relaxed, receipt=None))

    def test_promotion_guard_fails_closed_for_unbound_or_incomplete_receipts(
        self,
    ) -> None:
        module = load_module()
        relaxed = module.MALE_BOTTOM_PROFILES["warm_sand_relaxed_pants"]
        incomplete = module.PromotionReceipt(
            item_id=relaxed.item_id,
            candidate_sha256="",
            evidence_manifest_sha256="",
            independent_reviewer_verdict="PASS",
            user_approval_status=module.StaticApprovalStatus.USER_APPROVED,
            promotion_decision="PROMOTE",
        )

        self.assertFalse(module.promotion_allowed(relaxed, incomplete))
        wrong_item = dataclasses.replace(
            incomplete,
            item_id="charcoal_tapered_chinos",
            candidate_sha256="a" * 64,
            evidence_manifest_sha256="b" * 64,
        )
        self.assertFalse(module.promotion_allowed(relaxed, wrong_item))

        reviewable = dataclasses.replace(
            relaxed,
            promotion_status=module.PromotionStatus.APPROVED_FOR_PROMOTION,
        )
        fake_hashes = dataclasses.replace(
            incomplete,
            candidate_sha256="a" * 64,
            evidence_manifest_sha256="b" * 64,
        )
        self.assertFalse(module.promotion_allowed(reviewable, fake_hashes))

        exact = dataclasses.replace(
            fake_hashes,
            candidate_sha256=hashlib.sha256(
                relaxed.candidate_preview_path.read_bytes()
            ).hexdigest(),
            evidence_manifest_sha256=hashlib.sha256(
                relaxed.evidence_manifest_path.read_bytes()
            ).hexdigest(),
        )
        self.assertTrue(module.promotion_allowed(reviewable, exact))

    def test_current_runtime_bytes_match_the_frozen_no_promotion_baseline(
        self,
    ) -> None:
        module = load_module()
        manifest = json.loads(module.RUNTIME_BASELINE_MANIFEST.read_text())

        self.assertEqual(set(module.MALE_BOTTOM_PROFILES), set(manifest["assets"]))
        for item_id, expected_sha in manifest["assets"].items():
            with self.subTest(item_id=item_id):
                runtime_path = module.MALE_BOTTOM_PROFILES[
                    item_id
                ].runtime_asset_path
                actual_sha = hashlib.sha256(runtime_path.read_bytes()).hexdigest()
                self.assertEqual(expected_sha, actual_sha)


if __name__ == "__main__":
    unittest.main()
