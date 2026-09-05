#!/usr/bin/env python3
"""Render repeatable static QA sheets for the male starter room avatar."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ASSET_DIR = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT_DIR = REPO_ROOT / "docs/avatar-motion-pipeline/male-starter-static-qa"

CANVAS_SIZE = (256, 384)
BASELINE_Y = 360

MALE_BASE = ("avatar_room_base_male_light_v1.png",)
MALE_FINAL = (
    "avatar_room_base_male_light_v1.png",
    "avatar_room_face_male_warm_friendly_v1.png",
    "avatar_room_shoes_male_milk_tea_court_v1.png",
    "avatar_room_bottom_male_navy_straight_pants_v1.png",
    "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    "avatar_room_hair_front_male_espresso_crop_v1.png",
)
FEMALE_SCALE_REFERENCE = (
    "avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png",
    "avatar_room_base_female_v2.png",
    "avatar_room_face_female_soft_doll_foundation_v2.png",
    "avatar_room_eyes_female_mocha_doe_v2.png",
    "avatar_room_nose_female_soft_button_v2.png",
    "avatar_room_mouth_female_peach_whisper_smile_v2.png",
    "avatar_room_bottom_female_denim_skort_shorts_v2.png",
    "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
    "avatar_room_top_female_cream_basic_tee_v2.png",
    "avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png",
)


def load_layer(filename: str) -> Image.Image:
    layer = Image.open(ASSET_DIR / filename).convert("RGBA")
    if layer.size != CANVAS_SIZE:
        raise ValueError(f"{filename} must be 256x384, got {layer.size}")
    return layer


def composite(filenames: tuple[str, ...]) -> Image.Image:
    result = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    for filename in filenames:
        result = Image.alpha_composite(result, load_layer(filename))
    return result


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    colors = ((248, 248, 248), (226, 226, 226))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def render_panel(avatar: Image.Image) -> Image.Image:
    panel = checkerboard(CANVAS_SIZE)
    guides = ImageDraw.Draw(panel)
    guides.line((128, 0, 128, CANVAS_SIZE[1]), fill=(236, 79, 150), width=1)
    guides.line((0, BASELINE_Y, CANVAS_SIZE[0], BASELINE_Y), fill=(68, 126, 219), width=1)
    panel.paste(avatar, (0, 0), avatar)
    return panel


def render_side_by_side() -> None:
    header_height = 42
    gap = 18
    panels = (
        ("MALE BASE DRIVER", composite(MALE_BASE)),
        ("MALE STARTER FIT", composite(MALE_FINAL)),
        ("FEMALE SCALE REF", composite(FEMALE_SCALE_REFERENCE)),
    )
    width = len(panels) * CANVAS_SIZE[0] + (len(panels) + 1) * gap
    sheet = Image.new("RGB", (width, header_height + CANVAS_SIZE[1] + gap), (255, 249, 244))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, (label, avatar) in enumerate(panels):
        x = gap + index * (CANVAS_SIZE[0] + gap)
        text_box = draw.textbbox((0, 0), label, font=font)
        text_width = text_box[2] - text_box[0]
        draw.text(
            (x + (CANVAS_SIZE[0] - text_width) // 2, 15),
            label,
            fill=(82, 53, 62),
            font=font,
        )
        sheet.paste(render_panel(avatar), (x, header_height))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIR / "male_starter_side_by_side_qa.png")


def render_zoom() -> None:
    avatar = composite(MALE_FINAL)
    bbox = avatar.getbbox()
    if bbox is None:
        raise ValueError("Male starter composite is empty")

    padding = 12
    crop_box = (
        max(0, bbox[0] - padding),
        max(0, bbox[1] - padding),
        min(CANVAS_SIZE[0], bbox[2] + padding),
        min(CANVAS_SIZE[1], bbox[3] + padding),
    )
    cropped = avatar.crop(crop_box)
    scale = 3
    zoomed = cropped.resize(
        (cropped.width * scale, cropped.height * scale),
        Image.Resampling.NEAREST,
    )
    background = checkerboard(zoomed.size, cell=24)
    background.paste(zoomed, (0, 0), zoomed)
    background.save(OUTPUT_DIR / "male_starter_zoom_qa.png")


def main() -> None:
    render_side_by_side()
    render_zoom()


if __name__ == "__main__":
    main()
