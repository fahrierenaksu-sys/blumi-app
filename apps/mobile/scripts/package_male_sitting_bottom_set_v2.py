#!/usr/bin/env python3
"""Package candidate-only seated bottom layers from item-specific on-base masters."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v6"
MASTER_DIR = EVIDENCE / "item-masters"
OUTPUT_DIR = EVIDENCE / "candidates/set-v2"
COMPOSITE_DIR = EVIDENCE / "composites/set-v2"
BOARD = EVIDENCE / "male-bottom-sitting-canonical-candidate-board-v2.png"
CANVAS = (256, 384)
SCALE = 4
ZONE = (74, 279, 182, 341)


class Item:
    def __init__(self, key: str, is_short: bool = False, master_version: int = 1) -> None:
        self.key = key
        self.is_short = is_short
        self.master_version = master_version

    @property
    def master(self) -> Path:
        return MASTER_DIR / f"{self.key}-sitting-master-v{self.master_version}-1024.png"


ITEMS = (
    Item("charcoal-tapered-chinos"),
    Item("mid-blue-straight-jeans"),
    Item("navy-straight-pants", master_version=2),
    Item("wide-pleated-technical-trousers"),
    Item("straight-utility-tailored-trousers"),
    Item("midnight-relaxed-tailoring-trousers"),
    Item("warm-sand-relaxed-pants"),
    Item("warm-sand-deconstructed-trousers"),
    Item("washed-baggy-denim"),
    Item("soft-parachute-cargo-pants"),
    Item("creative-utility-bottom"),
    Item("monochrome-street-tailoring-bottom"),
    Item("modern-track-luxury-bottom"),
    Item("colorblock-nylon-track-pants"),
    Item("sage-cuffed-shorts", True),
    Item("relaxed-tailored-shorts", True),
    Item("refined-utility-cargo-shorts", True),
    Item("technical-sport-shorts", True),
    Item("contemporary-resort-street-bottom", True),
)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def shoe_topline() -> np.ndarray:
    alpha = np.asarray(load(MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"))[..., 3]
    top = np.full(CANVAS[0], 333, dtype=np.int16)
    for x in range(CANVAS[0]):
        rows = np.where(alpha[:, x] > 24)[0]
        if len(rows):
            top[x] = rows.min()
    return top


def extract_bottom(master: Image.Image, is_short: bool = False) -> Image.Image:
    """Keep only garment-color pixels; base skin/background/shoes remain canonical layers."""
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 4x seated item master")
    pixels = np.asarray(master).copy()
    height, width = pixels.shape[:2]
    y, x = np.indices((height, width))
    red, green, blue = (pixels[..., channel].astype(np.int16) for channel in range(3))
    brightness = np.maximum(np.maximum(red, green), blue)
    saturation = np.maximum(np.maximum(red, green), blue) - np.minimum(np.minimum(red, green), blue)
    native_x = np.clip(x // SCALE, 0, CANVAS[0] - 1)
    shoe_ceiling = (shoe_topline()[native_x] + 1) * SCALE
    skin = (red > green + 55) & (green > blue + 6) & (red > 150)
    background = (brightness > 237) & (saturation < 22)
    garment = (
        (x >= ZONE[0] * SCALE)
        & (x < ZONE[2] * SCALE)
        & (y >= ZONE[1] * SCALE)
        & (y < ZONE[3] * SCALE)
        & ~skin
        & ~background
        & (y < shoe_ceiling)
    )
    if is_short:
        garment &= y < 318 * SCALE
    pixels[..., 3] = np.where(garment, 255, 0).astype(np.uint8)
    pixels[~garment, :3] = 0
    result = Image.fromarray(pixels).resize(CANVAS, Image.Resampling.LANCZOS)
    output = np.asarray(result).copy()
    top = shoe_topline()
    for native_x in range(CANVAS[0]):
        output[top[native_x] + 2 :, native_x, 3] = 0
        output[top[native_x] + 2 :, native_x, :3] = 0
    return Image.fromarray(output)


def canonical_composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#fff9fc")
    for layer in (
        MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        bottom,
        MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
        MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        result.alpha_composite(layer if isinstance(layer, Image.Image) else load(layer))
    return result


def render_board(composites: list[tuple[Item, Image.Image]]) -> Image.Image:
    board = Image.new("RGBA", (1080, 1760), "#fffafd")
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    draw.text((30, 22), "MALE BOTTOMS — CANONICAL SITTING CANDIDATES", fill="#302936", font=font)
    draw.text((30, 42), "candidate-only packaged layers · real base and shoes · runtime unchanged", fill="#746a77", font=font)
    for index, (item, composite) in enumerate(composites):
        column, row = index % 4, index // 4
        x, y = 30 + column * 262, 76 + row * 330
        draw.rounded_rectangle((x, y, x + 240, y + 302), radius=16, fill="#ffffff", outline="#edd7e2", width=2)
        draw.text((x + 12, y + 12), item.key.replace("-", " ")[:31], fill="#332b38", font=font)
        preview = composite.copy()
        preview.thumbnail((200, 270), Image.Resampling.LANCZOS)
        board.alpha_composite(preview, (x + (240 - preview.width) // 2, y + 30))
    return board


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    COMPOSITE_DIR.mkdir(parents=True, exist_ok=True)
    composites: list[tuple[Item, Image.Image]] = []
    for item in ITEMS:
        bottom = extract_bottom(load(item.master), item.is_short)
        bottom.save(OUTPUT_DIR / f"room_avatar_bottom_male_{item.key}_v1_sitting_front_f01-candidate-v2.png", optimize=True)
        composite = canonical_composite(bottom)
        composite.convert("RGB").save(COMPOSITE_DIR / f"{item.key}-canonical-sitting-candidate-v2.png", optimize=True)
        composites.append((item, composite))
    render_board(composites).save(BOARD, optimize=True)
    print(BOARD)


if __name__ == "__main__":
    main()
