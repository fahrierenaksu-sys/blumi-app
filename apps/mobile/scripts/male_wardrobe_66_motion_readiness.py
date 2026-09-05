#!/usr/bin/env python3
"""Audit 4W+1S readiness for the live male 66 without producing motion.

Legacy runtime frames are useful inventory evidence, but they are never
treated as current after a selected static layer changes. A motion candidate
counts as current only when the redesign status ledger verifies all five
states and its static candidate hash equals the selected live-66 static hash.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from male_wardrobe_66_static_gate import (
    DEFAULT_OUTPUT as DEFAULT_STATIC_GATE_REPORT,
    REPO_ROOT,
    build_static_gate_report,
)


EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
MOTION_ROOT = (
    REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room/motion"
)
MOTION_REFRESH_ROOT = EVIDENCE_ROOT / "motion-refresh-v1"
MOTION_REFRESH_SUMMARY = (
    MOTION_REFRESH_ROOT / "male-wardrobe-48-motion-refresh-v1-manifest.json"
)
STATUS_SCRIPT = (
    REPO_ROOT / "apps/mobile/scripts/male-wardrobe-redesign-status.mjs"
)
DEFAULT_OUTPUT = EVIDENCE_ROOT / "male-wardrobe-66-motion-readiness.json"
MOTION_STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
FIXED_LAYER_REUSE_ACCESSORIES = {
    "soft_patch_beanie",
    "nylon_crossbody_bag",
    "beaded_charm_necklace",
    "tinted_star_glasses",
}
VERIFIED_STATE_STATUSES = {
    "CANDIDATE_VERIFIED",
    "APPROVED_VERIFIED",
}


def _resolve_repository_relative(value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"path must be repository-relative: {value}")
    resolved = (REPO_ROOT / relative).resolve()
    resolved.relative_to(REPO_ROOT.resolve())
    return resolved


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _legacy_runtime_prefix(category: str, slug: str) -> str:
    if category == "hair":
        return f"room_avatar_hair_front_male_{slug}_v1"
    return f"room_avatar_{category}_male_{slug}_v1"


def _legacy_runtime_frames(category: str, slug: str) -> list[str]:
    prefix = _legacy_runtime_prefix(category, slug)
    return [
        (MOTION_ROOT / f"{prefix}_{state}.png")
        .relative_to(REPO_ROOT)
        .as_posix()
        for state in MOTION_STATES
        if (MOTION_ROOT / f"{prefix}_{state}.png").is_file()
    ]


def _load_redesign_status() -> tuple[dict, str]:
    result = subprocess.run(
        ["node", str(STATUS_SCRIPT)],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = result.stdout.encode("utf-8")
    return json.loads(result.stdout), _sha256_bytes(payload)


def _load_refresh_records() -> tuple[dict[str, dict], str | None]:
    """Load candidate manifests for the 66 record-only extras.

    The runtime status ledger intentionally indexes only the 54 live catalog
    items. Hair/accessory and other record-only evidence still belongs in the
    66-item readiness audit, so merge those manifests without allowing them to
    override a live status item.
    """
    if not MOTION_REFRESH_SUMMARY.is_file():
        return {}, None
    summary = json.loads(MOTION_REFRESH_SUMMARY.read_text(encoding="utf-8"))
    records: dict[str, dict] = {}
    for manifest_value in summary.get("manifests", ()):
        if not isinstance(manifest_value, str):
            raise ValueError("manifest path must be repository-relative")
        manifest_path = _resolve_repository_relative(manifest_value)
        if not manifest_path.is_file():
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        slug = manifest.get("itemId")
        if not isinstance(slug, str) or not slug:
            continue
        states: dict[str, dict] = {}
        for state, frame in manifest.get("frames", {}).items():
            if state not in {"static", *MOTION_STATES}:
                continue
            if not isinstance(frame, dict):
                continue
            path = frame.get("path")
            checksum = frame.get("sha256")
            if isinstance(path, str) and isinstance(checksum, str):
                states[state] = {
                    "path": path,
                    "actualSha256": checksum,
                    "status": "CANDIDATE_VERIFIED",
                }
        if states:
            records[slug] = {
                "slug": slug,
                "states": states,
                "sourceEvidence": manifest_value,
            }
    return records, _sha256_file(MOTION_REFRESH_SUMMARY)


def _current_hash_bound_motion(
    redesign_item: dict | None,
    selected_static_sha256: str,
) -> bool:
    if redesign_item is None:
        return False
    states = redesign_item.get("states", {})
    static = states.get("static", {})
    if static.get("actualSha256") != selected_static_sha256:
        return False
    return all(
        states.get(state, {}).get("status") in VERIFIED_STATE_STATUSES
        for state in MOTION_STATES
    )


def _effective_selected_static_sha256(
    redesign_item: dict | None,
    static_gate_sha256: str,
) -> tuple[str, str]:
    if redesign_item is None:
        return static_gate_sha256, "canonical_66_static_gate"
    static = redesign_item.get("states", {}).get("static", {})
    if (
        static.get("status") in VERIFIED_STATE_STATUSES
        and isinstance(static.get("actualSha256"), str)
    ):
        return static["actualSha256"], "redesign_status_selected_static"
    return static_gate_sha256, "canonical_66_static_gate"


def motion_readiness_status(static_gate: dict) -> str:
    if static_gate.get("runtimePromotionVerified") is True:
        return static_gate.get(
            "status",
            "RUNTIME_PROMOTED_PENDING_FINAL_SIMULATOR",
        )
    if not static_gate.get("motionGenerationEligible"):
        status = static_gate.get("status")
        if not isinstance(status, str) or not status:
            return "BLOCKED_INVALID_STATIC_GATE_STATUS"
        return status
    return "READY_FOR_HASH_BOUND_MOTION_PRODUCTION"


def _load_bound_static_gate(path: Path) -> tuple[dict, str]:
    static_gate = build_static_gate_report()
    if not path.is_file():
        raise FileNotFoundError(path)
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    if on_disk != static_gate:
        raise ValueError(
            "static gate report file differs from the current in-memory "
            "static gate result"
        )
    return static_gate, _sha256_file(path)


def build_motion_readiness_report(
    *,
    static_gate_report_path: Path = DEFAULT_STATIC_GATE_REPORT,
) -> dict:
    static_gate, static_gate_report_sha256 = _load_bound_static_gate(
        static_gate_report_path
    )
    runtime_promoted = static_gate.get("runtimePromotionVerified") is True
    redesign_status, redesign_status_sha256 = _load_redesign_status()
    refresh_records, refresh_summary_sha256 = _load_refresh_records()
    redesign_by_slug = {
        item["slug"]: item
        for item in redesign_status.get("items", ())
    }
    for slug, record in refresh_records.items():
        redesign_by_slug.setdefault(slug, record)

    items: list[dict] = []
    for static_item in static_gate["items"]:
        category = static_item["category"]
        slug = static_item["slug"]
        legacy_frames = _legacy_runtime_frames(category, slug)
        fixed_reuse = (
            category == "accessory"
            and slug in FIXED_LAYER_REUSE_ACCESSORIES
        )
        redesign_item = redesign_by_slug.get(slug)
        selected_static_sha256, static_evidence_source = (
            _effective_selected_static_sha256(
                redesign_item,
                static_item["selectedCandidateSha256"],
            )
        )
        current = _current_hash_bound_motion(
            redesign_item,
            selected_static_sha256,
        )
        items.append(
            {
                "ordinal": static_item["ordinal"],
                "category": category,
                "slug": slug,
                "selectedStaticSha256": selected_static_sha256,
                "staticEvidenceSource": static_evidence_source,
                "legacyRuntimeFrames": legacy_frames,
                "legacyRuntimeFrameCount": len(legacy_frames),
                "legacyFixedLayerReuse": fixed_reuse,
                "currentHashBound4W1S": current,
                "nextAction": (
                    "RUNTIME_PROMOTED_VERIFIED"
                    if runtime_promoted
                    else "REVIEW_CURRENT_HASH_BOUND_4W1S_AFTER_STATIC_APPROVAL"
                    if current
                    else "REGENERATE_4W1S_AFTER_EXPLICIT_STATIC_APPROVAL"
                ),
            }
        )

    current_count = sum(item["currentHashBound4W1S"] for item in items)
    legacy_five_count = sum(
        item["legacyRuntimeFrameCount"] == len(MOTION_STATES)
        for item in items
    )
    fixed_count = sum(item["legacyFixedLayerReuse"] for item in items)
    return {
        "schemaVersion": 1,
        "scope": "canonical live male 66 current-static-bound 4W+1S readiness",
        "status": motion_readiness_status(static_gate),
        "itemCount": len(items),
        "currentHashBound4W1SItemCount": current_count,
        "requiresNewMotionItemCount": len(items) - current_count,
        "legacyRuntimeFiveFrameItemCount": legacy_five_count,
        "legacyFixedLayerReuseItemCount": fixed_count,
        "motionProductionEligible": (
            static_gate["motionGenerationEligible"]
            and not runtime_promoted
            and current_count < len(items)
        ),
        "runtimePromotionEligible": False,
        "runtimePromotionVerified": runtime_promoted,
        "runtimePromotionBlocker": (
            None
            if runtime_promoted
            else (
                "All current-static-bound 4W+1S outputs still require contact "
                "sheets, independent review, explicit motion approval, and "
                "final runtime verification."
            )
        ),
        "sourceEvidence": {
            "staticGateReport": static_gate_report_path.relative_to(
                REPO_ROOT
            ).as_posix(),
            "staticGateReportSha256": static_gate_report_sha256,
            "redesignStatusScript": STATUS_SCRIPT.relative_to(
                REPO_ROOT
            ).as_posix(),
            "redesignStatusOutputSha256": redesign_status_sha256,
            "motionRefreshSummary": (
                MOTION_REFRESH_SUMMARY.relative_to(REPO_ROOT).as_posix()
                if refresh_summary_sha256
                else None
            ),
            "motionRefreshSummarySha256": refresh_summary_sha256,
        },
        "items": items,
    }


def main() -> None:
    report = build_motion_readiness_report()
    DEFAULT_OUTPUT.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "itemCount": report["itemCount"],
                "currentHashBound4W1SItemCount": report[
                    "currentHashBound4W1SItemCount"
                ],
                "requiresNewMotionItemCount": report[
                    "requiresNewMotionItemCount"
                ],
                "output": DEFAULT_OUTPUT.relative_to(REPO_ROOT).as_posix(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
