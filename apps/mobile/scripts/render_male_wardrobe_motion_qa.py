#!/usr/bin/env python3
"""Render dated full-avatar contact sheets for the corrected male motion layers."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUTPUT = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-22"
CANVAS = (256, 384)
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size)
    except OSError:
        return ImageFont.load_default()


def full_avatar(category: str, slug: str, state: str) -> Image.Image:
    pose = lambda name: load(MOTION / f"room_avatar_{name}_v1_{state}.png")
    layers = [
        pose("base_male_light"),
        load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        pose(f"shoes_male_{slug}" if category == "shoes" else "shoes_male_milk_tea_court"),
        pose(f"bottom_male_{slug}" if category == "bottom" else "bottom_male_navy_straight_pants"),
        pose(f"top_male_{slug}" if category == "top" else "top_male_powder_blue_crew_tee"),
        load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    ]
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result.alpha_composite(layer)
    return result


def items(category: str) -> list[str]:
    prefix = f"avatar_room_{category}_male_"
    return sorted(
        path.stem.removeprefix(prefix).removesuffix("_v1")
        for path in ROOM.glob(f"{prefix}*.png")
    )


def render_category(category: str) -> Path:
    slugs = items(category)
    tile_w, tile_h = 166, 260
    columns = 5
    rows = (len(slugs) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, 68 + rows * tile_h), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), f"MALE {category.upper()} · 4W+1S FIT QA", font=font(17, True), fill=(69, 43, 57))
    draw.text((18, 40), "Static-master anchored motion · front view · 256×384 source", font=font(11), fill=(126, 104, 116))
    for index, slug in enumerate(slugs):
        x = (index % columns) * tile_w
        y = 68 + (index // columns) * tile_h
        panel = Image.new("RGB", (tile_w, tile_h), (255, 255, 255))
        for frame_index, state in enumerate(STATES):
            avatar = full_avatar(category, slug, state).resize((46, 69), Image.Resampling.NEAREST)
            panel.paste(avatar, (8 + frame_index * 30, 8), avatar)
        panel_draw = ImageDraw.Draw(panel)
        panel_draw.text((8, 82), slug.replace("_", " ")[:25], font=font(10, True), fill=(69, 43, 57))
        panel_draw.text((8, 100), "W1 W2 W3 W4 S1", font=font(9), fill=(38, 142, 102))
        sheet.paste(panel, (x, y))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / f"male-{category}-motion-contact-sheet.png"
    sheet.save(path, optimize=True)
    return path


if __name__ == "__main__":
    for category in ("top", "bottom", "shoes"):
        print(render_category(category))
