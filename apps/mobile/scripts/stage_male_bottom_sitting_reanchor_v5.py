#!/usr/bin/env python3
"""Stage clean seated-bottom candidates by preserving each approved static fit."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-reanchor-v5"
BOARD = EVIDENCE / "male-bottom-sitting-reanchor-v5-review-board.png"
CLOSEUPS = EVIDENCE / "male-bottom-sitting-reanchor-v5-contact-board.png"
MANIFEST = EVIDENCE / "manifest.json"
CANVAS = (256, 384)
SLUGS = (
    "charcoal_tapered_chinos", "mid_blue_straight_jeans", "navy_straight_pants",
    "straight_utility_tailored_trousers", "warm_sand_deconstructed_trousers",
    "warm_sand_relaxed_pants", "wide_pleated_technical_trousers",
    "midnight_relaxed_tailoring_trousers", "monochrome_street_tailoring_bottom",
    "contemporary_resort_street_bottom", "washed_baggy_denim", "creative_utility_bottom",
    "modern_track_luxury_bottom", "soft_parachute_cargo_pants", "colorblock_nylon_track_pants",
    "sage_cuffed_shorts", "relaxed_tailored_shorts", "refined_utility_cargo_shorts",
    "technical_sport_shorts",
)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def static_layer(slug: str) -> Image.Image:
    """The seated candidate has no pose warp: only the approved garment pixels."""
    layer = load(ROOM / f"avatar_room_bottom_male_{slug}_v1.png")
    if slug != "washed_baggy_denim":
        return layer
    # This source has isolated cyan/green pixels at alpha 1–32 on the outer
    # hems. They become visible as a coloured halo on a checkerboard. Removing
    # only that transparent fringe preserves the approved denim silhouette.
    cleaned = [
        (0, 0, 0, 0) if 0 < alpha < 36 else (red, green, blue, alpha)
        for red, green, blue, alpha in layer.getdata()
    ]
    layer.putdata(cleaned)
    return layer


def composite(layer: Image.Image) -> Image.Image:
    layers = (
        MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        layer,
        MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
        MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for entry in layers:
        result.alpha_composite(entry if isinstance(entry, Image.Image) else load(entry))
    return result


def checker(size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", size, "#fffafd")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, x + 11, y + 11), fill="#ece7eb")
    return result


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        suffix = "Arial Bold.ttf" if bold else "Arial.ttf"
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{suffix}", size)
    except OSError:
        return ImageFont.load_default()


def render_board(frames: dict[str, Image.Image], path: Path, *, closeups: bool) -> None:
    columns, tile_w, tile_h = 5, 224, 232
    rows = (len(SLUGS) + columns - 1) // columns
    board = Image.new("RGB", (columns * tile_w, 72 + rows * tile_h), "#fff9fc")
    draw = ImageDraw.Draw(board)
    title = "BLUMI MALE BOTTOMS · SITTING V5 · 4× CONTACT" if closeups else "BLUMI MALE BOTTOMS · SITTING V5 · FULL BODY"
    draw.text((22, 18), title, font=font(18, True), fill="#412c39")
    draw.text((22, 44), "Static-fit re-anchor: no deformation, no center fill, shoes layered above hems · candidate only", font=font(11), fill="#856d7a")
    for index, slug in enumerate(SLUGS):
        x = (index % columns) * tile_w
        y = 72 + (index // columns) * tile_h
        image = frames[slug]
        if closeups:
            image = image.crop((64, 264, 192, 354)).resize((192, 135), Image.Resampling.NEAREST)
            px, py = x + 16, y + 25
        else:
            image = image.resize((128, 192), Image.Resampling.NEAREST)
            px, py = x + 48, y + 18
        backdrop = checker(image.size)
        backdrop.alpha_composite(image)
        board.paste(backdrop.convert("RGB"), (px, py))
        draw.text((x + 12, y + 183 if closeups else y + 210), slug.replace("_", " ")[:31], font=font(10, True), fill="#412c39")
    board.save(path, optimize=True)


def produce() -> dict[str, str]:
    candidate_dir = EVIDENCE / "candidates"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    frames: dict[str, Image.Image] = {}
    outputs: dict[str, str] = {}
    for slug in SLUGS:
        layer = static_layer(slug)
        destination = candidate_dir / f"room_avatar_bottom_male_{slug}_v1_sitting_front_f01.png"
        layer.save(destination, optimize=True)
        frames[slug] = composite(layer)
        outputs[slug] = destination.relative_to(ROOT).as_posix()
    render_board(frames, BOARD, closeups=False)
    render_board(frames, CLOSEUPS, closeups=True)
    MANIFEST.write_text(json.dumps({
        "status": "candidate_only_pending_visual_review",
        "runtimePromoted": False,
        "method": "approved_static_fit_reanchored_on_canonical_sitting_base_without_warp",
        "items": outputs,
        "reviewBoard": BOARD.relative_to(ROOT).as_posix(),
        "contactBoard": CLOSEUPS.relative_to(ROOT).as_posix(),
    }, indent=2) + "\n", encoding="utf-8")
    return outputs


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
