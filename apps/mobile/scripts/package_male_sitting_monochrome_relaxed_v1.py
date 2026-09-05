#!/usr/bin/env python3
"""Package Monochrome Street-Tailoring canonical sitting candidate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from package_male_sitting_mid_blue_straight_v1 import (
    CANVAS, ROOT, SCALE, SHOES, TOP, _keep_largest_component,
    canonical_composite, load,
)
from package_male_sitting_midnight_relaxed_v1 import review_board as relaxed_review_board


EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
MASTER = EVIDENCE / "item-masters/monochrome-street-tailoring-bottom-sitting-master-v1-1024.png"
OUTPUT = EVIDENCE / (
    "candidates/room_avatar_bottom_male_monochrome_street_tailoring_bottom_v1_"
    "sitting_front_f01-candidate-v1.png"
)
COMPOSITE = EVIDENCE / "monochrome-street-tailoring-bottom-canonical-sitting-v1.png"
REVIEW_BOARD = EVIDENCE / "monochrome-street-tailoring-bottom-sitting-v1-review-board.png"
MANIFEST = EVIDENCE / "monochrome-street-tailoring-bottom-sitting-v1-manifest.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 1024x1536 item-specific seated master")
    source = np.asarray(master).copy()
    rows_4x, cols_4x = np.indices(source.shape[:2])
    red, green, blue = (source[..., channel].astype(np.int16) for channel in range(3))
    in_zone = (
        (cols_4x >= 74 * SCALE) & (cols_4x < 182 * SCALE)
        & (rows_4x >= 270 * SCALE) & (rows_4x < 345 * SCALE)
    )
    neutral_dark = (
        (red < 135) & (green < 135) & (blue < 145)
        & (np.abs(red - green) < 28) & (np.abs(green - blue) < 30)
    )
    isolated = np.zeros_like(source)
    isolated[in_zone & neutral_dark] = source[in_zone & neutral_dark]
    registered = np.asarray(
        Image.fromarray(isolated).resize(CANVAS, Image.Resampling.LANCZOS)
    ).copy()
    registered[:283] = 0

    top_alpha = np.asarray(load(TOP))[..., 3]
    hidden_waist_template = registered[294].copy()
    for row in range(283, 288):
        columns = np.where(top_alpha[row] > 24)[0]
        left = max(0, int(columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(columns.max()) + 1)
        registered[row, left : right + 1] = hidden_waist_template[left : right + 1]
        registered[row, :left] = 0
        registered[row, right + 1 :] = 0

    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    shoe_alpha = np.asarray(load(SHOES))[..., 3] > 24
    depth = rows - 329
    contact_rows = (rows >= 329) & (rows <= 333)
    opening = 7 + depth
    left_contact = (cols < 128) & (np.abs(cols - 110) >= opening) & (np.abs(cols - 110) <= 20)
    right_contact = (cols >= 128) & (np.abs(cols - 146) >= opening) & (np.abs(cols - 146) <= 20)
    allowed_contact = contact_rows & (left_contact | right_contact)
    registered[shoe_alpha & ~allowed_contact] = 0
    registered[334:] = 0

    # Cover the base legs through the pelvis with a cloth-colored bridge and
    # one narrow dark tailoring seam; open the true gap only at the shoes.
    for row in range(306, 329):
        samples = np.concatenate((
            registered[row, 122:126, :3].astype(np.float32),
            registered[row, 131:135, :3].astype(np.float32),
        ))
        bridge = np.rint(samples.mean(axis=0) * 0.92)
        registered[row, 126:131, :3] = bridge.astype(np.uint8)
        registered[row, 126:131, 3] = 255
        registered[row, 128, :3] = np.rint(bridge * 0.55).astype(np.uint8)
    registered[329:338, 127:130] = 0
    contact_alpha = registered[..., 3]
    registered[allowed_contact & (contact_alpha >= 220), 3] = 255
    alpha_mask = _keep_largest_component(registered[..., 3] > 24)
    registered[~alpha_mask] = 0
    registered[registered[..., 3] == 0, :3] = 0
    return Image.fromarray(registered)


def review_board(bottom: Image.Image, composite: Image.Image) -> Image.Image:
    board = relaxed_review_board(bottom, composite)
    draw = ImageDraw.Draw(board)
    draw.rectangle((0, 0, 1200, 82), fill="#fff8fc")
    from package_male_sitting_mid_blue_straight_v1 import _font
    draw.text((28, 18), "MONOCHROME STREET TAILORING · SITTING V1", font=_font(28, True), fill="#382c37")
    draw.text((28, 56), "black tailored volume · opaque pelvis seam · runtime promotion closed", font=_font(18), fill="#796976")
    return board


def _write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": "blumi-avatar-bottom-monochrome-street-tailoring-sitting-v1.0",
        "itemId": "monochrome_street_tailoring_bottom",
        "fitFamily": "male_relaxed_tailoring",
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
            "focusedTest": "python3 -m unittest test_package_male_sitting_monochrome_relaxed_v1.py",
        },
        "continuityLocks": {
            "canonicalTop": str(TOP.relative_to(ROOT)), "canonicalShoes": str(SHOES.relative_to(ROOT)),
            "waistTolerancePerSidePx": 1, "contactRows": "329-333",
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
