#!/usr/bin/env python3
"""Atomically promote the approved current male 66 static + 4W+1S set."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from write_male_wardrobe_66_static_approval_record import (
    create_static_approval_record,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_REL = Path("apps/mobile/src/features/avatarV2/assets/room")
EVIDENCE_REL = Path(
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
APPROVAL_REL = EVIDENCE_REL / "male-wardrobe-66-static-approval-record.json"
MANIFEST_REL = EVIDENCE_REL / "asset-manifest.json"
REFRESH_REL = (
    EVIDENCE_REL
    / "motion-refresh-v1/male-wardrobe-48-motion-refresh-v1-manifest.json"
)
STATIC_REVIEW_REL = (
    EVIDENCE_REL / "male-wardrobe-66-independent-static-review-v4.json"
)
MOTION_REVIEW_REL = (
    EVIDENCE_REL
    / "motion-refresh-v1/male-wardrobe-48-motion-independent-review-v2.json"
)
FINAL_REVIEW_REL = (
    EVIDENCE_REL / "male-wardrobe-66-final-independent-review-v1.json"
)
RUNTIME_EVIDENCE_REL = (
    EVIDENCE_REL / "male-wardrobe-66-runtime-promotion-evidence-v1.json"
)
ITEM_APPROVALS_REL = EVIDENCE_REL / "runtime-promotion-v1/item-approvals"
BOARD_REL = EVIDENCE_REL / "male-wardrobe-66-on-base-progress-board.png"
SELECTION_REL = EVIDENCE_REL / "review-composite-selection.json"
CATALOG_REL = Path("packages/domain/src/avatar/avatarLoadoutCatalog.ts")
MOTION_STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
VERIFIED = {"CANDIDATE_VERIFIED", "APPROVED_VERIFIED"}
SUPERSEDED_TOP_SLUGS = {
    "cropped_cocoa_moto_jacket",
    "diagonal_seam_zip_mock_neck",
    "fog_blue_relaxed_hoodie",
    "indigo_denim_relaxed_workshirt",
    "oatmeal_fine_gauge_crewneck",
}


@dataclass(frozen=True)
class Entry:
    category: str
    slug: str
    state: str
    source: Path
    expected_sha256: str
    destination: Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _inside(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_repository_relative(repository_root: Path, value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"path must be repository-relative: {value}")
    resolved = (repository_root / relative).resolve()
    if not _inside(repository_root, resolved):
        raise ValueError(f"path must be repository-relative: {value}")
    return resolved


def runtime_destination(
    repository_root: Path, category: str, slug: str, state: str
) -> Path:
    kind = "hair_front" if category == "hair" else category
    prefix = f"{kind}_male_{slug}_v1"
    if state == "static":
        return repository_root / ROOM_REL / f"avatar_room_{prefix}.png"
    return (
        repository_root
        / ROOM_REL
        / "motion"
        / f"room_avatar_{prefix}_{state}.png"
    )


def build_promotion_plan(
    repository_root: Path, record: dict, state_records: dict[str, dict]
) -> list[Entry]:
    plan: list[Entry] = []
    for item in record.get("items", ()):
        category, slug = item["category"], item["slug"]
        states = state_records.get(slug, {})
        for state in ("static", *MOTION_STATES):
            frame = states.get(state)
            if frame is None:
                source = repository_root / f".missing/{slug}/{state}.png"
                checksum = ""
            else:
                source_value = Path(str(frame.get("path", "")))
                source = (
                    source_value
                    if source_value.is_absolute()
                    else repository_root / source_value
                )
                checksum = str(frame.get("actualSha256", ""))
            plan.append(
                Entry(
                    category=category,
                    slug=slug,
                    state=state,
                    source=source,
                    expected_sha256=checksum,
                    destination=runtime_destination(
                        repository_root, category, slug, state
                    ),
                )
            )
    return plan


def validate_promotion_plan(
    plan: list[Entry], *, expected_item_count: int = 66
) -> list[str]:
    errors: list[str] = []
    identities = {(e.category, e.slug) for e in plan}
    if len(identities) != expected_item_count:
        errors.append(
            f"identity count {len(identities)}, expected {expected_item_count}"
        )
    destinations: set[Path] = set()
    for entry in plan:
        if entry.destination in destinations:
            errors.append(f"duplicate destination: {entry.destination}")
        destinations.add(entry.destination)
        if ".missing" in entry.source.parts:
            errors.append(f"{entry.slug}/{entry.state}: missing state")
            continue
        parts = entry.destination.parts
        try:
            apps_index = parts.index("apps")
        except ValueError:
            errors.append(f"{entry.slug}/{entry.state}: invalid destination root")
            continue
        repository_root = Path(*parts[:apps_index])
        if not _inside(repository_root, entry.source):
            errors.append(f"{entry.slug}/{entry.state}: source outside repository")
        elif not entry.source.is_file():
            errors.append(f"{entry.slug}/{entry.state}: source missing")
        elif not entry.expected_sha256:
            errors.append(f"{entry.slug}/{entry.state}: missing hash")
        elif sha256(entry.source) != entry.expected_sha256:
            errors.append(f"{entry.slug}/{entry.state}: source hash mismatch")
    return errors


def validate_delete_plan(
    plan: list[Entry], deletes: list[Path], repository_root: Path
) -> None:
    destinations = {entry.destination.resolve() for entry in plan}
    for path in deletes:
        resolved = path.resolve()
        if not _inside(repository_root, resolved):
            raise ValueError(f"delete outside repository: {path}")
        if resolved in destinations:
            raise ValueError(f"delete overlaps promotion destination: {path}")


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _relative(repository_root: Path, path: Path) -> str:
    return path.resolve().relative_to(repository_root.resolve()).as_posix()


def _validate_final_review(repository_root: Path) -> dict:
    path = repository_root / FINAL_REVIEW_REL
    review = _load(path)
    if (
        review.get("schemaVersion") != 1
        or review.get("verdict") != "PASS"
        or review.get("reviewedItemCount") != 66
        or review.get("boardSha256") != sha256(repository_root / BOARD_REL)
        or review.get("selectionSha256")
        != sha256(repository_root / SELECTION_REL)
    ):
        raise ValueError("final independent review is missing or stale")
    return review


def _status(repository_root: Path) -> dict:
    result = subprocess.run(
        ["node", "apps/mobile/scripts/male-wardrobe-redesign-status.mjs"],
        cwd=repository_root,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def _refresh_records(
    repository_root: Path, *, summary_path: Path | None = None
) -> dict[str, dict]:
    summary = _load(summary_path or repository_root / REFRESH_REL)
    records: dict[str, dict] = {}
    for relative in summary["manifests"]:
        if not isinstance(relative, str):
            raise ValueError("manifest path must be repository-relative")
        manifest = _load(
            resolve_repository_relative(repository_root, relative)
        )
        records[manifest["itemId"]] = manifest["frames"]
    return records


def current_record_and_states(repository_root: Path) -> tuple[dict, dict]:
    prior = _load(repository_root / APPROVAL_REL)
    status = _status(repository_root)
    status_items = status["items"]
    if len(status_items) != 54:
        raise ValueError("current catalog must contain exactly 54 core items")
    core_slugs = {item["slug"] for item in status_items}
    extras = [
        item
        for item in prior["items"]
        if item["category"] in {"hair", "accessory"}
        and item["slug"] not in core_slugs
    ]
    if len(extras) != 12:
        raise ValueError("current record must supply exactly 12 hair/accessory extras")
    states = {item["slug"]: item["states"] for item in status_items}
    for slug, frames in _refresh_records(repository_root).items():
        states.setdefault(
            slug,
            {
                state: {
                    **frame,
                    "actualSha256": frame["sha256"],
                    "status": "CANDIDATE_VERIFIED",
                }
                for state, frame in frames.items()
            },
        )
    items = []
    for ordinal, item in enumerate(status_items, 1):
        static = item["states"]["static"]
        items.append(
            {
                "ordinal": ordinal,
                "category": item["category"],
                "role": item["category"],
                "family": item["family"],
                "slug": item["slug"],
                "layerPath": static["path"],
                "layerSha256": static["actualSha256"],
            }
        )
    for item in extras:
        items.append({**item, "ordinal": len(items) + 1})
    record = {
        **prior,
        "generatedOn": datetime.now().astimezone().isoformat(),
        "scope": "current live male 54 plus approved 12 hair/accessory assets",
        "status": "explicit_user_approved_runtime_promotion",
        "itemCount": 66,
        "items": items,
        "userApproved": True,
        "motionGenerated": True,
        "runtimePromoted": False,
        "nextGate": "runtime_promotion",
        "approvalMessage": "onaylıyorum",
        "independentStaticReview": {
            "verdict": "PASS",
            "evidencePath": STATIC_REVIEW_REL.as_posix(),
            "evidenceSha256": sha256(repository_root / STATIC_REVIEW_REL),
        },
        "independentMotionReview": {
            "verdict": "PASS",
            "evidencePath": MOTION_REVIEW_REL.as_posix(),
            "evidenceSha256": sha256(repository_root / MOTION_REVIEW_REL),
            "reviewedItemCount": 51,
            "remainingItemEvidence": "item-level approved motion records and shoes-motion-v7 approval",
        },
    }
    return record, states


def legacy_delete_paths(repository_root: Path, status: dict) -> list[Path]:
    paths: list[Path] = []
    for item in status["items"]:
        replaces = item["runtime"].get("replacesPath")
        if not replaces:
            continue
        static = repository_root / replaces
        paths.append(static)
        old_prefix = static.stem.replace("avatar_room_", "room_avatar_")
        paths.extend(
            repository_root / ROOM_REL / "motion" / f"{old_prefix}_{state}.png"
            for state in MOTION_STATES
        )
    for slug in SUPERSEDED_TOP_SLUGS:
        paths.append(
            repository_root
            / ROOM_REL
            / f"avatar_room_top_male_{slug}_v1.png"
        )
        paths.extend(
            repository_root
            / ROOM_REL
            / "motion"
            / f"room_avatar_top_male_{slug}_v1_{state}.png"
            for state in MOTION_STATES
        )
    return sorted(set(paths))


def _promote_candidate_manifests(
    repository_root: Path, states: dict[str, dict]
) -> list[Path]:
    changed: list[Path] = []
    for slug, item_states in states.items():
        record_paths = {
            value
            for frame in item_states.values()
            for value in frame.get("recordPaths", ())
            if isinstance(value, str)
        }
        for relative in record_paths:
            path = repository_root / relative
            if not path.is_file():
                continue
            payload = _load(path)
            if payload.get("itemId") != slug:
                continue
            frames = payload.get("frames")
            if not isinstance(frames, dict) or not all(
                state in frames for state in ("static", *MOTION_STATES)
            ):
                continue
            payload["explicitUserApproval"] = True
            payload["approvalVerdict"] = "PASS"
            payload["runtimePromoted"] = True
            payload["status"] = "user_approved_runtime_promoted"
            _atomic_json(path, payload)
            changed.append(path)
    return changed


def _atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=destination.parent, prefix=f".{destination.name}.", delete=False
    ) as handle:
        temporary = Path(handle.name)
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)


def normalize_transparent_rgb(source: Path, destination: Path) -> dict:
    """Create a visually identical PNG with zero RGB in fully transparent pixels."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as opened:
        rgba = opened.convert("RGBA")
        pixels = list(rgba.getdata())
        cleared = sum(
            alpha == 0 and (red != 0 or green != 0 or blue != 0)
            for red, green, blue, alpha in pixels
        )
        normalized = [
            (0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha)
            for red, green, blue, alpha in pixels
        ]
        rgba.putdata(normalized)
        with tempfile.NamedTemporaryFile(
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".png",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
        rgba.save(temporary, format="PNG")
    os.replace(temporary, destination)
    return {
        "candidateSha256": sha256(source),
        "runtimeSha256": sha256(destination),
        "clearedPixelCount": cleared,
    }


def _atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def _write_runtime_evidence(
    repository_root: Path,
    record: dict,
    plan: list[Entry],
    runtime_results: dict[tuple[str, str], dict],
) -> dict:
    review_path = repository_root / FINAL_REVIEW_REL
    items = []
    for item in record["items"]:
        frames = {}
        for entry in plan:
            if entry.slug != item["slug"]:
                continue
            result = runtime_results[(entry.slug, entry.state)]
            frames[entry.state] = {
                "candidatePath": _relative(repository_root, entry.source),
                "candidateSha256": result["candidateSha256"],
                "runtimePath": _relative(repository_root, entry.destination),
                "runtimeSha256": result["runtimeSha256"],
                "clearedTransparentRgbPixelCount": result[
                    "clearedPixelCount"
                ],
            }
        items.append(
            {
                "ordinal": item["ordinal"],
                "category": item["category"],
                "slug": item["slug"],
                "frames": frames,
            }
        )
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_runtime_promotion_evidence",
        "generatedOn": datetime.now().astimezone().isoformat(),
        "verdict": "PASS",
        "itemCount": len(items),
        "fileCount": sum(len(item["frames"]) for item in items),
        "normalization": "RGB is zeroed only where alpha equals zero",
        "canonicalBase": (
            "apps/mobile/src/features/avatarV2/assets/room/"
            "avatar_room_base_male_light_v1.png"
        ),
        "contracts": {
            "board": {
                "path": BOARD_REL.as_posix(),
                "sha256": sha256(repository_root / BOARD_REL),
            },
            "selection": {
                "path": SELECTION_REL.as_posix(),
                "sha256": sha256(repository_root / SELECTION_REL),
            },
            "catalog": {
                "path": CATALOG_REL.as_posix(),
                "sha256": sha256(repository_root / CATALOG_REL),
            },
            "candidateManifest": {
                "path": MANIFEST_REL.as_posix(),
                "sha256": sha256(repository_root / MANIFEST_REL),
            },
            "independentReview": {
                "path": FINAL_REVIEW_REL.as_posix(),
                "sha256": sha256(review_path),
            },
        },
        "explicitUserApproval": True,
        "approvalMessage": "onaylıyorum",
        "items": items,
    }
    _atomic_json(repository_root / RUNTIME_EVIDENCE_REL, payload)
    return payload


