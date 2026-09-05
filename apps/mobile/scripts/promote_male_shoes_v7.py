#!/usr/bin/env python3
"""Hash-bound, rollback-safe promotion for the approved male shoe v7 set."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
STYLES = (
    "chunky_skate_sneakers",
    "cloud_white_trainers",
    "cocoa_penny_loafers",
    "dusty_blue_canvas_sneakers",
    "lightweight_trail_sneakers",
    "milk_tea_court",
    "retro_colorblock_runner",
    "suede_penny_mules",
)
STATES = (
    "static",
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
CANVAS = (256, 384)


class PromotionRoots(NamedTuple):
    repository_root: Path
    room_root: Path
    motion_root: Path
    candidate_static_root: Path
    candidate_motion_root: Path
    approval_path: Path


class PromotionEntry(NamedTuple):
    style: str
    state: str
    source: Path
    destination: Path


class InspectionResult(NamedTuple):
    ready: bool
    changed: int
    unchanged: int
    errors: tuple[str, ...]


class PromotionResult(NamedTuple):
    promoted: int
    unchanged: int


class CheckResult(NamedTuple):
    ok: bool
    errors: tuple[str, ...]


def resolve_roots(repository_root: Path = REPO_ROOT) -> PromotionRoots:
    repository_root = repository_root.resolve()
    room_root = (
        repository_root / "apps/mobile/src/features/avatarV2/assets/room"
    )
    evidence_root = (
        repository_root
        / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    )
    return PromotionRoots(
        repository_root=repository_root,
        room_root=room_root,
        motion_root=room_root / "motion",
        candidate_static_root=evidence_root / "candidates/shoes",
        candidate_motion_root=evidence_root / "shoes-motion-v7",
        approval_path=evidence_root
        / "shoes-motion-v7/shoes-motion-v7-user-approval.json",
    )


def static_name(style: str) -> str:
    return f"avatar_room_shoes_male_{style}_v1.png"


def motion_name(style: str, state: str) -> str:
    return f"room_avatar_shoes_male_{style}_v1_{state}.png"


def create_promotion_plan(
    roots: PromotionRoots | None = None,
) -> tuple[PromotionEntry, ...]:
    roots = roots or resolve_roots()
    plan: list[PromotionEntry] = []
    for style in STYLES:
        for state in STATES:
            if state == "static":
                source = (
                    roots.candidate_static_root
                    / style
                    / "rig/static-review-v7.png"
                )
                destination = roots.room_root / static_name(style)
            else:
                source = roots.candidate_motion_root / style / motion_name(style, state)
                destination = roots.motion_root / motion_name(style, state)
            plan.append(
                PromotionEntry(
                    style=style,
                    state=state,
                    source=source,
                    destination=destination,
                )
            )
    validate_plan_shape(tuple(plan), expected_styles=set(STYLES))
    return tuple(plan)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_png(path: Path, label: str) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"missing or empty {label}: {path}")
    try:
        with Image.open(path) as image:
            image.load()
            if image.size != CANVAS:
                raise ValueError(
                    f"{label} must be {CANVAS[0]}x{CANVAS[1]}: "
                    f"{path} is {image.size[0]}x{image.size[1]}"
                )
            if image.mode != "RGBA":
                raise ValueError(f"{label} must be RGBA: {path} is {image.mode}")
    except OSError as error:
        raise ValueError(f"{label} is not a readable PNG: {path}") from error


def validate_plan_shape(
    plan: tuple[PromotionEntry, ...],
    *,
    expected_styles: set[str] | None = None,
) -> bool:
    if not plan:
        raise ValueError("promotion plan cannot be empty")
    styles = {entry.style for entry in plan}
    if expected_styles is not None and styles != expected_styles:
        raise ValueError(
            "promotion style allowlist mismatch: "
            f"expected {sorted(expected_styles)}, received {sorted(styles)}"
        )
    if len(plan) != len(styles) * len(STATES):
        raise ValueError("promotion plan must contain exactly six states per style")
    pairs = [(entry.style, entry.state) for entry in plan]
    if len(set(pairs)) != len(pairs):
        raise ValueError("promotion plan contains duplicate style/state entries")
    destinations = [entry.destination.resolve() for entry in plan]
    if len(set(destinations)) != len(destinations):
        raise ValueError("promotion plan contains duplicate destinations")
    for style in styles:
        actual_states = {entry.state for entry in plan if entry.style == style}
        if actual_states != set(STATES):
            raise ValueError(f"{style} must contain exact Static+W1-W4+S1 states")
    return True


def _parse_iso_timestamp(value: object) -> None:
    if not isinstance(value, str):
        raise ValueError("approvedAt must be an ISO timestamp")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("approvedAt must be an ISO timestamp") from error


def _resolve_repository_file(repository_root: Path, relative_path: object) -> Path:
    if not isinstance(relative_path, str) or not relative_path:
        raise ValueError("evidence path must be a non-empty string")
    candidate = (repository_root / relative_path).resolve()
    try:
        candidate.relative_to(repository_root.resolve())
    except ValueError as error:
        raise ValueError(f"evidence must stay inside repository: {relative_path}") from error
    return candidate


def validate_approval_receipt(
    receipt: object,
    plan: tuple[PromotionEntry, ...],
    repository_root: Path,
) -> bool:
    validate_plan_shape(plan)
    if not isinstance(receipt, dict):
        raise ValueError("approval receipt is required")
    if receipt.get("schemaVersion") != 1:
        raise ValueError("approval receipt schemaVersion must be 1")
    if receipt.get("verdict") != "PASS":
        raise ValueError("approval receipt verdict must be PASS")
    if receipt.get("approvalScope") != "male_shoes_v7_static_and_4w1s":
        raise ValueError("approval scope must bind male shoes v7 Static+4W+1S")
    if receipt.get("explicitUserApproval") is not True:
        raise ValueError("explicit user approval is required")
    if not isinstance(receipt.get("userApprovalMessage"), str):
        raise ValueError("user approval message is required")
    _parse_iso_timestamp(receipt.get("approvedAt"))
    if receipt.get("independentReviewVerdict") != "PASS":
        raise ValueError("independent review verdict must be PASS")
    producer = receipt.get("producer")
    reviewer = receipt.get("independentReviewer")
    if not isinstance(producer, str) or not producer:
        raise ValueError("producer identity is required")
    if not isinstance(reviewer, str) or not reviewer or reviewer == producer:
        raise ValueError("independent reviewer identity is required")

    expected_styles = {entry.style for entry in plan}
    styles = receipt.get("styles")
    if not isinstance(styles, dict) or set(styles) != expected_styles:
        raise ValueError("approval receipt must bind exactly the promoted styles")
    for style in expected_styles:
        state_hashes = styles.get(style)
        if not isinstance(state_hashes, dict) or set(state_hashes) != set(STATES):
            raise ValueError(f"{style} must bind exact Static+W1-W4+S1 hashes")
        for entry in (item for item in plan if item.style == style):
            validate_png(entry.source, f"{style} {entry.state} source")
            if state_hashes[entry.state] != sha256(entry.source):
                raise ValueError(f"{style} {entry.state} source hash mismatch")

    evidence = receipt.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        raise ValueError("approval receipt requires hash-bound visual evidence")
    seen_paths: set[Path] = set()
    for evidence_entry in evidence:
        if not isinstance(evidence_entry, dict):
            raise ValueError("invalid evidence entry")
        evidence_path = _resolve_repository_file(
            repository_root,
            evidence_entry.get("path"),
        )
        if evidence_path in seen_paths:
            raise ValueError("evidence paths must be unique")
        seen_paths.add(evidence_path)
        if not evidence_path.is_file() or evidence_path.stat().st_size == 0:
            raise ValueError(f"missing approval evidence: {evidence_path}")
        if evidence_entry.get("sha256") != sha256(evidence_path):
            raise ValueError(f"approval evidence hash mismatch: {evidence_path}")
    return True


def _preflight(
    plan: tuple[PromotionEntry, ...],
    receipt: object,
    repository_root: Path,
) -> None:
    if repository_root.resolve() == REPO_ROOT.resolve():
        canonical_plan = create_promotion_plan(resolve_roots(repository_root))
        if plan != canonical_plan:
            raise ValueError(
                "production promotion must use the canonical "
                "candidate-to-runtime mapping"
            )
    validate_approval_receipt(receipt, plan, repository_root)
    for entry in plan:
        validate_png(entry.source, f"{entry.style} {entry.state} source")
        if entry.destination.exists():
            validate_png(
                entry.destination,
                f"{entry.style} {entry.state} destination",
            )


def inspect_promotion(
    *,
    plan: tuple[PromotionEntry, ...],
    receipt: object,
    repository_root: Path,
    enforce_clean_targets: bool = False,
) -> InspectionResult:
    try:
        _preflight(plan, receipt, repository_root)
        if enforce_clean_targets:
            dirty = dirty_target_paths(repository_root, plan)
            if dirty:
                relative = ", ".join(
                    str(path.resolve().relative_to(repository_root.resolve()))
                    for path in dirty
                )
                raise ValueError(
                    "dirty or untracked runtime target(s) block promotion: "
                    f"{relative}"
                )
    except (OSError, ValueError) as error:
        return InspectionResult(False, 0, 0, (str(error),))
    changed = sum(
        not entry.destination.exists()
        or sha256(entry.source) != sha256(entry.destination)
        for entry in plan
    )
    return InspectionResult(True, changed, len(plan) - changed, ())


def dirty_target_paths(
    repository_root: Path,
    plan: tuple[PromotionEntry, ...],
) -> tuple[Path, ...]:
    """Return allowlisted destinations that Git reports modified or untracked."""

    repository_root = repository_root.resolve()
    relative_targets: list[str] = []
    destination_by_relative: dict[str, Path] = {}
    for entry in plan:
        try:
            relative = entry.destination.resolve().relative_to(repository_root)
        except ValueError as error:
            raise ValueError(
                f"runtime target escapes repository: {entry.destination}"
            ) from error
        relative_name = relative.as_posix()
        relative_targets.append(relative_name)
        destination_by_relative[relative_name] = entry.destination
    try:
        result = subprocess.run(
            (
                "git",
                "status",
                "--porcelain=v1",
                "-z",
                "--",
                *relative_targets,
            ),
            cwd=repository_root,
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("cannot verify runtime target worktree state") from error

    dirty: list[Path] = []
    for record in result.stdout.split(b"\0"):
        if not record:
            continue
        decoded = record.decode("utf-8")
        if len(decoded) < 4:
            raise ValueError("cannot parse Git worktree state")
        relative_name = decoded[3:]
        destination = destination_by_relative.get(relative_name)
        if destination is not None:
            dirty.append(destination)
    return tuple(sorted(set(dirty)))


def check_promoted(
    *,
    plan: tuple[PromotionEntry, ...],
    receipt: object,
    repository_root: Path,
) -> CheckResult:
    errors: list[str] = []
    try:
        _preflight(plan, receipt, repository_root)
    except (OSError, ValueError) as error:
        return CheckResult(False, (str(error),))
    for entry in plan:
        if not entry.destination.exists():
            errors.append(f"missing promoted destination: {entry.destination}")
        elif sha256(entry.destination) != sha256(entry.source):
            errors.append(
                f"destination hash mismatch: {entry.style} {entry.state}"
            )
    return CheckResult(not errors, tuple(errors))


def promote_with_rollback(
    *,
    plan: tuple[PromotionEntry, ...],
    receipt: object,
    repository_root: Path,
    fail_after_install: int | None = None,
    enforce_clean_targets: bool = True,
) -> PromotionResult:
    """Install each target with os.replace and roll back caught failures.

    This is intentionally not described as crash-atomic across all 48 files.
    Production writes fail closed when any allowlisted destination is already
    modified or untracked, protecting the shared dirty worktree.
    """

    _preflight(plan, receipt, repository_root)
    if enforce_clean_targets:
        dirty = dirty_target_paths(repository_root, plan)
        if dirty:
            relative = ", ".join(
                str(path.resolve().relative_to(repository_root.resolve()))
                for path in dirty
            )
            raise ValueError(
                "dirty or untracked runtime target(s) require a separate, "
                f"explicit overwrite decision: {relative}"
            )
    changed = tuple(
        entry
        for entry in plan
        if not entry.destination.exists()
        or sha256(entry.source) != sha256(entry.destination)
    )
    if not changed:
        return PromotionResult(0, len(plan))

    transaction_id = uuid.uuid4().hex
    staged: dict[Path, Path] = {}
    backups: dict[Path, Path | None] = {}
    installed: list[Path] = []
    try:
        for entry in changed:
            entry.destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = entry.destination.with_name(
                f".{entry.destination.name}.promotion-{transaction_id}.tmp"
            )
            shutil.copy2(entry.source, temporary)
            validate_png(temporary, "staged promotion asset")
            if sha256(temporary) != sha256(entry.source):
                raise RuntimeError(f"staged hash mismatch: {entry.style} {entry.state}")
            staged[entry.destination] = temporary

            if entry.destination.exists():
                backup = entry.destination.with_name(
                    f".{entry.destination.name}.promotion-{transaction_id}.bak"
                )
                shutil.copy2(entry.destination, backup)
                backups[entry.destination] = backup
            else:
                backups[entry.destination] = None

        for index, entry in enumerate(changed, start=1):
            os.replace(staged[entry.destination], entry.destination)
            installed.append(entry.destination)
            if fail_after_install is not None and index == fail_after_install:
                raise RuntimeError("injected install failure")

        check = check_promoted(
            plan=plan,
            receipt=receipt,
            repository_root=repository_root,
        )
        if not check.ok:
            raise RuntimeError("; ".join(check.errors))
    except Exception:
        for destination in reversed(installed):
            backup = backups[destination]
            if backup is None:
                destination.unlink(missing_ok=True)
            elif backup.exists():
                os.replace(backup, destination)
        raise
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)
        for backup in backups.values():
            if backup is not None:
                backup.unlink(missing_ok=True)

    return PromotionResult(len(changed), len(plan) - len(changed))


def read_receipt(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"missing approval receipt: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid approval receipt JSON: {path}") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--promote", action="store_true")
    mode.add_argument("--check", action="store_true")
    arguments = parser.parse_args()

    roots = resolve_roots()
    plan = create_promotion_plan(roots)
    receipt = read_receipt(roots.approval_path)
    if arguments.promote:
        result = promote_with_rollback(
            plan=plan,
            receipt=receipt,
            repository_root=roots.repository_root,
        )
        payload = {
            "status": "promoted",
            "promoted": result.promoted,
            "unchanged": result.unchanged,
        }
    elif arguments.check:
        result = check_promoted(
            plan=plan,
            receipt=receipt,
            repository_root=roots.repository_root,
        )
        payload = {"status": "pass" if result.ok else "fail", "errors": result.errors}
        if not result.ok:
            raise SystemExit(json.dumps(payload, indent=2))
    else:
        result = inspect_promotion(
            plan=plan,
            receipt=receipt,
            repository_root=roots.repository_root,
            enforce_clean_targets=True,
        )
        payload = {
            "status": "ready" if result.ready else "blocked",
            "changed": result.changed,
            "unchanged": result.unchanged,
            "errors": result.errors,
        }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
