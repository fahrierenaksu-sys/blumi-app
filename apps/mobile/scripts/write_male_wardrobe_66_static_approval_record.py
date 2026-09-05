#!/usr/bin/env python3
"""Bind the reviewed 66-item male wardrobe board to exact candidate hashes.

The record deliberately keeps user approval, motion generation, and runtime
promotion closed. It is the hand-off boundary between independent static review
and the user's explicit approval.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image

from render_male_wardrobe_66_progress_board import (
    BOARD_SIZE,
    DEFAULT_CATALOG,
    DEFAULT_MANIFEST,
    DEFAULT_OUTPUT,
    DEFAULT_SELECTION,
    EXPECTED_COUNTS,
    REPO_ROOT,
    resolve_authoritative_items,
)


DEFAULT_BOARD = DEFAULT_OUTPUT
DEFAULT_RECORD = DEFAULT_BOARD.with_name(
    "male-wardrobe-66-static-approval-record.json"
)
DEFAULT_INDEPENDENT_REVIEW = DEFAULT_BOARD.with_name(
    "male-wardrobe-66-independent-static-review-v3.json"
)
BOTTOM_CLOSEUP_BOARD = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
    "candidates/bottom/male-bottom-four-repair-review-v5.png"
)
REQUIRED_REVIEW_GATES = (
    "exact66IdentitySet",
    "canonicalBaseConsistency",
    "topFit",
    "bottomWaistCrotchHemShoeFit",
    "shoes",
    "hairHeadFit",
    "accessoryLayerOrder",
    "alphaHaloQuality",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()


def _display_path(path: Path) -> str:
    try:
        return _relative(path)
    except ValueError:
        return path.resolve().as_posix()


def _load_independent_review(
    path: Path,
    *,
    board_sha256: str,
    selection_sha256: str,
    item_count: int,
) -> dict:
    if not path.is_file():
        raise FileNotFoundError(
            f"independent static review evidence is missing: {path}"
        )
    review = json.loads(path.read_text(encoding="utf-8"))
    if review.get("schemaVersion") != 1:
        raise ValueError("independent static review schemaVersion must be 1")
    if review.get("verdict") != "PASS":
        raise ValueError("independent static review verdict must be PASS")
    if review.get("boardSha256") != board_sha256:
        raise ValueError("independent static review board hash does not match")
    if review.get("selectionSha256") != selection_sha256:
        raise ValueError("independent static review selection hash does not match")
    if review.get("reviewedItemCount") != item_count:
        raise ValueError("independent static review item count does not match")
    gates = review.get("gates")
    if not isinstance(gates, dict):
        raise ValueError("independent static review gates must be an object")
    if any(gates.get(gate) != "PASS" for gate in REQUIRED_REVIEW_GATES):
        raise ValueError("all independent static review gates must be PASS")
    return review


def create_static_approval_record(
    output_path: Path,
    *,
    independent_review_path: Path = DEFAULT_INDEPENDENT_REVIEW,
) -> dict:
    items = resolve_authoritative_items(
        repository_root=REPO_ROOT,
        catalog_path=DEFAULT_CATALOG,
        manifest_path=DEFAULT_MANIFEST,
        selection_path=DEFAULT_SELECTION,
    )
    with Image.open(DEFAULT_BOARD) as opened:
        opened.load()
        if opened.size != BOARD_SIZE or opened.mode != "RGB":
            raise ValueError(
                "66-item board must be the reviewed 3520x2712 RGB artifact"
            )
    if not BOTTOM_CLOSEUP_BOARD.is_file():
        raise FileNotFoundError(BOTTOM_CLOSEUP_BOARD)

    board_sha256 = _sha256(DEFAULT_BOARD)
    selection_sha256 = _sha256(DEFAULT_SELECTION)
    independent_review = _load_independent_review(
        independent_review_path,
        board_sha256=board_sha256,
        selection_sha256=selection_sha256,
        item_count=len(items),
    )
    category_counts = {
        category: sum(item.category == category for item in items)
        for category in EXPECTED_COUNTS
    }
    if category_counts != EXPECTED_COUNTS:
        raise ValueError(f"unexpected category counts: {category_counts}")

    snapshot_inputs = {
        "board": board_sha256,
        "selection": selection_sha256,
        "catalog": _sha256(DEFAULT_CATALOG),
        "candidateManifest": _sha256(DEFAULT_MANIFEST),
        "independentReview": _sha256(independent_review_path),
        "items": [
            {
                "slug": item.slug,
                "layerSha256": _sha256(item.layer_path),
            }
            for item in items
        ],
    }
    workspace_snapshot_sha256 = hashlib.sha256(
        json.dumps(
            snapshot_inputs,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    record = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "scope": "canonical male base, candidate-only static wardrobe review",
        "status": "independent_review_pass_pending_explicit_user_approval",
        "workspaceSnapshotSha256": workspace_snapshot_sha256,
        "itemCount": len(items),
        "categoryCounts": category_counts,
        "canonicalBase": (
            "apps/mobile/src/features/avatarV2/assets/room/"
            "avatar_room_base_male_light_v1.png"
        ),
        "board": {
            "path": _relative(DEFAULT_BOARD),
            "sha256": board_sha256,
            "size": list(BOARD_SIZE),
        },
        "bottomCloseupBoard": {
            "path": _relative(BOTTOM_CLOSEUP_BOARD),
            "sha256": _sha256(BOTTOM_CLOSEUP_BOARD),
        },
        "contracts": {
            "catalog": {
                "path": _relative(DEFAULT_CATALOG),
                "sha256": _sha256(DEFAULT_CATALOG),
            },
            "candidateManifest": {
                "path": _relative(DEFAULT_MANIFEST),
                "sha256": _sha256(DEFAULT_MANIFEST),
            },
            "selection": {
                "path": _relative(DEFAULT_SELECTION),
                "sha256": selection_sha256,
            },
        },
        "independentStaticReview": {
            "verdict": "PASS",
            "reviewedOn": independent_review.get(
                "reviewedOn",
                date.today().isoformat(),
            ),
            "evidencePath": _display_path(independent_review_path),
            "evidenceSha256": _sha256(independent_review_path),
            "gates": {
                gate: independent_review["gates"][gate]
                for gate in REQUIRED_REVIEW_GATES
            },
        },
        "items": [
            {
                "ordinal": item.ordinal,
                "category": item.category,
                "role": item.role,
                "family": item.family,
                "slug": item.slug,
                "shoeContactRole": item.shoe_contact_role,
                "layerPath": _relative(item.layer_path),
                "layerSha256": _sha256(item.layer_path),
            }
            for item in items
        ],
        "userApproved": False,
        "motionGenerated": False,
        "runtimePromoted": False,
        "nextGate": "explicit_user_static_approval",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return record


def main() -> None:
    record = create_static_approval_record(DEFAULT_RECORD)
    print(
        json.dumps(
            {
                "status": record["status"],
                "itemCount": record["itemCount"],
                "boardSha256": record["board"]["sha256"],
                "output": _relative(DEFAULT_RECORD),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
