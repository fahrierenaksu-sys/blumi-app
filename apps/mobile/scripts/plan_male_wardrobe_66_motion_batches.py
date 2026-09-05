#!/usr/bin/env python3
"""Create a non-producing, family-aware motion plan for the live male 66."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

from male_wardrobe_66_motion_readiness import (
    DEFAULT_OUTPUT as DEFAULT_READINESS_REPORT,
    REPO_ROOT,
    build_motion_readiness_report,
)
from male_wardrobe_66_static_gate import DEFAULT_RECORD


EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
DEFAULT_OUTPUT = EVIDENCE_ROOT / "male-wardrobe-66-motion-batch-plan.json"
REQUIRED_STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)

METHODS = {
    ("top", "tshirt_closed_crew"): (
        "closed-crew-body-anchor-retarget",
        ("neckline", "rear-collar-absence", "shoulder", "waist"),
    ),
    ("top", "shirt_open_camp_collar"): (
        "front-open-collar-sleeve-and-hem-retarget",
        (
            "neckline",
            "rear-collar-absence",
            "shoulder",
            "sleeve",
            "waist",
        ),
    ),
    ("top", "jacket_closed_high_neck"): (
        "closed-high-neck-rigid-torso-retarget",
        ("neck-contact", "rear-collar-absence", "shoulder", "torso", "waist"),
    ),
    ("top", "jacket_open_lapel"): (
        "open-lapel-shoulder-and-torso-retarget",
        ("neckline", "rear-collar-absence", "lapel", "shoulder", "waist"),
    ),
    ("top", "hoodie_or_sweat_closed_neck"): (
        "closed-neck-soft-volume-retarget",
        ("neck-contact", "rear-collar-absence", "shoulder", "waist"),
    ),
    ("top", "polo_placket_opening"): (
        "placket-collar-sleeve-retarget",
        ("neckline", "rear-collar-absence", "placket", "shoulder", "waist"),
    ),
    ("bottom", "male_slim_tapered"): (
        "two-leg-slim-frame-specific-redraw",
        ("waist", "crotch", "leg-gap", "hem-shoe"),
    ),
    ("bottom", "male_straight"): (
        "two-leg-straight-frame-specific-redraw",
        ("waist", "crotch", "leg-gap", "hem-shoe"),
    ),
    ("bottom", "male_relaxed_baggy"): (
        "waist-locked-relaxed-drape-frame-specific-redraw",
        ("waist", "crotch", "leg-gap", "drape", "hem-shoe"),
    ),
    ("bottom", "male_cargo_parachute_track"): (
        "waist-locked-volume-pocket-frame-specific-redraw",
        ("waist", "crotch", "leg-gap", "pocket-volume", "hem-shoe"),
    ),
    ("bottom", "male_shorts"): (
        "two-leg-short-frame-specific-redraw",
        ("waist", "crotch", "leg-gap", "short-hem", "shoe-clearance"),
    ),
    ("shoes", "court_trainer"): (
        "court-trainer-upper-and-sole-anchor-review",
        ("shoe-contact", "tongue", "laces", "toe", "sole"),
    ),
    ("shoes", "loafer_mule"): (
        "loafer-mule-vamp-heel-and-sole-anchor-review",
        ("shoe-contact", "vamp", "heel", "toe", "sole"),
    ),
    ("shoes", "canvas_skate"): (
        "canvas-skate-upper-and-sole-anchor-review",
        ("shoe-contact", "tongue", "laces", "toe", "sole"),
    ),
    ("shoes", "runner_trail"): (
        "runner-trail-upper-and-sole-anchor-review",
        ("shoe-contact", "tongue", "toe", "sole"),
    ),
    ("hair", "hair_front"): (
        "head-envelope-frame-specific-front-hair",
        ("scalp", "crown", "temple", "face-occlusion"),
    ),
    ("accessory", "eyewear"): (
        "face-anchor-fixed-layer-per-state",
        ("eye-clearance", "bridge-anchor", "temple-anchor"),
    ),
    ("accessory", "headwear"): (
        "head-hair-occlusion-per-state",
        ("crown-anchor", "hair-layer-order", "face-clearance"),
    ),
    ("accessory", "bag"): (
        "shoulder-torso-hand-occlusion-per-state",
        ("shoulder-anchor", "torso-contact", "hand-clearance"),
    ),
    ("accessory", "neck"): (
        "neckline-chest-layer-order-per-state",
        ("neck-anchor", "neckline-clearance", "chest-layer-order"),
    ),
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_bound_readiness() -> tuple[dict, str]:
    current = build_motion_readiness_report()
    if not DEFAULT_READINESS_REPORT.is_file():
        raise FileNotFoundError(DEFAULT_READINESS_REPORT)
    on_disk = json.loads(
        DEFAULT_READINESS_REPORT.read_text(encoding="utf-8")
    )
    if on_disk != current:
        raise ValueError(
            "motion readiness report file differs from current evidence"
        )
    return current, _sha256(DEFAULT_READINESS_REPORT)


def build_motion_batch_plan() -> dict:
    readiness, readiness_sha256 = _load_bound_readiness()
    static_record = json.loads(DEFAULT_RECORD.read_text(encoding="utf-8"))
    static_by_slug = {
        item["slug"]: item
        for item in static_record["items"]
    }
    readiness_slugs = {item["slug"] for item in readiness["items"]}
    if readiness_slugs != set(static_by_slug):
        raise ValueError("readiness and static record live item sets differ")

    regenerate_groups: dict[
        tuple[str, str],
        list[dict],
    ] = defaultdict(list)
    review_groups: dict[
        tuple[str, str],
        list[dict],
    ] = defaultdict(list)
    for item in readiness["items"]:
        static_item = static_by_slug[item["slug"]]
        planned = {
            "ordinal": item["ordinal"],
            "category": item["category"],
            "slug": item["slug"],
            "family": static_item["family"],
            "role": static_item["role"],
            "selectedStaticSha256": item["selectedStaticSha256"],
        }
        if item["currentHashBound4W1S"]:
            review_groups[
                (item["category"], static_item["family"])
            ].append(planned)
        else:
            grouping_key = (
                item["category"],
                static_item["family"],
            )
            regenerate_groups[grouping_key].append(planned)

    batches: list[dict] = []
    for (category, family), items in sorted(regenerate_groups.items()):
        method_key = (category, family)
        if method_key not in METHODS:
            raise ValueError(f"no motion method for {method_key}")
        method, closeups = METHODS[method_key]
        batches.append(
            {
                "batchId": f"{category}_{family}",
                "mode": "regenerate",
                "rigMethod": method,
                "requiredStates": list(REQUIRED_STATES),
                "requiredCloseups": list(closeups),
                "items": sorted(items, key=lambda item: item["ordinal"]),
            }
        )

    for (category, family), items in sorted(review_groups.items()):
        method_key = (category, family)
        if method_key not in METHODS:
            raise ValueError(f"no review method for {method_key}")
        method, closeups = METHODS[method_key]
        batches.append(
            {
                "batchId": f"review_{category}_{family}",
                "mode": "review-existing",
                "rigMethod": f"review-existing-{method}",
                "requiredStates": list(REQUIRED_STATES),
                "requiredCloseups": [
                    *closeups,
                    "state-difference",
                    "alpha-edge",
                ],
                "items": sorted(
                    items,
                    key=lambda item: item["ordinal"],
                ),
            }
        )

    flattened = [
        item["slug"]
        for batch in batches
        for item in batch["items"]
    ]
    if len(flattened) != 66 or len(set(flattened)) != 66:
        raise ValueError("motion batches must cover the live 66 exactly once")

    return {
        "schemaVersion": 1,
        "scope": "canonical live male 66 family-aware 4W+1S execution plan",
        "status": readiness["status"],
        "itemCount": len(flattened),
        "regenerateItemCount": sum(
            len(batch["items"])
            for batch in batches
            if batch["mode"] == "regenerate"
        ),
        "reviewExistingItemCount": sum(
            len(items) for items in review_groups.values()
        ),
        "executionEligible": readiness["motionProductionEligible"],
        "producesAssets": False,
        "runtimePromotionEligible": False,
        "sourceEvidence": {
            "motionReadiness": DEFAULT_READINESS_REPORT.relative_to(
                REPO_ROOT
            ).as_posix(),
            "motionReadinessSha256": readiness_sha256,
            "staticApprovalRecord": DEFAULT_RECORD.relative_to(
                REPO_ROOT
            ).as_posix(),
            "staticApprovalRecordSha256": _sha256(DEFAULT_RECORD),
        },
        "batches": batches,
    }


def main() -> None:
    plan = build_motion_batch_plan()
    DEFAULT_OUTPUT.write_text(
        json.dumps(plan, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": plan["status"],
                "batchCount": len(plan["batches"]),
                "regenerateItemCount": plan["regenerateItemCount"],
                "reviewExistingItemCount": plan[
                    "reviewExistingItemCount"
                ],
                "output": DEFAULT_OUTPUT.relative_to(REPO_ROOT).as_posix(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