def _write_core_item_approvals(
    repository_root: Path,
    promotion_evidence: dict,
) -> list[Path]:
    evidence_hash = sha256(repository_root / RUNTIME_EVIDENCE_REL)
    review_hash = sha256(repository_root / FINAL_REVIEW_REL)
    paths: list[Path] = []
    for item in promotion_evidence["items"]:
        if item["category"] not in {"top", "bottom", "shoes"}:
            continue
        frames = {
            state: {
                "path": frame["candidatePath"],
                "sha256": frame["candidateSha256"],
                "runtimePath": frame["runtimePath"],
                "runtimeSha256": frame["runtimeSha256"],
            }
            for state, frame in item["frames"].items()
        }
        path = (
            repository_root
            / ITEM_APPROVALS_REL
            / item["category"]
            / f"{item['slug']}-approval-v1.json"
        )
        payload = {
            "schemaVersion": 1,
            "recordType": "male_wardrobe_item_approval",
            "approvalScope": "exact_item_static_4w1s_runtime",
            "itemId": item["slug"],
            "candidateOnly": True,
            "version": "v100",
            "explicitUserApproval": True,
            "approvalVerdict": "PASS",
            "independentReviewVerdict": "PASS",
            "runtimePromoted": True,
            "frames": frames,
            "evidence": {
                "runtimePromotionPath": RUNTIME_EVIDENCE_REL.as_posix(),
                "runtimePromotionSha256": evidence_hash,
                "independentReviewPath": FINAL_REVIEW_REL.as_posix(),
                "independentReviewSha256": review_hash,
            },
        }
        _atomic_json(path, payload)
        paths.append(path)
    return paths


