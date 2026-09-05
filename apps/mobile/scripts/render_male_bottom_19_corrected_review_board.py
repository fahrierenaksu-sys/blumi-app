#!/usr/bin/env python3
"""Render the corrected 19/19 4W+1S board after explicit user rejection."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

import repair_male_bottom_motion_pose_native_v2 as v2
import repair_male_bottom_motion_pose_native_v3 as v3


ROOT = Path(__file__).resolve().parents[3]
OLD_SITTING = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v6"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v7"
OUTPUT = EVIDENCE / "male-bottom-19-corrected-4w1s-review-board.png"
MANIFEST = EVIDENCE / "male-bottom-19-corrected-4w1s-review-manifest.json"
WALK_STATES = v3.WALK_STATES
ALL_STATES = WALK_STATES + ("sitting_front_f01",)
CELL_W, ROW_H, HEADER_H = 230, 354, 92
BOARD_SIZE = (CELL_W * len(ALL_STATES), HEADER_H + ROW_H * len(v2.ITEMS))


OLD_SITTING_NAMES = {
    "charcoal_tapered_chinos": "charcoal-tapered-chinos-canonical-sitting-v9.png",
    "mid_blue_straight_jeans": "mid-blue-straight-jeans-canonical-sitting-v1.png",
    "navy_straight_pants": "navy-straight-pants-canonical-sitting-v1.png",
    "straight_utility_tailored_trousers": "straight-utility-tailored-trousers-canonical-sitting-v1.png",
    "warm_sand_deconstructed_trousers": "warm-sand-deconstructed-trousers-canonical-sitting-v1.png",
    "warm_sand_relaxed_pants": "family-specific-extraction-v1/warm-sand-relaxed-pants-canonical-sitting-v2.png",
    "wide_pleated_technical_trousers": "wide-pleated-technical-trousers-canonical-sitting-v1.png",
    "midnight_relaxed_tailoring_trousers": "midnight-relaxed-tailoring-trousers-canonical-sitting-v1.png",
    "monochrome_street_tailoring_bottom": "monochrome-street-tailoring-bottom-canonical-sitting-v1.png",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk_path(slug: str, state: str) -> Path:
    return v3.EVIDENCE / slug / f"{state}.png"


def sitting_path(slug: str) -> Path:
    if slug in OLD_SITTING_NAMES:
        return OLD_SITTING / OLD_SITTING_NAMES[slug]
    return EVIDENCE / f"{slug.replace('_', '-')}-canonical-sitting-v1.png"


def compose(item: v2.Item, state: str) -> Image.Image:
    if state == "sitting_front_f01":
        return v2._load(sitting_path(item.slug))
    return v2._compose(item, state, v2._load(walk_path(item.slug, state)))


def render_board() -> Image.Image:
    board = Image.new("RGB", BOARD_SIZE, "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), "BLUMI MALE BOTTOMS · CORRECTED 19/19 · 4W+1S", font=v2._font(22, True), fill="#3e2b36")
    draw.text((18, 44), "shoe-aware walking · seated-volume shorts · candidate only · runtime unchanged", font=v2._font(13), fill="#7e6876")
    draw.text((18, 66), "previous 19/19 verdict superseded after user rejection", font=v2._font(12, True), fill="#b33a68")
    for row, item in enumerate(v2.ITEMS):
        row_y = HEADER_H + row * ROW_H
        draw.rectangle((0, row_y, BOARD_SIZE[0], row_y + ROW_H - 1), fill="#fffdfd" if row % 2 == 0 else "#fff8fc")
        draw.text((12, row_y + 8), f"{row + 1:02d}  {item.slug}", font=v2._font(13, True), fill="#3e2b36")
        draw.text((BOARD_SIZE[0] - 118, row_y + 8), item.family.upper(), font=v2._font(11, True), fill="#8b7381")
        for column, state in enumerate(ALL_STATES):
            x = column * CELL_W
            composite = compose(item, state)
            full = composite.resize((116, 174), Image.Resampling.LANCZOS)
            full_bg = v2._checker(full.size)
            full_bg.alpha_composite(full)
            board.paste(full_bg.convert("RGB"), (x + 57, row_y + 39))
            contact = composite.crop((76, 276, 180, 352)).resize((190, 139), Image.Resampling.NEAREST)
            contact_bg = v2._checker(contact.size)
            contact_bg.alpha_composite(contact)
            board.paste(contact_bg.convert("RGB"), (x + 20, row_y + 215))
            label = "SIT 01 · FIXED" if state == "sitting_front_f01" else f"WALK {state[-2:]}"
            draw.text((x + 76, row_y + 218), label, font=v2._font(10, True), fill="#5b4050")
    return board


def produce() -> dict:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    render_board().save(OUTPUT, optimize=True)
    records = []
    for item in v2.ITEMS:
        frames = {state: {"path": walk_path(item.slug, state).relative_to(ROOT).as_posix(), "sha256": sha256(walk_path(item.slug, state))} for state in WALK_STATES}
        sitting = sitting_path(item.slug)
        frames["sitting_front_f01"] = {"path": sitting.relative_to(ROOT).as_posix(), "sha256": sha256(sitting)}
        records.append({"slug": item.slug, "family": item.family, "frames": frames})
    manifest = {
        "schemaVersion": 2,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "scope": "canonical_male_bottom_19_corrected_4w1s_review",
        "status": "candidate_pending_independent_review_and_user_approval",
        "supersedes": "bottom-sitting-on-base-v6/male-bottom-19-final-4w1s-review-manifest.json",
        "runtimePromoted": False,
        "itemCount": len(records),
        "items": records,
        "board": {"path": OUTPUT.relative_to(ROOT).as_posix(), "sha256": sha256(OUTPUT)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
