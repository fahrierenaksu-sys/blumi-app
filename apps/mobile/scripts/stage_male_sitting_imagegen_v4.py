#!/usr/bin/env python3
"""Stage one image-authored male seated-bottom master outside runtime paths."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-imagegen-v4"
SOURCE = EVIDENCE / "source/charcoal_tapered_chinos-seated-master-alpha-v1.png"
OUTPUT = EVIDENCE / "candidates/room_avatar_bottom_male_charcoal_tapered_chinos_v1_sitting_front_f01.png"
BOARD = EVIDENCE / "charcoal-tapered-chinos-sitting-v4-review.png"
CANVAS = (256, 384)
TARGET_BOX = (74, 278, 182, 344)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def seated_layer(source: Image.Image) -> Image.Image:
    bbox = source.getbbox()
    if bbox is None:
        raise ValueError("Generated seated master has no opaque garment pixels")
    garment = source.crop(bbox)
    max_width = TARGET_BOX[2] - TARGET_BOX[0]
    max_height = TARGET_BOX[3] - TARGET_BOX[1]
    factor = min(max_width / garment.width, max_height / garment.height)
    size = (round(garment.width * factor), round(garment.height * factor))
    garment = garment.resize(size, Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = (CANVAS[0] - garment.width) // 2
    y = TARGET_BOX[1] + (max_height - garment.height) // 2
    layer.alpha_composite(garment, (x, y))
    return layer


def composite(layer: Image.Image) -> Image.Image:
    paths = (
        MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        layer,
        MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
        MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for path in paths:
        result.alpha_composite(path if isinstance(path, Image.Image) else load(path))
    return result


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        suffix = "Arial Bold.ttf" if bold else "Arial.ttf"
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{suffix}", size)
    except OSError:
        return ImageFont.load_default()


def review_board(layer: Image.Image, full: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1200, 580), "#fff9fc")
    draw = ImageDraw.Draw(board)
    draw.text((28, 22), "CHARCOAL TAPERED CHINOS · SITTING V4", font=font(23, True), fill="#412c39")
    draw.text((28, 54), "Image-authored seated garment master · candidate only · no runtime promotion", font=font(14), fill="#846c7a")
    checker = Image.new("RGBA", CANVAS, (255, 255, 255, 255))
    checker_draw = ImageDraw.Draw(checker)
    for y in range(0, CANVAS[1], 16):
        for x in range(0, CANVAS[0], 16):
            if (x // 16 + y // 16) % 2:
                checker_draw.rectangle((x, y, x + 15, y + 15), fill="#eee8ec")
    panels = (("garment layer", layer, 330, 96), ("seated composite", full, 610, 96))
    for title, image, x, y in panels:
        panel = checker.copy()
        panel.alpha_composite(image)
        panel = panel.resize((256, 384), Image.Resampling.NEAREST)
        board.paste(panel.convert("RGB"), (x, y))
        draw.text((x, y + 402), title, font=font(15, True), fill="#412c39")
    contact = full.crop((62, 265, 195, 354)).resize((399, 267), Image.Resampling.NEAREST)
    board.paste(contact.convert("RGB"), (850, 158))
    draw.text((850, 128), "4× waist · crotch · hem · shoes", font=font(15, True), fill="#412c39")
    return board


def main() -> None:
    EVIDENCE.joinpath("candidates").mkdir(parents=True, exist_ok=True)
    layer = seated_layer(load(SOURCE))
    layer.save(OUTPUT, optimize=True)
    review_board(layer, composite(layer)).save(BOARD, optimize=True)
    print(OUTPUT)
    print(BOARD)


if __name__ == "__main__":
    main()
