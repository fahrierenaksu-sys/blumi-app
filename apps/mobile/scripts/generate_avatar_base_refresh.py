#!/usr/bin/env python3
"""Refresh the female avatar head while preserving the approved body rig."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-base-refresh"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-base-refresh-qa"
CANVAS = (256, 384)

FRAME_SOURCES = {
    "static": SOURCE_DIR / "base_female_body_envelope_v2.png",
    "walking_front_f01": SOURCE_DIR / "motion/room_avatar_base_female_v2_walking_front_f01.png",
    "walking_front_f02": SOURCE_DIR / "motion/room_avatar_base_female_v2_walking_front_f02.png",
    "walking_front_f03": SOURCE_DIR / "motion/room_avatar_base_female_v2_walking_front_f03.png",
    "walking_front_f04": SOURCE_DIR / "motion/room_avatar_base_female_v2_walking_front_f04.png",
    "sitting_front_f01": SOURCE_DIR / "motion/room_avatar_base_female_v2_sitting_front_f01.png",
}

FRAME_OFFSETS = {
    "static": (0, 0),
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-1, -1),
    "walking_front_f03": (0, -1),
    "walking_front_f04": (1, -1),
    "sitting_front_f01": (0, 0),
}


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def head_sprite() -> Image.Image:
    source = Image.open(SOURCE_DIR / "soft_doll_head_v4_cheeky.png").convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Soft Doll head source has no visible pixels")
    sprite = source.crop(bbox).resize((104, 115), Image.Resampling.LANCZOS)
    # Feather only the lower neck edge into the unchanged shoulder rig.
    fade = Image.new("L", sprite.size, 255)
    draw = ImageDraw.Draw(fade)
    for y in range(103, sprite.height):
        alpha = round(255 * (sprite.height - 1 - y) / (sprite.height - 1 - 103))
        draw.line((0, y, sprite.width, y), fill=max(0, alpha))
    sprite.putalpha(ImageChops.multiply(sprite.getchannel("A"), fade))
    return sprite


def erase_legacy_head(image: Image.Image, offset: tuple[int, int]) -> Image.Image:
    dx, dy = offset
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [
            (54 + dx, 86 + dy),
            (202 + dx, 86 + dy),
            (202 + dx, 164 + dy),
            (190 + dx, 192 + dy),
            (174 + dx, 205 + dy),
            (166 + dx, 215 + dy),
            (90 + dx, 215 + dy),
            (82 + dx, 205 + dy),
            (66 + dx, 192 + dy),
            (54 + dx, 164 + dy),
        ],
        fill=255,
    )
    alpha = image.getchannel("A").copy()
    alpha.paste(0, mask=mask)
    alpha.paste(0, (54 + dx, 164 + dy, 90 + dx, 215 + dy))
    alpha.paste(0, (166 + dx, 164 + dy, 203 + dx, 215 + dy))
    result = image.copy()
    result.putalpha(alpha)
    return result


def neck_extension(offset: tuple[int, int]) -> Image.Image:
    dx, dy = offset
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [
            (112 + dx, 199 + dy),
            (144 + dx, 199 + dy),
            (145 + dx, 221 + dy),
            (111 + dx, 221 + dy),
        ],
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(0.45))
    bridge = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    bridge_draw = ImageDraw.Draw(bridge)
    for y in range(CANVAS[1]):
        progress = min(1, max(0, (y - 199) / 22))
        color = (
            round(249 * (1 - progress) + 254 * progress),
            round(175 * (1 - progress) + 210 * progress),
            round(135 * (1 - progress) + 178 * progress),
        )
        bridge_draw.line((0, y, CANVAS[0], y), fill=(*color, 255))
    bridge.putalpha(mask)
    return bridge


def render(frame: str) -> Image.Image:
    offset = FRAME_OFFSETS[frame]
    body = Image.open(FRAME_SOURCES[frame]).convert("RGBA")
    result = erase_legacy_head(body, offset)
    dx, dy = offset
    result.alpha_composite(neck_extension(offset))
    result.alpha_composite(head_sprite(), (76 + dx, 111 + dy))
    return result


def validate_render(image: Image.Image, frame: str) -> None:
    alpha = image.getchannel("A")
    dx, dy = FRAME_OFFSETS[frame]
    for y in range(196 + dy, 226 + dy):
        if alpha.getpixel((128 + dx, y)) < 220:
            raise ValueError(f"{frame} breaks the head-to-body centerline at y={y}")

    visible = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y)) >= 16
    }
    if not visible:
        raise ValueError(f"{frame} has no visible pixels")
    pending = [next(iter(visible))]
    connected: set[tuple[int, int]] = set()
    while pending:
        x, y = pending.pop()
        if (x, y) in connected:
            continue
        connected.add((x, y))
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor in visible and neighbor not in connected:
                pending.append(neighbor)
    if connected != visible:
        raise ValueError(f"{frame} contains detached alpha fragments")


def build_qa() -> None:
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit")
    frames = tuple(FRAME_SOURCES)
    sheet = Image.new("RGBA", (1660, 580), "#fbf4fa")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    draw.text((38, 24), "Soft Doll Head Refresh - preserved female body rig", fill="#2b2430", font=title_font)
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = 38 + index * 270
        draw.rounded_rectangle((x, 82, x + 232, 548), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        avatar = render(frame).resize((220, 330), Image.Resampling.LANCZOS)
        sheet.alpha_composite(avatar, (x + 6, 116))
        bbox = draw.textbbox((0, 0), label, font=label_font)
        draw.text((x + (232 - (bbox[2] - bbox[0])) // 2, 510), label, fill="#463744", font=label_font)
    save(sheet, QA_DIR / "soft_doll_head_refresh_motion_qa.png")


def main() -> None:
    renders = {frame: render(frame) for frame in FRAME_SOURCES}
    for frame, image in renders.items():
        validate_render(image, frame)
    static = renders["static"]
    save(static, ROOM_DIR / "avatar_room_base_female_v2.png")
    for frame in tuple(FRAME_SOURCES)[1:]:
        save(renders[frame], MOTION_DIR / f"room_avatar_base_female_v2_{frame}.png")
    build_qa()


if __name__ == "__main__":
    main()
