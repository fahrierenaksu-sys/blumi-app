#!/usr/bin/env python3
"""Extract the pose-specific Cream Tee 4W ImageGen strip into staging.

The source already contains four independently rendered poses. This script
only removes the green screen and fits each panel to its measured canonical
female body anchor. It never reads a staged frame as a later frame source and
never writes to the live room/motion directory.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
STAGING = ROOT / "docs/avatar-motion-pipeline/female-cream-tee-motion-staging"
SOURCE = STAGING / "cream-tee-walk-4w-chroma-source.png"
EXTRACTED = STAGING / "extracted"
CANVAS = (256, 384)
TARGET_BOUNDS = (
    (85, 218, 171, 294),
    (84, 218, 170, 294),
    (84, 218, 170, 294),
    (86, 218, 172, 294),
)


def clamp_byte(value: float) -> int:
    return max(0, min(255, round(value)))


def chroma_alpha(red: int, green: int, blue: int) -> int:
    dominance = green - max(red, blue)
    return clamp_byte(((82 - dominance) / 48) * 255)


def extract_panel(strip: Image.Image, index: int) -> Image.Image:
    left = round(index * strip.width / 4)
    right = round((index + 1) * strip.width / 4)
    panel = strip.crop((left, 0, right, strip.height)).convert("RGBA")
    pixels = panel.load()
    for y in range(panel.height):
        for x in range(panel.width):
            red, green, blue, _ = pixels[x, y]
            alpha = chroma_alpha(red, green, blue)
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            # Despill only; garment color and painterly highlights remain from
            # this pose panel rather than another frame or a patch source.
            pixels[x, y] = (
                red,
                min(green, max(red, blue) + 18),
                blue,
                alpha,
            )
    return panel


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("extracted Cream Tee panel has no visible garment")
    return bbox


def fit_panel(panel: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    source = panel.crop(visible_bbox(panel))
    left, top, right, bottom = bounds
    fitted = source.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(fitted, (left, top))
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif green > red + 32 and green > blue + 32:
                pixels[x, y] = (red, max(red, blue), blue, alpha)
    return result


def load_motion(prefix: str, frame: int) -> Image.Image:
    path = MOTION / f"room_avatar_{prefix}_walking_front_f{frame:02d}.png"
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def compose(frame: int, top: Image.Image) -> Image.Image:
    layers = (
        load_motion("hair_back_female_mocha_ribbon_blowout_v2", frame),
        load_motion("base_female_v2", frame),
        load_motion("face_female_soft_doll_foundation_v2", frame),
        load_motion("eyes_female_mocha_doe_v2", frame),
        load_motion("nose_female_soft_button_v2", frame),
        load_motion("mouth_female_peach_whisper_smile_v2", frame),
        load_motion("bottom_female_denim_skort_shorts_v2", frame),
        load_motion("shoes_female_milk_tea_court_sneakers_v2", frame),
        top,
        load_motion("hair_front_female_mocha_ribbon_blowout_v2", frame),
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result.alpha_composite(layer)
    return result


def background() -> Image.Image:
    image = Image.new("RGBA", CANVAS, (255, 249, 252, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((78, 337, 178, 361), fill=(255, 239, 246, 255))
    return image


def font(size: int) -> ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def flatten(avatar: Image.Image) -> Image.Image:
    panel = background()
    panel.alpha_composite(avatar)
    return panel.convert("RGB")


def render_full_body(frames: list[Image.Image]) -> Path:
    header = 38
    sheet = Image.new("RGB", (CANVAS[0] * 4, CANVAS[1] + header), (255, 249, 252))
    draw = ImageDraw.Draw(sheet)
    for index, top in enumerate(frames):
        x = index * CANVAS[0]
        sheet.paste(flatten(compose(index + 1, top)), (x, header))
        draw.text((x + 10, 10), f"Cream Tee · W{index + 1}", fill=(83, 41, 64), font=font(15))
        left, top_y, right, bottom = TARGET_BOUNDS[index]
        draw.rectangle((x + left, header + top_y, x + right - 1, header + bottom - 1), outline=(255, 70, 145), width=1)
    path = STAGING / "cream-tee-4w-full-body-overlay-contact-sheet.png"
    sheet.save(path, optimize=True)
    return path


def render_closeups(frames: list[Image.Image]) -> Path:
    crop_box = (70, 205, 186, 305)
    scale = 3
    cell_w = (crop_box[2] - crop_box[0]) * scale
    cell_h = (crop_box[3] - crop_box[1]) * scale + 34
    sheet = Image.new("RGB", (cell_w * 4, cell_h), (255, 249, 252))
    draw = ImageDraw.Draw(sheet)
    for index, top in enumerate(frames):
        avatar = flatten(compose(index + 1, top))
        closeup = avatar.crop(crop_box).resize((cell_w, cell_h - 34), Image.Resampling.NEAREST)
        x = index * cell_w
        sheet.paste(closeup, (x, 34))
        draw.text((x + 10, 9), f"W{index + 1} · neckline / shoulder / hem", fill=(83, 41, 64), font=font(14))
    path = STAGING / "cream-tee-4w-neckline-shoulder-hem-closeups.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    strip = Image.open(SOURCE).convert("RGBA")
    if strip.width < 1024 or strip.height < 512:
        raise ValueError(f"unexpected Cream Tee strip size: {strip.size}")
    EXTRACTED.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for index, bounds in enumerate(TARGET_BOUNDS):
        frame = fit_panel(extract_panel(strip, index), bounds)
        target = EXTRACTED / f"room_avatar_top_female_cream_basic_tee_v2_walking_front_f{index + 1:02d}.png"
        frame.save(target, optimize=True)
        frames.append(frame)
    full_body = render_full_body(frames)
    closeups = render_closeups(frames)
    print(f"staged {len(frames)} Cream Tee frames in {EXTRACTED.relative_to(ROOT)}")
    print(full_body.relative_to(ROOT))
    print(closeups.relative_to(ROOT))


if __name__ == "__main__":
    main()
