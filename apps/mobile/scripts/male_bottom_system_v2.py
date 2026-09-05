#!/usr/bin/env python3
"""Immutable production registry for the male bottom redesign.

This module is intentionally data-only. It does not resize, patch, overwrite,
or promote runtime assets. Producers consume one explicit item profile at a
time and must write static candidates to QA evidence directories until the
user approves that exact garment.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from types import MappingProxyType
from typing import Mapping


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
MALE_QA_ROOT = REPO / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa"
QA_ROOT = (
    MALE_QA_ROOT / "2026-07-27"
)
APPROVED_RELAXED_EVIDENCE = QA_ROOT / "warm-sand-relaxed-v2"
CHARCOAL_EVIDENCE = MALE_QA_ROOT / "2026-07-26/charcoal-redraw-v2"
MID_BLUE_STRAIGHT_EVIDENCE = QA_ROOT / "mid-blue-straight-v2"
NAVY_STRAIGHT_EVIDENCE = QA_ROOT / "navy-straight-v2"
SYSTEM_EVIDENCE_ROOT = QA_ROOT / "male-bottom-system-v2"
RUNTIME_BASELINE_MANIFEST = (
    SYSTEM_EVIDENCE_ROOT / "runtime-baseline-sha256.json"
)
TEST_TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
TEST_SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"


class MaleBottomFamily(str, Enum):
    SLIM_TAPERED = "male_slim_tapered"
    STRAIGHT = "male_straight"
    RELAXED_WIDE = "male_relaxed_wide"
    CARGO_PARACHUTE_TRACK = "male_cargo_parachute_track"
    SHORTS = "male_shorts"


class StaticApprovalStatus(str, Enum):
    NEEDS_REDESIGN = "needs_redesign"
    PENDING_INDEPENDENT_REVIEW = "pending_independent_review"
    INDEPENDENT_REVIEWED_PENDING_USER_APPROVAL = (
        "independent_reviewed_pending_user_approval"
    )
    USER_APPROVED = "user_approved"


class PromotionStatus(str, Enum):
    STATIC_ONLY_NOT_PROMOTED = "static_only_not_promoted"
    APPROVED_FOR_PROMOTION = "approved_for_promotion"


@dataclass(frozen=True)
class MaleBottomFamilyContract:
    """Real-life construction and contact rules shared by one fit family."""

    waist_top_y: int
    waist_release: str
    crotch_bridge_closed_through_y: int
    inner_leg_gap_starts_y: int
    leg_shape: str
    hem_exclusive_range: tuple[int, int]
    hem_shape: str
    shoe_occlusion_role: str
    master_scale: int = 4


@dataclass(frozen=True)
class MaleBottomProfile:
    """One item-level production decision; there is no generic fallback."""

    item_id: str
    family: MaleBottomFamily
    fit_variant: str
    design_language: str
    geometry_path: Path
    art_reference_path: Path
    source_master_path: Path
    candidate_preview_path: Path
    runtime_asset_path: Path
    evidence_dir: Path
    evidence_manifest_path: Path
    test_top_path: Path
    test_shoes_path: Path
    static_status: StaticApprovalStatus
    promotion_status: PromotionStatus
    requires_direct_master: bool = True
    requires_user_static_approval: bool = True


@dataclass(frozen=True)
class PromotionReceipt:
    """Hash-bound approval receipt required by the later promotion phase."""

    item_id: str
    candidate_sha256: str
    evidence_manifest_sha256: str
    independent_reviewer_verdict: str
    user_approval_status: StaticApprovalStatus
    promotion_decision: str


FAMILY_CONTRACTS: Mapping[MaleBottomFamily, MaleBottomFamilyContract] = (
    MappingProxyType(
        {
            MaleBottomFamily.SLIM_TAPERED: MaleBottomFamilyContract(
                waist_top_y=286,
                waist_release="tee_tucked_close_hip",
                crotch_bridge_closed_through_y=302,
                inner_leg_gap_starts_y=303,
                leg_shape="separate_clean_legs_with_narrow_monotonic_v",
                hem_exclusive_range=(329, 329),
                hem_shape="narrow_curved_hem_with_shallow_shoe_break",
                shoe_occlusion_role="bottomShoeAwareNarrowBreak",
            ),
            MaleBottomFamily.STRAIGHT: MaleBottomFamilyContract(
                waist_top_y=286,
                waist_release="tee_tucked_straight_hip_release",
                crotch_bridge_closed_through_y=302,
                inner_leg_gap_starts_y=303,
                leg_shape="separate_straight_legs_without_slim_taper",
                hem_exclusive_range=(336, 340),
                hem_shape="full_length_straight_item_specific_shoe_break",
                shoe_occlusion_role="bottomStraightShoeAwareBreak",
            ),
            MaleBottomFamily.RELAXED_WIDE: MaleBottomFamilyContract(
                waist_top_y=286,
                waist_release="tee_tucked_progressive_hip_release",
                crotch_bridge_closed_through_y=302,
                inner_leg_gap_starts_y=303,
                leg_shape="vertical_relaxed_baggy_separate_legs",
                hem_exclusive_range=(339, 339),
                hem_shape="broad_shallow_rounded_cuff",
                shoe_occlusion_role="bottomShoeAwareDrape",
            ),
            MaleBottomFamily.CARGO_PARACHUTE_TRACK: MaleBottomFamilyContract(
                waist_top_y=286,
                waist_release="item_specific_utility_or_elastic_waist_release",
                crotch_bridge_closed_through_y=302,
                inner_leg_gap_starts_y=303,
                leg_shape="relaxed_separate_legs_with_item_specific_utility_volume",
                hem_exclusive_range=(336, 341),
                hem_shape="item_specific_track_cargo_or_parachute_hem",
                shoe_occlusion_role="bottomUtilityDrapeOverShoeUpper",
            ),
            MaleBottomFamily.SHORTS: MaleBottomFamilyContract(
                waist_top_y=286,
                waist_release="short_waist_follows_tee_contact",
                crotch_bridge_closed_through_y=302,
                inner_leg_gap_starts_y=303,
                leg_shape="two_readable_short_legs_with_thigh_clearance",
                hem_exclusive_range=(314, 320),
                hem_shape="item_specific_short_hem_above_knee",
                shoe_occlusion_role="shortAboveKneeNoShoeOverlap",
            ),
        }
    )
)


def _asset(item_id: str) -> Path:
    return ROOM / f"avatar_room_bottom_male_{item_id}_v1.png"


def _profile(
    item_id: str,
    family: MaleBottomFamily,
    design_language: str,
    *,
    fit_variant: str = "base",
    static_status: StaticApprovalStatus = StaticApprovalStatus.NEEDS_REDESIGN,
    evidence: Path | None = None,
) -> MaleBottomProfile:
    evidence_dir = (
        evidence
        if evidence is not None
        else SYSTEM_EVIDENCE_ROOT / family.value / item_id
    )
    if item_id == "warm_sand_relaxed_pants":
        geometry_path = evidence_dir / "geometry.json"
        art_reference_path = (
            evidence_dir / "step-0-relaxed-baggy-art-reference.png"
        )
        source_master_path = (
            evidence_dir / "step-2-warm-sand-relaxed-baggy-master-4x.png"
        )
        candidate_preview_path = (
            evidence_dir / "step-2-warm-sand-relaxed-baggy-preview-layer.png"
        )
    elif item_id == "charcoal_tapered_chinos":
        geometry_path = evidence_dir / "geometry.json"
        art_reference_path = evidence_dir / "step-5-quality-art-reference.png"
        source_master_path = (
            evidence_dir / "step-2-charcoal-tapered-chinos-master-4x.png"
        )
        candidate_preview_path = (
            evidence_dir / "step-2-charcoal-tapered-chinos-preview-layer.png"
        )
    elif item_id == "mid_blue_straight_jeans":
        geometry_path = evidence_dir / "geometry.json"
        art_reference_path = (
            evidence_dir / "step-0-mid-blue-straight-art-reference.png"
        )
        source_master_path = (
            evidence_dir / "step-2-mid-blue-straight-master-4x.png"
        )
        candidate_preview_path = (
            evidence_dir / "step-2-mid-blue-straight-preview-layer.png"
        )
    elif item_id == "navy_straight_pants":
        geometry_path = evidence_dir / "geometry.json"
        art_reference_path = (
            evidence_dir / "step-0-navy-straight-contact-reference-v2.png"
        )
        source_master_path = (
            evidence_dir / "step-2-navy-straight-master-4x.png"
        )
        candidate_preview_path = (
            evidence_dir / "step-2-navy-straight-preview-layer.png"
        )
    else:
        geometry_path = evidence_dir / "geometry.json"
        art_reference_path = evidence_dir / "art-reference.png"
        source_master_path = evidence_dir / f"{item_id}-master-4x.png"
        candidate_preview_path = evidence_dir / f"{item_id}-preview-layer.png"

    return MaleBottomProfile(
        item_id=item_id,
        family=family,
        fit_variant=fit_variant,
        design_language=design_language,
        geometry_path=geometry_path,
        art_reference_path=art_reference_path,
        source_master_path=source_master_path,
        candidate_preview_path=candidate_preview_path,
        runtime_asset_path=_asset(item_id),
        evidence_dir=evidence_dir,
        evidence_manifest_path=evidence_dir / "REVIEW.md",
        test_top_path=TEST_TOP,
        test_shoes_path=TEST_SHOES,
        static_status=static_status,
        promotion_status=PromotionStatus.STATIC_ONLY_NOT_PROMOTED,
    )


def _build_profiles() -> Mapping[str, MaleBottomProfile]:
    """Build the registry without exposing a mutable backing dictionary."""

    profiles = {
    # Slim/tapered and straight are separate geometry families. Each item also
    # keeps its own material/construction language.
    "charcoal_tapered_chinos": _profile(
        "charcoal_tapered_chinos",
        MaleBottomFamily.SLIM_TAPERED,
        "tapered_charcoal_chino",
        static_status=StaticApprovalStatus.USER_APPROVED,
        evidence=CHARCOAL_EVIDENCE,
    ),
    "mid_blue_straight_jeans": _profile(
        "mid_blue_straight_jeans",
        MaleBottomFamily.STRAIGHT,
        "straight_mid_blue_denim",
        static_status=StaticApprovalStatus.USER_APPROVED,
        evidence=MID_BLUE_STRAIGHT_EVIDENCE,
    ),
    "navy_straight_pants": _profile(
        "navy_straight_pants",
        MaleBottomFamily.STRAIGHT,
        "clean_navy_straight_trouser",
        static_status=(
            StaticApprovalStatus.INDEPENDENT_REVIEWED_PENDING_USER_APPROVAL
        ),
        evidence=NAVY_STRAIGHT_EVIDENCE,
    ),
    "straight_utility_tailored_trousers": _profile(
        "straight_utility_tailored_trousers",
        MaleBottomFamily.STRAIGHT,
        "straight_utility_tailoring",
    ),
    "warm_sand_deconstructed_trousers": _profile(
        "warm_sand_deconstructed_trousers",
        MaleBottomFamily.STRAIGHT,
        "deconstructed_warm_sand_tailoring",
    ),
    # Relaxed and wide items inherit only the approved body/waist/shoe contact
    # method. Their fabric and construction art remains item-specific.
    "warm_sand_relaxed_pants": _profile(
        "warm_sand_relaxed_pants",
        MaleBottomFamily.RELAXED_WIDE,
        "approved_warm_sand_relaxed_baggy",
        static_status=StaticApprovalStatus.USER_APPROVED,
        evidence=APPROVED_RELAXED_EVIDENCE,
    ),
    "wide_pleated_technical_trousers": _profile(
        "wide_pleated_technical_trousers",
        MaleBottomFamily.RELAXED_WIDE,
        "wide_pleated_technical",
    ),
    "midnight_relaxed_tailoring_trousers": _profile(
        "midnight_relaxed_tailoring_trousers",
        MaleBottomFamily.RELAXED_WIDE,
        "midnight_relaxed_tailoring",
    ),
    "monochrome_street_tailoring_bottom": _profile(
        "monochrome_street_tailoring_bottom",
        MaleBottomFamily.RELAXED_WIDE,
        "monochrome_street_tailoring",
    ),
    "contemporary_resort_street_bottom": _profile(
        "contemporary_resort_street_bottom",
        MaleBottomFamily.RELAXED_WIDE,
        "contemporary_resort_relaxed",
    ),
    "washed_baggy_denim": _profile(
        "washed_baggy_denim",
        MaleBottomFamily.RELAXED_WIDE,
        "washed_baggy_denim",
    ),
    # Sport/track volume has a softer elastic waist and different hem behavior.
    "modern_track_luxury_bottom": _profile(
        "modern_track_luxury_bottom",
        MaleBottomFamily.CARGO_PARACHUTE_TRACK,
        "luxury_track_trouser",
        fit_variant="track_clean",
    ),
    "colorblock_nylon_track_pants": _profile(
        "colorblock_nylon_track_pants",
        MaleBottomFamily.CARGO_PARACHUTE_TRACK,
        "colorblock_nylon_track",
        fit_variant="track_colorblock",
    ),
    # Cargo/parachute volume is authored around pockets and utility drape.
    "creative_utility_bottom": _profile(
        "creative_utility_bottom",
        MaleBottomFamily.CARGO_PARACHUTE_TRACK,
        "creative_utility_cargo",
        fit_variant="cargo",
    ),
    "soft_parachute_cargo_pants": _profile(
        "soft_parachute_cargo_pants",
        MaleBottomFamily.CARGO_PARACHUTE_TRACK,
        "soft_parachute_cargo",
        fit_variant="parachute",
    ),
    # Shorts never inherit a long-trouser shoe-overlap rule.
    "refined_utility_cargo_shorts": _profile(
        "refined_utility_cargo_shorts",
        MaleBottomFamily.SHORTS,
        "refined_utility_cargo_short",
    ),
    "relaxed_tailored_shorts": _profile(
        "relaxed_tailored_shorts",
        MaleBottomFamily.SHORTS,
        "relaxed_tailored_short",
    ),
    "sage_cuffed_shorts": _profile(
        "sage_cuffed_shorts",
        MaleBottomFamily.SHORTS,
        "sage_cuffed_short",
    ),
    "technical_sport_shorts": _profile(
        "technical_sport_shorts",
        MaleBottomFamily.SHORTS,
        "technical_sport_short",
    ),
    }
    return MappingProxyType(profiles)


MALE_BOTTOM_PROFILES: Mapping[str, MaleBottomProfile] = _build_profiles()


def _is_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def promotion_allowed(
    profile: MaleBottomProfile,
    receipt: PromotionReceipt | None,
) -> bool:
    """Fail closed until an exact candidate and manifest are both approved."""

    if receipt is None:
        return False
    if (
        not profile.candidate_preview_path.exists()
        or not profile.evidence_manifest_path.exists()
    ):
        return False
    candidate_sha256 = hashlib.sha256(
        profile.candidate_preview_path.read_bytes()
    ).hexdigest()
    evidence_manifest_sha256 = hashlib.sha256(
        profile.evidence_manifest_path.read_bytes()
    ).hexdigest()
    return (
        profile.static_status is StaticApprovalStatus.USER_APPROVED
        and profile.promotion_status is PromotionStatus.APPROVED_FOR_PROMOTION
        and receipt.item_id == profile.item_id
        and _is_sha256(receipt.candidate_sha256)
        and _is_sha256(receipt.evidence_manifest_sha256)
        and receipt.candidate_sha256 == candidate_sha256
        and receipt.evidence_manifest_sha256 == evidence_manifest_sha256
        and receipt.independent_reviewer_verdict == "PASS"
        and receipt.user_approval_status is StaticApprovalStatus.USER_APPROVED
        and receipt.promotion_decision == "PROMOTE"
    )
