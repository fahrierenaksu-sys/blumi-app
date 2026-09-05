#!/usr/bin/env python3
"""Render the premium female accessory capsule on the approved room avatar base."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
PROFILE_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMB_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-accessories"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-accessory-collection-qa"
CANVAS = (256, 384)
MOTION_SUFFIXES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class Accessory:
    slug: str
    name: str
    group: str
    size: tuple[int, int]
    position: tuple[int, int]
    sitting_offset: tuple[int, int] = (0, 0)


ACCESSORIES = (
    Accessory("ivory_ribbon_beret", "Ivory Ribbon Beret", "headwear", (136, 88), (60, 62)),
    Accessory("cherry_bow_headband", "Cherry Bow Headband", "headwear", (132, 84), (62, 70)),
    Accessory("sage_heart_glasses", "Sage Heart Glasses", "eyewear", (94, 40), (81, 146)),
    Accessory("pearl_drop_earrings", "Pearl Drop Earrings", "earrings", (103, 53), (76, 163)),
    Accessory("golden_heart_locket", "Golden Heart Locket", "neck", (58, 48), (99, 198)),
    Accessory("buttercream_neck_scarf", "Buttercream Neck Scarf", "neck", (88, 51), (84, 208)),
    Accessory("cherry_micro_bag", "Cherry Micro Bag", "bag", (90, 147), (137, 193), (0, 12)),
    Accessory("sunny_star_clips", "Sunny Star Clips", "hairClip", (80, 36), (88, 116)),
)

FRAME_OFFSETS = {
    "static": (0, 0),
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-1, -1),
    "walking_front_f03": (0, -1),
    "walking_front_f04": (1, -1),
    "sitting_front_f01": (0, 0),
}


def source_sprite(accessory: Accessory) -> Image.Image:
    source = Image.open(SOURCE_DIR / f"{accessory.slug}.png").convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Missing visible pixels: {accessory.slug}")
    return source.crop(bbox).resize(accessory.size, Image.Resampling.LANCZOS)


def render(accessory: Accessory, frame: str) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    dx, dy = FRAME_OFFSETS[frame]
    if frame == "sitting_front_f01":
        dx += accessory.sitting_offset[0]
        dy += accessory.sitting_offset[1]
    canvas.alpha_composite(source_sprite(accessory), (accessory.position[0] + dx, accessory.position[1] + dy))
    return canvas


def load_room_asset(filename: str) -> Image.Image:
    return Image.open(ROOM_DIR / filename).convert("RGBA")


def load_avatar_layer(prefix: str, frame: str) -> Image.Image:
    if frame == "static":
        return load_room_asset(f"avatar_room_{prefix}.png")
    return Image.open(MOTION_DIR / f"room_avatar_{prefix}_{frame}.png").convert("RGBA")


def build_avatar(accessories: tuple[Accessory, ...], frame: str = "static") -> Image.Image:
    base = load_avatar_layer("base_female_v2", frame)
    layers = (
        "hair_back_female_mocha_ribbon_blowout_v2",
        "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
        "bottom_female_denim_skort_shorts_v2",
        "top_female_cream_basic_tee_v2",
        "shoes_female_milk_tea_court_sneakers_v2",
    )
    for prefix in layers:
        base.alpha_composite(load_avatar_layer(prefix, frame))
    for accessory in accessories:
        base.alpha_composite(render(accessory, frame))
    base.alpha_composite(load_avatar_layer("hair_front_female_mocha_ribbon_blowout_v2", frame))
    return base


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, width: int, font: ImageFont.ImageFont) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text((x + (width - (bbox[2] - bbox[0])) // 2, y), text, fill="#463744", font=font)


def build_contact_sheet() -> None:
    entries = list(ACCESSORIES) + [
        (ACCESSORIES[0], ACCESSORIES[2], ACCESSORIES[3], ACCESSORIES[4], ACCESSORIES[6])
    ]
    sheet = Image.new("RGBA", (1380, 1860), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    draw.text((48, 32), "Female accessory capsule - approved base fit", fill="#2b2430", font=title_font)
    for index, entry in enumerate(entries):
        col = index % 3
        row = index // 3
        x = 46 + col * 445
        y = 106 + row * 575
        draw.rounded_rectangle((x, y, x + 400, y + 530), radius=20, fill="#fffafd", outline="#ead9e6", width=3)
        current = (entry,) if isinstance(entry, Accessory) else entry
        avatar = build_avatar(current).resize((320, 480), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 40, y + 24))
        name = entry.name if isinstance(entry, Accessory) else "Complete accessory stack"
        label(draw, name, x, y + 500, 400, label_font)
    save(sheet, QA_DIR / "female_accessory_contact_sheet.png")


def build_motion_contact_sheet() -> None:
    frames = ("static",) + MOTION_SUFFIXES
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit")
    sheet = Image.new("RGBA", (1660, 580), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    draw.text((38, 24), "Complete accessory stack - motion fit", fill="#2b2430", font=title_font)
    stack = (ACCESSORIES[0], ACCESSORIES[2], ACCESSORIES[3], ACCESSORIES[4], ACCESSORIES[6])
    for index, (frame, frame_label) in enumerate(zip(frames, labels)):
        x = 38 + index * 270
        draw.rounded_rectangle((x, 82, x + 232, 548), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        avatar = build_avatar(stack, frame).resize((220, 330), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 6, 116))
        label(draw, frame_label, x, 510, 232, label_font)
    save(sheet, QA_DIR / "female_accessory_motion_contact_sheet.png")


def main() -> None:
    for accessory in ACCESSORIES:
        static = render(accessory, "static")
        save(static, ROOM_DIR / f"avatar_room_accessory_female_{accessory.slug}_v2.png")
        save(static.resize((512, 768), Image.Resampling.LANCZOS), PROFILE_DIR / f"avatar_accessory_{accessory.slug}.png")
        thumbnail = build_avatar((accessory,)).crop((54, 70, 202, 350)).resize((220, 220), Image.Resampling.LANCZOS)
        save(thumbnail, THUMB_DIR / f"avatar_v2_accessory_{accessory.slug}.png")
        for suffix in MOTION_SUFFIXES:
            save(
                render(accessory, suffix),
                MOTION_DIR / f"room_avatar_accessory_female_{accessory.slug}_v2_{suffix}.png",
            )
    build_contact_sheet()
    build_motion_contact_sheet()


if __name__ == "__main__":
    main()
