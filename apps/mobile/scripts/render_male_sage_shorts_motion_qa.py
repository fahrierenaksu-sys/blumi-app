#!/usr/bin/env python3
"""Render the canonical male sage-shorts front 4W+1S fit evidence.

This is a review artifact, not a runtime renderer. It composes the exact room
layer order used by the mobile catalog so a reviewer can inspect waist, hem,
shoe clearance, and walking deformation on one stable contact sheet.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_ROOT = ROOM_ROOT / "motion"
OUTPUT_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-sage-shorts-motion-qa"
CANVAS = (256, 384)
FRAMES = (
    ("STATIC", None),
    ("WALK 01", "walking_front_f01"),
    ("WALK 02", "walking_front_f02"),
    ("WALK 03", "walking_front_f03"),
    ("WALK 04", "walking_front_f04"),
    ("SIT 01", "sitting_front_f01"),
)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path.name}: expected 256x384, got {image.size}")
    return image


def layer(name: str, motion: str | None = None) -> Image.Image:
    # Fixed-head layers intentionally reuse their static source in motion;
    # only body, bottom, shoes, and top have frame-specific files.
    if motion is None or "face_male" in name or "hair_front_male" in name:
        return load(ROOM_ROOT / name)
    stem = name.removesuffix(".png").replace("avatar_room_", "room_avatar_", 1)
    return load(MOTION_ROOT / f"{stem}_{motion}.png")


def compose(motion: str | None) -> Image.Image:
    # Keep this order identical to ROOM_AVATAR_LAYER_ORDER: bottom is above
    # the shoe upper, while the top and hair front finish the visible stack.
    names = (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
        "avatar_room_bottom_male_sage_cuffed_shorts_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
        "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in names:
        result = Image.alpha_composite(result, layer(name, motion))
    return result


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGB", size, (255, 252, 254))
    draw = ImageDraw.Draw(image)
    colors = ((255, 252, 254), (240, 232, 238))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def panel(label: str, avatar: Image.Image) -> Image.Image:
    result = checkerboard(CANVAS)
    guide = ImageDraw.Draw(result)
    guide.line((128, 0, 128, CANVAS[1]), fill=(236, 79, 150), width=1)
    guide.line((0, 360, CANVAS[0], 360), fill=(72, 132, 216), width=1)
    result.paste(avatar, (0, 0), avatar)
    guide.rectangle((94, 282, 162, 342), outline=(235, 95, 150), width=1)
    guide.text((8, 8), label, fill=(77, 45, 62), font=ImageFont.load_default())
    return result


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    tile_w, tile_h, gap = 286, 414, 14
    sheet = Image.new(
        "RGB",
        (gap + 3 * (tile_w + gap), 64 + 2 * (tile_h + gap)),
        (255, 247, 251),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((gap, 16), "MALE SAGE CUFFED SHORTS · FRONT STATIC + 4W + 1S", fill=(73, 43, 58), font=font)
    draw.text((gap, 36), "Exact runtime layer order · 256x384 · waist / hem / shoe clearance guide", fill=(126, 104, 116), font=font)

    composites: list[tuple[str, Image.Image]] = []
    for index, (label, motion) in enumerate(FRAMES):
        avatar = compose(motion)
        composites.append((label, avatar))
        column, row = index % 3, index // 3
        x = gap + column * (tile_w + gap) + (tile_w - CANVAS[0]) // 2
        y = 64 + row * (tile_h + gap)
        sheet.paste(panel(label, avatar), (x, y))

    output = OUTPUT_ROOT / "2026-07-15-male-sage-shorts-front-4w1s-contact-sheet.png"
    sheet.save(output, optimize=True)
    crop_box = (88, 278, 168, 352)
    crop_scale = 6
    closeup = Image.new("RGB", (len(composites) * (crop_box[2] - crop_box[0]) * crop_scale, 74 * crop_scale + 32), (255, 247, 251))
    closeup_draw = ImageDraw.Draw(closeup)
    for index, (label, avatar) in enumerate(composites):
        crop = avatar.crop(crop_box).resize(((crop_box[2] - crop_box[0]) * crop_scale, (crop_box[3] - crop_box[1]) * crop_scale), Image.Resampling.NEAREST)
        tile = checkerboard(crop.size, cell=24)
        tile.paste(crop, (0, 0), crop)
        x = index * crop.width
        closeup.paste(tile, (x, 32))
        closeup_draw.text((x + 8, 10), label, fill=(77, 45, 62), font=font)
    closeup.save(OUTPUT_ROOT / "2026-07-15-male-sage-shorts-front-4w1s-closeup.png", optimize=True)
    print(output)


if __name__ == "__main__":
    main()
