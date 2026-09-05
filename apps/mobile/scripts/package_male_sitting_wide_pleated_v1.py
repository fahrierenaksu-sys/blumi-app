#!/usr/bin/env python3
"""Package Wide Pleated Technical Trousers sitting candidate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

import package_male_sitting_monochrome_relaxed_v1 as family
from package_male_sitting_mid_blue_straight_v1 import ROOT, SHOES, TOP, _font, canonical_composite, load


EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
MASTER = EVIDENCE / "item-masters/wide-pleated-technical-trousers-sitting-master-v1-1024.png"
OUTPUT = EVIDENCE / (
    "candidates/room_avatar_bottom_male_wide_pleated_technical_trousers_v1_"
    "sitting_front_f01-candidate-v1.png"
)
COMPOSITE = EVIDENCE / "wide-pleated-technical-trousers-canonical-sitting-v1.png"
REVIEW_BOARD = EVIDENCE / "wide-pleated-technical-trousers-sitting-v1-review-board.png"
MANIFEST = EVIDENCE / "wide-pleated-technical-trousers-sitting-v1-manifest.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_bottom(master: Image.Image) -> Image.Image:
    # Shared family mechanics only; all pixels and volume still come from this
    # item's own on-base pleated master rather than a borrowed silhouette mask.
    return family.extract_bottom(master)


def review_board(bottom: Image.Image, composite: Image.Image) -> Image.Image:
    board = family.review_board(bottom, composite)
    draw = ImageDraw.Draw(board)
    draw.rectangle((0, 0, 1200, 82), fill="#fff8fc")
    draw.text((28, 18), "WIDE PLEATED TECHNICAL TROUSERS · SITTING V1", font=_font(28, True), fill="#382c37")
    draw.text((28, 56), "item-specific pleated master · wide volume · runtime promotion closed", font=_font(18), fill="#796976")
    return board


def _write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": "blumi-avatar-bottom-wide-pleated-technical-trousers-sitting-v1.0",
        "itemId": "wide_pleated_technical_trousers",
        "fitFamily": "male_wide_pleated",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "source": {
            "path": str(MASTER.relative_to(ROOT)), "sha256": sha256(MASTER),
            "origin": "generated_in_project", "toolProvider": "not_provided",
            "modelOrEngine": "not_provided", "requestOrJobId": "not_provided", "seed": "not_provided",
        },
        "candidate": {
            "path": str(OUTPUT.relative_to(ROOT)), "sha256": sha256(OUTPUT),
            "dimensions": "256x384", "format": "PNG RGBA",
        },
        "evidence": {
            "compositePath": str(COMPOSITE.relative_to(ROOT)), "compositeSha256": sha256(COMPOSITE),
            "reviewBoardPath": str(REVIEW_BOARD.relative_to(ROOT)), "reviewBoardSha256": sha256(REVIEW_BOARD),
            "focusedTest": "python3 -m unittest test_package_male_sitting_wide_pleated_v1.py",
        },
        "continuityLocks": {
            "canonicalTop": str(TOP.relative_to(ROOT)), "canonicalShoes": str(SHOES.relative_to(ROOT)),
            "waistTolerancePerSidePx": 1, "contactRows": "329-333",
            "itemSpecificMasterRequired": True,
        },
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def produce() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bottom = extract_bottom(load(MASTER))
    bottom.save(OUTPUT, optimize=True)
    composite = canonical_composite(bottom)
    composite.save(COMPOSITE, optimize=True)
    review_board(bottom, composite).save(REVIEW_BOARD, optimize=True)
    _write_manifest()


if __name__ == "__main__":
    produce()
