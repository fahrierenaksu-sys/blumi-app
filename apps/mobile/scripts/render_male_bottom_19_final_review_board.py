#!/usr/bin/env python3
"""Render one hash-bound 19/19 male-bottom 4W+1S approval board.

Walking evidence stays bound to the previously approved pose-native V2 files.
Sitting cells use the newest item-specific canonical composites.  This script
writes documentation evidence only; it never changes runtime wardrobe assets.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

from repair_male_bottom_motion_pose_native_v2 import (
    CANVAS,
    EVIDENCE as WALK_EVIDENCE,
    ITEMS,
    _checker,
    _compose,
    _font,
    _load,
)


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
OUTPUT = EVIDENCE / "male-bottom-19-final-4w1s-review-board.png"
MANIFEST = EVIDENCE / "male-bottom-19-final-4w1s-review-manifest.json"
WALK_STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
)
ALL_STATES = WALK_STATES + ("sitting_front_f01",)
CELL_W = 230
ROW_H = 354
HEADER_H = 82
BOARD_SIZE = (CELL_W * len(ALL_STATES), HEADER_H + ROW_H * len(ITEMS))


SITTING_COMPOSITES = {
    "charcoal_tapered_chinos": EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v9.png",
    "mid_blue_straight_jeans": EVIDENCE / "mid-blue-straight-jeans-canonical-sitting-v1.png",
    "navy_straight_pants": EVIDENCE / "navy-straight-pants-canonical-sitting-v1.png",
    "straight_utility_tailored_trousers": EVIDENCE / "straight-utility-tailored-trousers-canonical-sitting-v1.png",
    "warm_sand_deconstructed_trousers": EVIDENCE / "warm-sand-deconstructed-trousers-canonical-sitting-v1.png",
    "warm_sand_relaxed_pants": EVIDENCE / "family-specific-extraction-v1/warm-sand-relaxed-pants-canonical-sitting-v2.png",
    "wide_pleated_technical_trousers": EVIDENCE / "wide-pleated-technical-trousers-canonical-sitting-v1.png",
    "midnight_relaxed_tailoring_trousers": EVIDENCE / "midnight-relaxed-tailoring-trousers-canonical-sitting-v1.png",
    "monochrome_street_tailoring_bottom": EVIDENCE / "monochrome-street-tailoring-bottom-canonical-sitting-v1.png",
    "contemporary_resort_street_bottom": EVIDENCE / "contemporary-resort-street-bottom-canonical-sitting-v1.png",
    "washed_baggy_denim": EVIDENCE / "washed-baggy-denim-canonical-sitting-v1.png",
    "creative_utility_bottom": EVIDENCE / "creative-utility-bottom-canonical-sitting-v1.png",
    "modern_track_luxury_bottom": EVIDENCE / "modern-track-luxury-bottom-canonical-sitting-v1.png",
    "soft_parachute_cargo_pants": EVIDENCE / "soft-parachute-cargo-pants-canonical-sitting-v1.png",
    "colorblock_nylon_track_pants": EVIDENCE / "colorblock-nylon-track-pants-canonical-sitting-v1.png",
    "sage_cuffed_shorts": EVIDENCE / "sage-cuffed-shorts-canonical-sitting-v1.png",
    "relaxed_tailored_shorts": EVIDENCE / "relaxed-tailored-shorts-canonical-sitting-v1.png",
    "refined_utility_cargo_shorts": EVIDENCE / "refined-utility-cargo-shorts-canonical-sitting-v1.png",
    "technical_sport_shorts": EVIDENCE / "technical-sport-shorts-canonical-sitting-v1.png",
}


def load(path: Path) -> Image.Image:
    return _load(path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walking_layer(slug: str, state: str) -> Path:
    if state not in WALK_STATES:
        raise ValueError(f"unsupported walking state: {state}")
    return WALK_EVIDENCE / slug / f"{state}.png"


def sitting_composite(slug: str) -> Path:
    return SITTING_COMPOSITES[slug]


def full_composite(item, state: str) -> Image.Image:
    if state == "sitting_front_f01":
        return load(sitting_composite(item.slug))
    return _compose(item, state, load(walking_layer(item.slug, state)))


def _state_label(state: str) -> str:
    return {
        "walking_front_f01": "WALK 01",
        "walking_front_f02": "WALK 02",
        "walking_front_f03": "WALK 03",
        "walking_front_f04": "WALK 04",
        "sitting_front_f01": "SIT 01 · NEW",
    }[state]


def render_board() -> Image.Image:
    board = Image.new("RGB", BOARD_SIZE, "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((18, 14), "BLUMI MALE BOTTOMS · FINAL 19/19 · 4W+1S", font=_font(22, True), fill="#3e2b36")
    draw.text((18, 46), "one canonical male base · item-specific sitting masters · candidate evidence · runtime unchanged", font=_font(13), fill="#7e6876")

    for row, item in enumerate(ITEMS):
        row_y = HEADER_H + row * ROW_H
        draw.rectangle((0, row_y, BOARD_SIZE[0], row_y + ROW_H - 1), fill="#fffdfd" if row % 2 == 0 else "#fff8fc")
        draw.text((12, row_y + 8), f"{row + 1:02d}  {item.slug}", font=_font(13, True), fill="#3e2b36")
        draw.text((BOARD_SIZE[0] - 118, row_y + 8), item.family.upper(), font=_font(11, True), fill="#8b7381")
        for column, state in enumerate(ALL_STATES):
            x = column * CELL_W
            composite = full_composite(item, state)

            full = composite.resize((116, 174), Image.Resampling.LANCZOS)
            full_bg = _checker(full.size)
            full_bg.alpha_composite(full)
            board.paste(full_bg.convert("RGB"), (x + 57, row_y + 39))

            contact = composite.crop((76, 276, 180, 352)).resize((190, 139), Image.Resampling.NEAREST)
            contact_bg = _checker(contact.size)
            contact_bg.alpha_composite(contact)
            board.paste(contact_bg.convert("RGB"), (x + 20, row_y + 215))
            draw.text((x + 79, row_y + 218), _state_label(state), font=_font(10, True), fill="#5b4050")
    return board


def produce() -> dict:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    board = render_board()
    board.save(OUTPUT, optimize=True)
    records = []
    for item in ITEMS:
        frames = {
            state: {
                "path": walking_layer(item.slug, state).relative_to(ROOT).as_posix(),
                "sha256": sha256(walking_layer(item.slug, state)),
            }
            for state in WALK_STATES
        }
        sitting = sitting_composite(item.slug)
        frames["sitting_front_f01"] = {
            "path": sitting.relative_to(ROOT).as_posix(),
            "sha256": sha256(sitting),
        }
        records.append({"slug": item.slug, "family": item.family, "frames": frames})
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "scope": "canonical_male_bottom_19_final_4w1s_review",
        "status": "candidate_pending_final_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "itemCount": len(records),
        "states": list(ALL_STATES),
        "items": records,
        "board": {"path": OUTPUT.relative_to(ROOT).as_posix(), "sha256": sha256(OUTPUT)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
