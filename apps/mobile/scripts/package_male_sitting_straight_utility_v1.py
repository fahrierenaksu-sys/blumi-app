#!/usr/bin/env python3
"""Package Straight Utility-Tailored Trousers canonical sitting candidate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from package_male_sitting_mid_blue_straight_v1 import (
    CANVAS,
    ROOT,
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
MASTER = EVIDENCE / "item-masters/straight-utility-tailored-trousers-sitting-master-v1-1024.png"
OUTPUT = EVIDENCE / (
    "candidates/room_avatar_bottom_male_straight_utility_tailored_trousers_v1_"
    "sitting_front_f01-candidate-v1.png"
)
COMPOSITE = EVIDENCE / "straight-utility-tailored-trousers-canonical-sitting-v1.png"
REVIEW_BOARD = EVIDENCE / "straight-utility-tailored-trousers-sitting-v1-review-board.png"
MANIFEST = EVIDENCE / "straight-utility-tailored-trousers-sitting-v1-manifest.json"
GARMENT_ZONE = (76, 270, 180, 345)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 1024x1536 item-specific seated master")

    source = np.asarray(master).copy()
    rows_4x, cols_4x = np.indices(source.shape[:2])
    red, green, blue = (source[..., channel].astype(np.int16) for channel in range(3))
    in_zone = (
        (cols_4x >= GARMENT_ZONE[0] * SCALE)
        & (cols_4x < GARMENT_ZONE[2] * SCALE)
        & (rows_4x >= GARMENT_ZONE[1] * SCALE)
        & (rows_4x < GARMENT_ZONE[3] * SCALE)
    )
    dark_or_mid = (red < 185) & (green < 185) & (blue < 190)
    skin = (red > 165) & (red > green + 22) & (green > blue - 10)
    tee_blue = (blue > red + 20) & (blue > green + 4)
    shoe_beige = (red > 145) & (green > 115) & (blue < green + 8)
    utility = in_zone & dark_or_mid & ~skin & ~tee_blue & ~shoe_beige

    isolated = np.zeros_like(source)
    isolated[utility] = source[utility]
    registered = np.asarray(
        Image.fromarray(isolated).resize(CANVAS, Image.Resampling.LANCZOS)
    ).copy()
    registered[:283] = 0

    top_alpha = np.asarray(load(TOP))[..., 3]
    hidden_waist_template = registered[294].copy()
    for row in range(283, 288):
        top_columns = np.where(top_alpha[row] > 24)[0]
        if not len(top_columns):
            continue
        left = max(0, int(top_columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(top_columns.max()) + 1)
        registered[row, left : right + 1] = hidden_waist_template[left : right + 1]
        registered[row, :left] = 0
        registered[row, right + 1 :] = 0

    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    rgb = registered[..., :3].astype(np.int16)
    warm_side_fragment = (
        (rows >= 288)
        & (rows <= 300)
        & ((cols < 100) | (cols > 155))
        & (rgb[..., 0] > 120)
        & (rgb[..., 0] > rgb[..., 1] + 18)
    )
    registered[warm_side_fragment] = 0

    shoe_alpha = np.asarray(load(SHOES))[..., 3] > 24
    depth = rows - 329
    contact_rows = (rows >= 329) & (rows <= 333)
    opening = 8 + depth
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
        "STRAIGHT UTILITY-TAILORED TROUSERS · SITTING V1",
        font=_font(28, True),
        fill="#382c37",
    )
    draw.text(
        (28, 56),
        "item-specific pockets · straight hem contact · runtime promotion closed",
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
    waist = composite.crop((86, 278, 170, 315)).resize((420, 185), Image.Resampling.NEAREST)
    contact = composite.crop((84, 321, 172, 350)).resize((528, 174), Image.Resampling.NEAREST)
    board.paste(waist, (30, 585), waist)
    board.paste(contact, (540, 590), contact)
    draw.text((30, 550), "5x WAIST / UTILITY POCKETS", font=_font(18), fill="#382c37")
    draw.text((540, 555), "6x HEM / SHOE CONTACT", font=_font(18), fill="#382c37")
    return board


def _write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": "blumi-avatar-bottom-straight-utility-tailored-trousers-sitting-v1.0",
        "itemId": "straight_utility_tailored_trousers",
        "fitFamily": "male_straight_utility",
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
            "focusedTest": "python3 -m unittest test_package_male_sitting_straight_utility_v1.py",
        },
        "continuityLocks": {
            "canonicalTop": str(TOP.relative_to(ROOT)),
            "canonicalShoes": str(SHOES.relative_to(ROOT)),
            "waistTolerancePerSidePx": 1,
            "contactRows": "329-333",
            "utilityPocketRetention": True,
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
