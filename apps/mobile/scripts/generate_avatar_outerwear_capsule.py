#!/usr/bin/env python3
"""Render the outerwear capsule onto the approved female avatar body envelope."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
PROFILE_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMB_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-outerwear-capsule-qa"
CANVAS = (256, 384)

FRAME_OFFSETS = {
    "static": (0, 0),
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-1, 0),
    "walking_front_f03": (0, 1),
    "walking_front_f04": (1, 0),
    "sitting_front_f01": (0, 0),
}


@dataclass(frozen=True)
class OuterwearGarment:
    slug: str
    name: str
    source: Path
    sprite_size: tuple[int, int]
    origin: tuple[int, int]


GARMENTS = (
    OuterwearGarment(
        slug="blush_lace_cardigan",
        name="Blush Lace Cardigan",
        source=ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-outerwear-capsule/blush_lace_cardigan.png",
        sprite_size=(106, 92),
        origin=(75, 210),
    ),
    OuterwearGarment(
        slug="sage_ribbon_knit_jacket",
        name="Sage Ribbon Knit Jacket",
        source=ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-outerwear-capsule/sage_ribbon_knit_jacket.png",
        sprite_size=(108, 90),
        origin=(74, 210),
    ),
    OuterwearGarment(
        slug="cherry_heart_milkmaid_blouse",
        name="Cherry Heart Milkmaid Blouse",
        source=ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-outerwear-capsule/cherry_heart_milkmaid_blouse.png",
        sprite_size=(112, 84),
        origin=(72, 212),
    ),
    OuterwearGarment(
        slug="powder_blue_ribbon_corset_top",
        name="Powder Blue Ribbon Corset Top",
        source=ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-outerwear-capsule/powder_blue_ribbon_corset_top.png",
        sprite_size=(80, 92),
        origin=(88, 207),
    ),
    OuterwearGarment(
        slug="noir_rose_heart_cardigan",
        name="Noir Rose Heart Cardigan",
        source=ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-outerwear-capsule/noir_rose_heart_cardigan.png",
        sprite_size=(112, 91),
        origin=(72, 209),
    ),
)

STATIC_CANDIDATES = GARMENTS[-3:]


def source_sprite(garment: OuterwearGarment) -> Image.Image:
    source = Image.open(garment.source).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{garment.name} source has no visible pixels")
    return source.crop(bbox).resize(garment.sprite_size, Image.Resampling.LANCZOS)


def render(garment: OuterwearGarment, frame: str) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    dx, dy = FRAME_OFFSETS[frame]
    x, y = garment.origin
    canvas.alpha_composite(source_sprite(garment), (x + dx, y + dy))
    return canvas


def load_avatar_layer(prefix: str, frame: str) -> Image.Image:
    if frame == "static":
        return Image.open(ROOM_DIR / f"avatar_room_{prefix}.png").convert("RGBA")
    return Image.open(MOTION_DIR / f"room_avatar_{prefix}_{frame}.png").convert("RGBA")


def build_avatar(garment: OuterwearGarment, frame: str) -> Image.Image:
    avatar = load_avatar_layer("hair_back_female_mocha_ribbon_blowout_v2", frame)
    avatar.alpha_composite(load_avatar_layer("base_female_v2", frame))
    for prefix in (
        "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
        "bottom_female_denim_skort_shorts_v2",
    ):
        avatar.alpha_composite(load_avatar_layer(prefix, frame))
    avatar.alpha_composite(render(garment, frame))
    avatar.alpha_composite(load_avatar_layer("shoes_female_milk_tea_court_sneakers_v2", frame))
    avatar.alpha_composite(load_avatar_layer("hair_front_female_mocha_ribbon_blowout_v2", frame))
    return avatar


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def build_qa_sheet(garment: OuterwearGarment) -> None:
    frames = tuple(FRAME_OFFSETS)
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit")
    sheet = Image.new("RGBA", (1660, 580), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    draw.text((38, 24), f"{garment.name} - female base fit", fill="#2b2430", font=title_font)
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = 38 + index * 270
        draw.rounded_rectangle((x, 82, x + 232, 548), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        avatar = build_avatar(garment, frame).resize((220, 330), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 6, 116))
        bbox = draw.textbbox((0, 0), label, font=label_font)
        draw.text((x + (232 - (bbox[2] - bbox[0])) // 2, 510), label, fill="#463744", font=label_font)
    save(sheet, QA_DIR / f"{garment.slug}_motion_qa.png")


def build_static_candidate_qa() -> None:
    sheet = Image.new("RGBA", (1440, 700), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    draw.text((38, 24), "Women Top Capsule V2 - static female base fit gate", fill="#2b2430", font=title_font)
    for index, garment in enumerate(STATIC_CANDIDATES):
        x = 38 + index * 462
        draw.rounded_rectangle((x, 82, x + 420, 660), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        avatar = build_avatar(garment, "static").resize((360, 540), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 30, 88))
        bbox = draw.textbbox((0, 0), garment.name, font=label_font)
        draw.text((x + (420 - (bbox[2] - bbox[0])) // 2, 625), garment.name, fill="#463744", font=label_font)
    save(sheet, QA_DIR / "women_top_capsule_v2_static_fit_contact_sheet.png")


def generate_garment(garment: OuterwearGarment) -> None:
    static = render(garment, "static")
    save(static, ROOM_DIR / f"avatar_room_top_female_{garment.slug}_v2.png")
    save(static.resize((512, 768), Image.Resampling.LANCZOS), PROFILE_DIR / f"avatar_top_{garment.slug}.png")
    thumbnail = (
        build_avatar(garment, "static")
        .crop((54, 70, 202, 350))
        .resize((220, 220), Image.Resampling.LANCZOS)
    )
    save(thumbnail, THUMB_DIR / f"avatar_v2_top_{garment.slug}.png")
    for frame in FRAME_OFFSETS:
        if frame == "static":
            continue
        save(
            render(garment, frame),
            MOTION_DIR / f"room_avatar_top_female_{garment.slug}_v2_{frame}.png",
        )
    build_qa_sheet(garment)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--static-candidates", action="store_true")
    args = parser.parse_args()
    if args.static_candidates:
        build_static_candidate_qa()
        return
    for garment in GARMENTS:
        generate_garment(garment)


if __name__ == "__main__":
    main()
