#!/usr/bin/env python3
"""Package the Charcoal Tapered Chinos canonical sitting candidate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from package_male_sitting_mid_blue_straight_v1 import (
    CANVAS,
    FACE,
    HAIR,
    ROOT,
    ROOM,
    SCALE,
    SHOES,
    TOP,
    _checkerboard,
    _font,
    _keep_largest_component,
    canonical_composite,
    load,
)


EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
MASTER = EVIDENCE / "item-masters/charcoal-tapered-chinos-sitting-master-v1-1024.png"
OUTPUT = EVIDENCE / (
    "candidates/room_avatar_bottom_male_charcoal_tapered_chinos_v1_"
    "sitting_front_f01-candidate-v9.png"
)
COMPOSITE = EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v9.png"
REVIEW_BOARD = EVIDENCE / "charcoal-tapered-chinos-sitting-v9-review-board.png"
MANIFEST = EVIDENCE / "charcoal-tapered-chinos-sitting-v9-manifest.json"
GARMENT_ZONE = (76, 270, 180, 345)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 1024x1536 item-specific seated master")

    source = np.asarray(master).copy()
    rows_4x, cols_4x = np.indices(source.shape[:2])
    red, green, blue = (source[..., channel].astype(np.int16) for channel in range(3))
    charcoal = (
        (cols_4x >= GARMENT_ZONE[0] * SCALE)
        & (cols_4x < GARMENT_ZONE[2] * SCALE)
        & (rows_4x >= GARMENT_ZONE[1] * SCALE)
        & (rows_4x < GARMENT_ZONE[3] * SCALE)
        & (red < 125)
        & (green < 125)
        & (blue < 135)
        & (np.abs(red - green) < 26)
        & (np.abs(green - blue) < 30)
    )
    isolated = np.zeros_like(source)
    isolated[charcoal] = source[charcoal]
    registered = np.asarray(
        Image.fromarray(isolated).resize(CANVAS, Image.Resampling.LANCZOS)
    ).copy()

    # The master tee occludes the top of the waistband. Rebuild only that
    # hidden contact from the first continuous authored chino row.
    top_alpha = np.asarray(load(TOP))[..., 3]
    hidden_waist_template = registered[295].copy()
    for row in range(283, 288):
        top_columns = np.where(top_alpha[row] > 24)[0]
        if not len(top_columns):
            continue
        left = max(0, int(top_columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(top_columns.max()) + 1)
        registered[row, left : right + 1] = hidden_waist_template[left : right + 1]
        registered[row, :left] = 0
        registered[row, right + 1 :] = 0

    # Tapered cuffs touch only the outside quarters of each shoe and retreat
    # on every row. The tongue/laces remain the foreground read.
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    shoe_alpha = np.asarray(load(SHOES))[..., 3] > 24
    depth = rows - 329
    contact_rows = (rows >= 329) & (rows <= 333)
    opening = 9 + depth
    left_contact = (
        (cols < 128)
        & (np.abs(cols - 110) >= opening)
        & (np.abs(cols - 110) <= 18)
    )
    right_contact = (
        (cols >= 128)
        & (np.abs(cols - 146) >= opening)
        & (np.abs(cols - 146) <= 18)
    )
    allowed_contact = contact_rows & (left_contact | right_contact)
    registered[shoe_alpha & ~allowed_contact] = 0
    registered[334:] = 0
    registered[318:338, 128] = 0
    registered[329:338, 127:130] = 0
    contact_alpha = registered[..., 3]
    registered[allowed_contact & (contact_alpha >= 220), 3] = 255

    alpha_mask = _keep_largest_component(registered[..., 3] > 24)
    registered[~alpha_mask] = 0
    registered[registered[..., 3] == 0, :3] = 0
    return Image.fromarray(registered)


def review_board(bottom: Image.Image, composite: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1200, 850), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text(
        (28, 18),
        "CHARCOAL TAPERED CHINOS · SITTING V9 CANDIDATE",
        font=_font(28, True),
        fill="#382c37",
    )
    draw.text(
        (28, 56),
        "item-specific 4x master · tapered contact · runtime promotion closed",
        font=_font(18),
        fill="#796976",
    )
    for x, label, background in (
        (30, "FULL COMPOSITE", "#211b22"),
        (320, "RAW / CHECKER", None),
        (610, "RAW / DARK", "#211b22"),
    ):
        panel = _checkerboard(CANVAS) if background is None else Image.new("RGB", CANVAS, background)
        layer = composite if x == 30 else bottom
        panel.paste(layer, (0, 0), layer)
        board.paste(panel, (x, 120))
        draw.text((x, 92), label, font=_font(18), fill="#382c37")

    waist = composite.crop((88, 278, 168, 312)).resize((400, 170), Image.Resampling.NEAREST)
    contact = composite.crop((84, 321, 172, 350)).resize((528, 174), Image.Resampling.NEAREST)
    board.paste(waist, (30, 590), waist)
    board.paste(contact, (520, 590), contact)
    draw.text((30, 555), "5x WAIST / TAPERED THIGHS", font=_font(18), fill="#382c37")
    draw.text((520, 555), "6x CUFF / SHOE CONTACT", font=_font(18), fill="#382c37")
    return board


def _write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": "blumi-avatar-bottom-charcoal-tapered-chinos-sitting-v9.0",
        "itemId": "charcoal_tapered_chinos",
        "fitFamily": "male_tapered",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "source": {
            "path": str(MASTER.relative_to(ROOT)),
            "sha256": sha256(MASTER),
            "origin": "generated_in_project",
            "toolProvider": "not_provided",
            "modelOrEngine": "not_provided",
            "requestOrJobId": "not_provided",
            "seed": "not_provided",
        },
        "candidate": {
            "path": str(OUTPUT.relative_to(ROOT)),
            "sha256": sha256(OUTPUT),
            "dimensions": "256x384",
            "format": "PNG RGBA",
        },
        "evidence": {
            "compositePath": str(COMPOSITE.relative_to(ROOT)),
            "compositeSha256": sha256(COMPOSITE),
            "reviewBoardPath": str(REVIEW_BOARD.relative_to(ROOT)),
            "reviewBoardSha256": sha256(REVIEW_BOARD),
            "focusedTest": "python3 -m unittest test_package_male_sitting_charcoal_tapered_v1.py",
        },
        "continuityLocks": {
            "canonicalTop": str(TOP.relative_to(ROOT)),
            "canonicalShoes": str(SHOES.relative_to(ROOT)),
            "waistTolerancePerSidePx": 1,
            "contactRows": "329-333",
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
