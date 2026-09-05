#!/usr/bin/env python3
"""Render a source-selected shoe capsule on the approved female avatar feet rig."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
PROFILE_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMB_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-shoe-capsule"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-shoe-capsule-qa"
CANVAS = (256, 384)

FRAME_GUIDES = {
    "static": ((0, 0), (0, 0)),
    "walking_front_f01": ((-1, 0), (1, 0)),
    "walking_front_f02": ((-7, -1), (4, 1)),
    "walking_front_f03": ((-2, -1), (2, -1)),
    "walking_front_f04": ((-4, 1), (7, -1)),
    "sitting_front_f01": ((-20, -1), (20, -1)),
}


@dataclass(frozen=True)
class Shoe:
    slug: str
    name: str


SHOES = (
    Shoe("rosewood_platform_loafers", "Rosewood Platform Loafers"),
    Shoe("pearl_slingback_sandals", "Pearl Slingback Sandals"),
)


def source_shoes(shoe: Shoe) -> tuple[Image.Image, Image.Image]:
    source = Image.open(SOURCE_DIR / f"{shoe.slug}.png").convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Shoe source has no visible pixels: {shoe.slug}")
    crop = source.crop(bbox)
    midpoint = crop.width // 2
    left = crop.crop((0, 0, midpoint, crop.height))
    right = crop.crop((midpoint, 0, crop.width, crop.height))
    left = left.crop(left.getchannel("A").getbbox()).resize((31, 31), Image.Resampling.LANCZOS)
    right = right.crop(right.getchannel("A").getbbox()).resize((31, 31), Image.Resampling.LANCZOS)
    return left, right


def render(shoe: Shoe, frame: str) -> Image.Image:
    left, right = source_shoes(shoe)
    left_offset, right_offset = FRAME_GUIDES[frame]
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(left, (96 + left_offset[0], 316 + left_offset[1]))
    canvas.alpha_composite(right, (129 + right_offset[0], 316 + right_offset[1]))
    return canvas


def load_avatar_layer(prefix: str, frame: str) -> Image.Image:
    if frame == "static":
        return Image.open(ROOM_DIR / f"avatar_room_{prefix}.png").convert("RGBA")
    return Image.open(MOTION_DIR / f"room_avatar_{prefix}_{frame}.png").convert("RGBA")


def build_avatar(shoe: Shoe, frame: str) -> Image.Image:
    avatar = load_avatar_layer("base_female_v2", frame)
    for prefix in (
        "hair_back_female_mocha_ribbon_blowout_v2",
        "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
        "bottom_female_denim_skort_shorts_v2",
        "top_female_cream_basic_tee_v2",
    ):
        avatar.alpha_composite(load_avatar_layer(prefix, frame))
    avatar.alpha_composite(render(shoe, frame))
    avatar.alpha_composite(load_avatar_layer("hair_front_female_mocha_ribbon_blowout_v2", frame))
    return avatar


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def build_qa_sheet(shoe: Shoe) -> None:
    frames = tuple(FRAME_GUIDES)
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit")
    sheet = Image.new("RGBA", (1660, 580), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    draw.text((38, 24), f"{shoe.name} - female base fit", fill="#2b2430", font=title_font)
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = 38 + index * 270
        draw.rounded_rectangle((x, 82, x + 232, 548), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        avatar = build_avatar(shoe, frame).resize((220, 330), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 6, 116))
        text_box = draw.textbbox((0, 0), label, font=label_font)
        draw.text((x + (232 - (text_box[2] - text_box[0])) // 2, 510), label, fill="#463744", font=label_font)
    save(sheet, QA_DIR / f"{shoe.slug}_motion_qa.png")


def main() -> None:
    for shoe in SHOES:
        static = render(shoe, "static")
        save(static, ROOM_DIR / f"avatar_room_shoes_female_{shoe.slug}_v2.png")
        save(static.resize((512, 768), Image.Resampling.LANCZOS), PROFILE_DIR / f"avatar_shoes_{shoe.slug}.png")
        thumbnail = build_avatar(shoe, "static").crop((54, 70, 202, 350)).resize((220, 220), Image.Resampling.LANCZOS)
        save(thumbnail, THUMB_DIR / f"avatar_v2_shoes_{shoe.slug}.png")
        for frame in FRAME_GUIDES:
            if frame == "static":
                continue
            save(render(shoe, frame), MOTION_DIR / f"room_avatar_shoes_female_{shoe.slug}_v2_{frame}.png")
        build_qa_sheet(shoe)


if __name__ == "__main__":
    main()