def promote(repository_root: Path) -> dict:
    final_review = _validate_final_review(repository_root)
    record, states = current_record_and_states(repository_root)
    plan = build_promotion_plan(repository_root, record, states)
    errors = validate_promotion_plan(plan)
    if errors:
        raise ValueError("\n".join(errors))
    status = _status(repository_root)
    deletes = legacy_delete_paths(repository_root, status)
    validate_delete_plan(plan, deletes, repository_root)
    candidate_manifests = {
        resolve_repository_relative(repository_root, value)
        for item_states in states.values()
        for frame in item_states.values()
        for value in frame.get("recordPaths", ())
        if isinstance(value, str)
    }
    item_approval_paths = {
        repository_root
        / ITEM_APPROVALS_REL
        / item["category"]
        / f"{item['slug']}-approval-v1.json"
        for item in record["items"]
        if item["category"] in {"top", "bottom", "shoes"}
    }
    touched = (
        {entry.destination for entry in plan}
        | set(deletes)
        | candidate_manifests
        | item_approval_paths
        | {
        repository_root / APPROVAL_REL,
        repository_root / MANIFEST_REL,
        repository_root / RUNTIME_EVIDENCE_REL,
        }
    )
    backups = {p: p.read_bytes() if p.exists() else None for p in touched}
    try:
        runtime_results: dict[tuple[str, str], dict] = {}
        for entry in plan:
            result = normalize_transparent_rgb(entry.source, entry.destination)
            runtime_results[(entry.slug, entry.state)] = result
            if result["candidateSha256"] != entry.expected_sha256:
                raise ValueError(f"candidate hash drift: {entry.source}")
            if sha256(entry.destination) != result["runtimeSha256"]:
                raise ValueError(f"post-copy hash mismatch: {entry.destination}")
        changed_manifests = _promote_candidate_manifests(
            repository_root, states
        )
        manifest = _load(repository_root / MANIFEST_REL)
        by_slug = {item["slug"]: item for item in manifest["items"]}
        for item in record["items"]:
            registry = by_slug.get(item["slug"])
            if registry is not None:
                registry["userApproved"] = True
                registry["runtimePromoted"] = True
                registry["status"] = "approved_runtime_promoted"
        manifest["runtimePromotionAllowed"] = True
        _atomic_json(repository_root / MANIFEST_REL, manifest)
        promotion_evidence = _write_runtime_evidence(
            repository_root,
            record,
            plan,
            runtime_results,
        )
        approval_paths = _write_core_item_approvals(
            repository_root,
            promotion_evidence,
        )
        record = create_static_approval_record(
            repository_root / APPROVAL_REL,
            independent_review_path=repository_root / FINAL_REVIEW_REL,
        )
        record["userApproved"] = True
        record["motionGenerated"] = True
        record["runtimePromoted"] = True
        record["status"] = "runtime_promoted_pending_final_simulator"
        record["nextGate"] = "final_ios_simulator_verification"
        record["approvalMessage"] = "onaylıyorum"
        record["runtimePromotionEvidence"] = {
            "verdict": "PASS",
            "evidencePath": RUNTIME_EVIDENCE_REL.as_posix(),
            "evidenceSha256": sha256(repository_root / RUNTIME_EVIDENCE_REL),
            "promotedFileCount": 396,
        }
        record["independentMotionReview"] = {
            "verdict": final_review["verdict"],
            "evidencePath": FINAL_REVIEW_REL.as_posix(),
            "evidenceSha256": sha256(repository_root / FINAL_REVIEW_REL),
            "reviewedItemCount": final_review["reviewedItemCount"],
        }
        _atomic_json(repository_root / APPROVAL_REL, record)
        for path in deletes:
            path.unlink(missing_ok=True)
    except Exception:
        for path, previous in backups.items():
            if previous is None:
                path.unlink(missing_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(previous)
        raise
    return {
        "promotedItems": 66,
        "promotedFiles": len(plan),
        "promotedCandidateManifests": len(changed_manifests),
        "itemApprovalRecords": len(approval_paths),
        "clearedTransparentRgbPixels": sum(
            result["clearedPixelCount"] for result in runtime_results.values()
        ),
        "deletedSupersededFiles": len([p for p in deletes if backups[p] is not None]),
        "deletedPaths": [
            p.relative_to(repository_root).as_posix()
            for p in deletes
            if backups[p] is not None
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    record, states = current_record_and_states(REPO_ROOT)
    plan = build_promotion_plan(REPO_ROOT, record, states)
    errors = validate_promotion_plan(plan)
    if errors:
        raise SystemExit("\n".join(errors))
    if args.promote:
        result = promote(REPO_ROOT)
    else:
        status = _status(REPO_ROOT)
        deletes = legacy_delete_paths(REPO_ROOT, status)
        result = {
            "mode": "dry-run",
            "itemCount": 66,
            "copyCount": len(plan),
            "deleteCount": sum(path.exists() for path in deletes),
            "deletePaths": [
                path.relative_to(REPO_ROOT).as_posix()
                for path in deletes
                if path.exists()
            ],
        }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
