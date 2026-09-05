#!/usr/bin/env python3
"""Render one candidate-only 4W+1S overview for the live 54 catalog items."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUTPUT = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/motion-refresh-v1/male-wardrobe-54-motion-candidate-overview-v5.png"
STATES = ("static", "walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")
MOTION_STATES = STATES[1:]


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(
            f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}",
            size,
        )
    except OSError:
        return ImageFont.load_default()


def checker(size: tuple[int, int]) -> Image.Image:
    out = Image.new("RGBA", size, (248, 246, 248, 255))
    draw = ImageDraw.Draw(out)
    for y in range(0, size[1], 8):
        for x in range(0, size[0], 8):
            if (x // 8 + y // 8) % 2:
                draw.rectangle((x, y, x + 7, y + 7), fill=(228, 224, 228, 255))
    return out


def pose(name: str, state: str) -> Image.Image:
    if state == "static":
        return load(ROOM / f"avatar_room_{name}_v1.png")
    return load(MOTION / f"room_avatar_{name}_v1_{state}.png")


def status_items() -> list[dict]:
    result = subprocess.run(
        ["node", str(REPO_ROOT / "apps/mobile/scripts/male-wardrobe-redesign-status.mjs")],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [item for item in json.loads(result.stdout)["items"] if item["category"] in {"top", "bottom", "shoes"}]


def candidate_frame(item: dict, state: str) -> Image.Image:
    evidence = item["states"][state]
    return load(REPO_ROOT / evidence["path"])


def compose(item: dict, state: str) -> Image.Image:
    result = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    result.alpha_composite(pose("base_male_light", state))
    result.alpha_composite(load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"))
    if item["category"] == "top":
        result.alpha_composite(pose("bottom_male_navy_straight_pants", state))
        result.alpha_composite(pose("shoes_male_milk_tea_court", state))
    elif item["category"] == "bottom":
        result.alpha_composite(pose("top_male_powder_blue_crew_tee", state))
        result.alpha_composite(pose("shoes_male_milk_tea_court", state))
    else:
        result.alpha_composite(pose("bottom_male_navy_straight_pants", state))
        result.alpha_composite(pose("top_male_powder_blue_crew_tee", state))
    result.alpha_composite(candidate_frame(item, state))
    result.alpha_composite(load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    return result


def render() -> Path:
    items = sorted(status_items(), key=lambda item: (item["category"], item["slug"]))
    if len(items) != 54:
        raise ValueError(f"expected 54 live top/bottom/shoes items, received {len(items)}")
    columns, tile_w, tile_h = 6, 220, 292
    rows = (len(items) + columns - 1) // columns
    board = Image.new("RGBA", (columns * tile_w, 68 + rows * tile_h), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    draw.text((16, 14), "BLUMI MALE 54 · CANDIDATE 4W+1S OVERVIEW", font=font(19, True), fill=(69, 43, 57))
    draw.text((16, 41), "static · walking f01–f04 · sitting f01 · candidate-only; no runtime promotion", font=font(11), fill=(126, 104, 116))
    for index, item in enumerate(items):
        x, y = (index % columns) * tile_w, 68 + (index // columns) * tile_h
        draw.text((x + 10, y + 5), item["slug"], font=font(10, True), fill=(69, 43, 57))
        for col, state in enumerate(STATES):
            avatar = compose(item, state).resize((48, 72), Image.Resampling.NEAREST)
            cell = checker(avatar.size)
            cell.alpha_composite(avatar)
            board.alpha_composite(cell, (x + 6 + col * 36, y + 28))
        draw.text((x + 10, y + 107), "S W1 W2 W3 W4 S1", font=font(9), fill=(38, 142, 102))
        draw.text((x + 10, y + 126), item["status"], font=font(8), fill=(126, 104, 116))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(OUTPUT, optimize=True)
    return OUTPUT


if __name__ == "__main__":
    print(render())
