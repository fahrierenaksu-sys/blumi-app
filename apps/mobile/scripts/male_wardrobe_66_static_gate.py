#!/usr/bin/env python3
"""Fail-closed hand-off from reviewed male static art to motion production.

This gate is intentionally read-only with respect to runtime assets. It binds
the 66 selected candidate layers to the reviewed board/selection hashes,
reports which live application files still differ, and never permits runtime
promotion from static evidence alone.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from render_male_wardrobe_66_progress_board import (
    EXPECTED_COUNTS,
    resolve_authoritative_items,
)
from write_male_wardrobe_66_static_approval_record import (
    REQUIRED_REVIEW_GATES,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
DEFAULT_RECORD = EVIDENCE_ROOT / "male-wardrobe-66-static-approval-record.json"
DEFAULT_OUTPUT = EVIDENCE_ROOT / "male-wardrobe-66-static-gate-report.json"
NECK_CENTER = (128, 219)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _resolve_repository_path(value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"path must be repository-relative: {value}")
    resolved = (REPO_ROOT / relative).resolve()
    resolved.relative_to(REPO_ROOT.resolve())
    return resolved


def _runtime_path(item: dict) -> Path:
    category = item["category"]
    slug = item["slug"]
    if category == "hair":
        filename = f"avatar_room_hair_front_male_{slug}_v1.png"
    else:
        filename = f"avatar_room_{category}_male_{slug}_v1.png"
    return ROOM / filename


def _neck_center_alpha(path: Path, category: str) -> int | None:
    if category != "top" or not path.is_file():
        return None
    with Image.open(path) as opened:
        opened.load()
        if opened.size != (256, 384) or opened.mode != "RGBA":
            raise ValueError(f"invalid top layer: {path}")
        return opened.getchannel("A").getpixel(NECK_CENTER)


def _validate_review_chain(
    record: dict,
) -> tuple[bool, bool, bool, bool, str]:
    board = record.get("board", {})
    contracts = record.get("contracts", {})
    selection = contracts.get("selection", {})
    catalog = contracts.get("catalog", {})
    candidate_manifest = contracts.get("candidateManifest", {})
    board_path = _resolve_repository_path(board["path"])
    selection_path = _resolve_repository_path(selection["path"])
    catalog_path = _resolve_repository_path(catalog["path"])
    candidate_manifest_path = _resolve_repository_path(
        candidate_manifest["path"]
    )
    board_matches = _sha256(board_path) == board["sha256"]
    selection_matches = _sha256(selection_path) == selection["sha256"]
    catalog_matches = _sha256(catalog_path) == catalog["sha256"]
    candidate_manifest_matches = (
        _sha256(candidate_manifest_path) == candidate_manifest["sha256"]
    )

    independent = record.get("independentStaticReview", {})
    evidence_path = _resolve_repository_path(independent["evidencePath"])
    evidence_matches = _sha256(evidence_path) == independent["evidenceSha256"]
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    record_gates = independent.get("gates", {})
    evidence_gates = evidence.get("gates", {})
    gates_pass = all(
        record_gates.get(gate) == "PASS"
        and evidence_gates.get(gate) == "PASS"
        for gate in REQUIRED_REVIEW_GATES
    )
    evidence_contract_matches = (
        evidence.get("schemaVersion") == 1
        and evidence.get("verdict") == "PASS"
        and evidence.get("boardSha256") == board["sha256"]
        and evidence.get("selectionSha256") == selection["sha256"]
        and evidence.get("reviewedItemCount") == 66
    )
    verdict = (
        "PASS"
        if independent.get("verdict") == "PASS"
        and evidence_matches
        and gates_pass
        and evidence_contract_matches
        else "FAIL"
    )
    return (
        board_matches,
        selection_matches,
        catalog_matches,
        candidate_manifest_matches,
        verdict,
    )


def _validate_authoritative_items(record: dict) -> None:
    contracts = record["contracts"]
    catalog_path = _resolve_repository_path(contracts["catalog"]["path"])
    manifest_path = _resolve_repository_path(
        contracts["candidateManifest"]["path"]
    )
    selection_path = _resolve_repository_path(
        contracts["selection"]["path"]
    )
    authoritative = resolve_authoritative_items(
        repository_root=REPO_ROOT,
        catalog_path=catalog_path,
        manifest_path=manifest_path,
        selection_path=selection_path,
    )
    expected = [
        (
            item.ordinal,
            item.category,
            item.role,
            item.family,
            item.slug,
            item.shoe_contact_role,
            item.layer_path.relative_to(REPO_ROOT).as_posix(),
            _sha256(item.layer_path),
        )
        for item in authoritative
    ]
    actual = [
        (
            item.get("ordinal"),
            item.get("category"),
            item.get("role"),
            item.get("family"),
            item.get("slug"),
            item.get("shoeContactRole"),
            item.get("layerPath"),
            item.get("layerSha256"),
        )
        for item in record["items"]
    ]
    if actual != expected:
        raise ValueError(
            "static approval record items do not match the authoritative live 66"
        )
    if record.get("categoryCounts") != EXPECTED_COUNTS:
        raise ValueError(
            "static approval record categoryCounts do not match the "
            "authoritative live 66"
        )


def _runtime_promotion_hashes(
    record: dict,
) -> tuple[bool, dict[str, dict[str, str]]]:
    binding = record.get("runtimePromotionEvidence")
    if not isinstance(binding, dict) or binding.get("verdict") != "PASS":
        return False, {}
    try:
        evidence_path = _resolve_repository_path(binding["evidencePath"])
    except (KeyError, TypeError, ValueError):
        return False, {}
    if (
        not evidence_path.is_file()
        or _sha256(evidence_path) != binding.get("evidenceSha256")
    ):
        return False, {}
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if (
        evidence.get("schemaVersion") != 1
        or evidence.get("verdict") != "PASS"
        or evidence.get("itemCount") != 66
        or evidence.get("fileCount") != 396
    ):
        return False, {}
    required_states = {
        "static",
        "walking_front_f01",
        "walking_front_f02",
        "walking_front_f03",
        "walking_front_f04",
        "sitting_front_f01",
    }
    hashes: dict[str, dict[str, str]] = {}
    for item in evidence.get("items", ()):
        slug = item.get("slug")
        frames = item.get("frames", {})
        if (
            not isinstance(slug, str)
            or set(frames) != required_states
        ):
            return False, {}
        state_hashes: dict[str, str] = {}
        for state in required_states:
            frame = frames.get(state, {})
            path = frame.get("runtimePath")
            checksum = frame.get("runtimeSha256")
            if not isinstance(path, str) or not isinstance(checksum, str):
                return False, {}
            try:
                runtime_path = _resolve_repository_path(path)
            except ValueError:
                return False, {}
            if (
                not runtime_path.is_file()
                or _sha256(runtime_path) != checksum
            ):
                return False, {}
            state_hashes[state] = checksum
        hashes[slug] = state_hashes
    return len(hashes) == 66, hashes


def _final_simulator_valid(record: dict) -> bool:
    binding = record.get("finalSimulatorEvidence")
    if not isinstance(binding, dict) or binding.get("verdict") != "PASS":
        return False
    try:
        evidence_path = _resolve_repository_path(binding["evidencePath"])
    except (KeyError, TypeError, ValueError):
        return False
    if (
        not evidence_path.is_file()
        or _sha256(evidence_path) != binding.get("evidenceSha256")
    ):
        return False
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    try:
        screenshot_path = _resolve_repository_path(
            evidence["screenshotPath"]
        )
    except (KeyError, TypeError, ValueError):
        return False
    return (
        evidence.get("schemaVersion") == 1
        and evidence.get("verdict") == "PASS"
        and screenshot_path.is_file()
        and _sha256(screenshot_path) == evidence.get("screenshotSha256")
    )


def build_static_gate_report(
    *,
    record_path: Path = DEFAULT_RECORD,
) -> dict:
    record = json.loads(record_path.read_text(encoding="utf-8"))
    if record.get("schemaVersion") != 1 or record.get("itemCount") != 66:
        raise ValueError("static approval record must describe the canonical 66")
    if len(record.get("items", ())) != 66:
        raise ValueError("static approval record must contain 66 item records")
    _validate_authoritative_items(record)

    (
        board_matches,
        selection_matches,
        catalog_matches,
        candidate_manifest_matches,
        independent_verdict,
    ) = _validate_review_chain(record)
    chain_valid = (
        board_matches
        and selection_matches
        and catalog_matches
        and candidate_manifest_matches
        and independent_verdict == "PASS"
    )
    user_approved = record.get("userApproved") is True
    motion_generated = record.get("motionGenerated") is True
    runtime_evidence_valid, runtime_hashes = _runtime_promotion_hashes(record)
    runtime_promoted = record.get("runtimePromoted") is True
    final_simulator_verified = _final_simulator_valid(record)

    if not chain_valid:
        status = "BLOCKED_STATIC_EVIDENCE_DRIFT"
    elif not user_approved:
        status = "BLOCKED_PENDING_EXPLICIT_USER_STATIC_APPROVAL"
    elif not motion_generated:
        status = "STATIC_APPROVED_MOTION_NOT_YET_GENERATED"
    elif (
        runtime_promoted
        and runtime_evidence_valid
        and final_simulator_verified
    ):
        status = "RUNTIME_PROMOTED_FINAL_SIMULATOR_VERIFIED"
    elif runtime_promoted and runtime_evidence_valid:
        status = "RUNTIME_PROMOTED_PENDING_FINAL_SIMULATOR"
    else:
        status = "BLOCKED_PENDING_HASH_BOUND_MOTION_REVIEW"

    items: list[dict] = []
    for item in record["items"]:
        selected = _resolve_repository_path(item["layerPath"])
        selected_hash = _sha256(selected)
        if selected_hash != item["layerSha256"]:
            raise ValueError(f"{item['slug']}: selected candidate checksum drift")
        runtime = _runtime_path(item)
        runtime_hash = _sha256(runtime) if runtime.is_file() else None
        approved_runtime_states = runtime_hashes.get(item["slug"], {})
        expected_runtime_hash = approved_runtime_states.get("static")
        items.append(
            {
                "ordinal": item["ordinal"],
                "category": item["category"],
                "slug": item["slug"],
                "selectedCandidatePath": item["layerPath"],
                "selectedCandidateSha256": selected_hash,
                "runtimePath": runtime.relative_to(REPO_ROOT).as_posix(),
                "runtimeSha256": runtime_hash,
                "approvedRuntimeSha256": expected_runtime_hash,
                "approvedRuntimeStateCount": len(
                    approved_runtime_states
                ),
                "runtimeMatchesSelectedCandidate": (
                    runtime_hash == selected_hash
                ),
                "runtimeMatchesApprovedDerivative": (
                    expected_runtime_hash is not None
                    and runtime_hash == expected_runtime_hash
                ),
                "selectedNeckCenterAlpha": _neck_center_alpha(
                    selected,
                    item["category"],
                ),
                "runtimeNeckCenterAlpha": _neck_center_alpha(
                    runtime,
                    item["category"],
                ),
            }
        )

    return {
        "schemaVersion": 1,
        "scope": "canonical male 66 static-to-motion hand-off",
        "status": status,
        "itemCount": len(items),
        "boardHashMatches": board_matches,
        "selectionHashMatches": selection_matches,
        "catalogHashMatches": catalog_matches,
        "candidateManifestHashMatches": candidate_manifest_matches,
        "independentStaticReview": independent_verdict,
        "explicitUserStaticApproval": user_approved,
        "motionGenerationEligible": chain_valid and user_approved,
        "runtimePromotionEligible": False,
        "runtimePromotionVerified": (
            chain_valid
            and user_approved
            and motion_generated
            and runtime_promoted
            and runtime_evidence_valid
            and all(
                item["runtimeMatchesApprovedDerivative"]
                for item in items
            )
        ),
        "finalSimulatorVerified": final_simulator_verified,
        "runtimePromotionBlocker": (
            None
            if runtime_promoted and runtime_evidence_valid
            else (
                "Static approval never authorizes runtime promotion; "
                "hash-bound 4W+1S motion review and final runtime evidence "
                "are still required."
            )
        ),
        "runtimeDifferentItemCount": sum(
            not item["runtimeMatchesApprovedDerivative"] for item in items
        ),
        "items": items,
    }


def main() -> None:
    report = build_static_gate_report()
    DEFAULT_OUTPUT.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "itemCount": report["itemCount"],
                "runtimeDifferentItemCount": report[
                    "runtimeDifferentItemCount"
                ],
                "output": DEFAULT_OUTPUT.relative_to(REPO_ROOT).as_posix(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
