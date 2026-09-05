#!/usr/bin/env python3
"""Hash-bound atomic promotion for the reviewed pose-native male bottom batch."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
REDESIGN = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
ASSET_MANIFEST = REDESIGN / "asset-manifest.json"
STATES = (
    "static",
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class Item:
    slug: str
    version: str
    approval: Path
    review: Path
    candidate_manifest: Path


@dataclass(frozen=True)
class PlanEntry:
    item: Item
    state: str
    source: Path
    expected_sha256: str
    destination: Path


@dataclass(frozen=True)
class ValidationResult:
    errors: list[str]
    validated_entries: int
    validated_items: int


ITEMS = (
    Item(
        slug="soft_parachute_cargo_pants",
        version="v9",
        approval=REDESIGN
        / "candidates/bottom/soft_parachute_cargo_pants_v9/"
        "soft-parachute-cargo-pants-v9-user-approval.json",
        review=REDESIGN
        / "candidates/bottom/soft_parachute_cargo_pants_v9/"
        "soft-parachute-cargo-pants-v9-independent-review.json",
        candidate_manifest=REDESIGN
        / "candidates/bottom/soft_parachute_cargo_pants_v9/"
        "soft-parachute-cargo-pants-v9-motion-manifest.json",
    ),
    Item(
        slug="colorblock_nylon_track_pants",
        version="v7",
        approval=REDESIGN
        / "candidates/bottom/colorblock_nylon_track_pants_v7/"
        "colorblock-nylon-track-pants-v7-user-approval.json",
        review=REDESIGN
        / "candidates/bottom/colorblock_nylon_track_pants_v7/"
        "colorblock-nylon-track-pants-v7-independent-review.json",
        candidate_manifest=REDESIGN
        / "candidates/bottom/colorblock_nylon_track_pants_v7/"
        "colorblock-nylon-track-pants-v7-motion-manifest.json",
    ),
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _runtime_destination(slug: str, state: str) -> Path:
    stem = f"bottom_male_{slug}_v1"
    if state == "static":
        return ROOM / f"avatar_room_{stem}.png"
    return MOTION / f"room_avatar_{stem}_{state}.png"


def build_plan(repository_root: Path) -> list[PlanEntry]:
    if repository_root != REPO_ROOT:
        raise ValueError("custom repository roots are not supported")
    plan: list[PlanEntry] = []
    for item in ITEMS:
        approval = _load(item.approval)
        for state in STATES:
            frame = approval["frames"][state]
            plan.append(
                PlanEntry(
                    item=item,
                    state=state,
                    source=repository_root / frame["path"],
                    expected_sha256=frame["sha256"],
                    destination=_runtime_destination(item.slug, state),
                )
            )
    return plan


def validate_plan(plan: list[PlanEntry]) -> ValidationResult:
    errors: list[str] = []
    destinations: set[Path] = set()
    validated_items = 0
    for item in ITEMS:
        approval = _load(item.approval)
        review = _load(item.review)
        required_approval = {
            "recordType": "male_wardrobe_item_approval",
            "approvalScope": "exact_item_static_4w1s_runtime",
            "itemId": item.slug,
            "version": item.version,
            "candidateOnly": True,
            "explicitUserApproval": True,
            "approvalVerdict": "PASS",
            "independentReviewVerdict": "PASS",
        }
        for key, expected in required_approval.items():
            if approval.get(key) != expected:
                errors.append(
                    f"{item.slug}: approval {key}={approval.get(key)!r}, "
                    f"expected {expected!r}"
                )
        if review.get("itemId") != item.slug or review.get("verdict") != "PASS":
            errors.append(f"{item.slug}: independent review is not PASS")
        board = approval.get("board", {})
        board_path = REPO_ROOT / str(board.get("path", ""))
        if not board_path.is_file() or _sha256(board_path) != board.get("sha256"):
            errors.append(f"{item.slug}: approval board hash mismatch")
        if review.get("board", {}).get("sha256") != board.get("sha256"):
            errors.append(f"{item.slug}: review is not bound to approved board")
        if not any(error.startswith(f"{item.slug}:") for error in errors):
            validated_items += 1

    for entry in plan:
        if entry.destination in destinations:
            errors.append(f"duplicate destination: {entry.destination}")
        destinations.add(entry.destination)
        if not entry.source.is_file():
            errors.append(f"missing source: {entry.source}")
        elif _sha256(entry.source) != entry.expected_sha256:
            errors.append(f"source hash mismatch: {entry.source}")
        if entry.state != "static":
            review = _load(entry.item.review)
            reviewed = review.get("frames", {}).get(entry.state, {})
            if reviewed.get("sha256") != entry.expected_sha256:
                errors.append(
                    f"{entry.item.slug}/{entry.state}: review hash mismatch"
                )
    return ValidationResult(
        errors=errors,
        validated_entries=len(plan) - len(
            [error for error in errors if "source" in error or "destination" in error]
        ),
        validated_items=validated_items,
    )


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def _write_bytes_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def _transaction_paths(plan: list[PlanEntry]) -> tuple[Path, ...]:
    record_paths = [ASSET_MANIFEST]
    for item in ITEMS:
        record_paths.extend((item.approval, item.candidate_manifest))
    return tuple(entry.destination for entry in plan) + tuple(record_paths)


def _update_records() -> None:
    asset_manifest = _load(ASSET_MANIFEST)
    by_slug = {entry["slug"]: entry for entry in asset_manifest["items"]}
    for item in ITEMS:
        approval = _load(item.approval)
        approval["candidateOnly"] = True
        approval["status"] = "user_approved_independent_pass_runtime_promoted"
        approval["runtimePromoted"] = True
        approval["runtime"] = {
            "static": str(
                _runtime_destination(item.slug, "static").relative_to(REPO_ROOT)
            ),
            "motionPrefix": str(
                (
                    MOTION / f"room_avatar_bottom_male_{item.slug}_v1_"
                ).relative_to(REPO_ROOT)
            ),
        }
        _write_json_atomic(item.approval, approval)

        candidate = _load(item.candidate_manifest)
        candidate["status"] = "user_approved_independent_pass_runtime_promoted"
        candidate["explicitUserApproval"] = True
        candidate["approvalVerdict"] = "PASS"
        candidate["userApproval"] = {
            "verdict": "PASS",
            "path": str(item.approval.relative_to(REPO_ROOT)),
        }
        candidate["runtimePromoted"] = True
        _write_json_atomic(item.candidate_manifest, candidate)

        registry = by_slug[item.slug]
        registry["candidatePaths"] = {
            state: approval["frames"][state]["path"] for state in STATES
        }
        registry["rigStates"] = {
            state: {
                "status": "APPROVED",
                "sha256": approval["frames"][state]["sha256"],
            }
            for state in STATES
        }
        registry["independentReview"] = {
            "status": "PASS",
            "path": str(item.review.relative_to(REPO_ROOT)),
        }
        registry["status"] = "approved"
        registry["userApproved"] = True
        registry["runtimePromoted"] = True
        registry["approvalRecord"] = str(item.approval.relative_to(REPO_ROOT))
    _write_json_atomic(ASSET_MANIFEST, asset_manifest)


def promote(plan: list[PlanEntry]) -> dict:
    validation = validate_plan(plan)
    if validation.errors:
        raise ValueError("; ".join(validation.errors))
    backups = {
        path: path.read_bytes() if path.exists() else None
        for path in _transaction_paths(plan)
    }
    try:
        for entry in plan:
            entry.destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                dir=entry.destination.parent,
                prefix=f".{entry.destination.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                temporary = Path(handle.name)
            shutil.copyfile(entry.source, temporary)
            os.replace(temporary, entry.destination)
            if _sha256(entry.destination) != entry.expected_sha256:
                raise ValueError(f"post-copy hash mismatch: {entry.destination}")
        _update_records()
    except Exception:
        for destination, previous in backups.items():
            if previous is None:
                destination.unlink(missing_ok=True)
            else:
                _write_bytes_atomic(destination, previous)
        raise
    return {
        "promotedItems": len(ITEMS),
        "promotedFiles": len(plan),
        "slugs": [item.slug for item in ITEMS],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    plan = build_plan(REPO_ROOT)
    validation = validate_plan(plan)
    if validation.errors:
        raise SystemExit("\n".join(validation.errors))
    result = (
        promote(plan)
        if args.promote
        else {
            "mode": "check",
            "validatedItems": validation.validated_items,
            "validatedEntries": validation.validated_entries,
        }
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
