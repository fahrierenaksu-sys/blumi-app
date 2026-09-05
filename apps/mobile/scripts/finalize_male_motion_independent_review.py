#!/usr/bin/env python3
"""Bind an independent PASS review to candidate motion manifests only."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
REVIEW = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/motion-refresh-v1/male-wardrobe-48-motion-independent-review-v2.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def finalize(review_path: Path = REVIEW) -> dict:
    review = json.loads(review_path.read_text(encoding="utf-8"))
    if review.get("verdict") != "PASS" or not review.get("items"):
        raise ValueError("motion review must be a non-empty PASS review")
    failures = [item for item in review["items"] if item.get("verdict") != "PASS"]
    if failures:
        raise ValueError(f"motion review contains failures: {len(failures)}")

    updated = []
    for item in review["items"]:
        board_path = REPO_ROOT / item["boardPath"]
        manifest_path = board_path.parent / "motion-manifest.json"
        if not manifest_path.is_file():
            raise FileNotFoundError(manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("itemId") != item["itemId"]:
            raise ValueError(f"manifest/item mismatch: {manifest_path}")
        next_manifest = {
            **manifest,
            "independentReviewVerdict": "PASS",
            "independentReviewPass": True,
            "independentReviewEvidence": {
                "path": review_path.relative_to(REPO_ROOT).as_posix(),
                "sha256": sha256(review_path),
            },
        }
        # Explicit approval and runtime promotion are intentionally untouched.
        if next_manifest.get("explicitUserApproval") is True:
            raise ValueError(f"review finalizer cannot alter approved item: {manifest_path}")
        manifest_path.write_text(json.dumps(next_manifest, indent=2) + "\n", encoding="utf-8")
        updated.append(manifest_path.relative_to(REPO_ROOT).as_posix())
    return {
        "verdict": "PASS",
        "reviewedItemCount": len(review["items"]),
        "updatedManifestCount": len(updated),
        "runtimePromoted": False,
        "explicitUserApprovalChanged": False,
        "manifests": updated,
    }


if __name__ == "__main__":
    print(json.dumps(finalize(), indent=2))
