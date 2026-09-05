#!/usr/bin/env python3
"""Package the navy straight-pants sitting master without changing canonical rig pixels."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v6"
MASTER = EVIDENCE / "item-masters/navy-straight-pants-sitting-master-v2-1024.png"
OUTPUT = EVIDENCE / "candidates/room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01-v1-candidate.png"
COMPOSITE = EVIDENCE / "navy-straight-pants-canonical-sitting-v1.png"
CONTACT = EVIDENCE / "navy-straight-pants-canonical-sitting-v1-contact.png"
CANVAS = (256, 384)
SCALE = 4
GARMENT_ZONE = (76, 272, 180, 341)


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


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 4x seated on-base master")
    pixels = np.asarray(master).copy()
    height, width = pixels.shape[:2]
    y, x = np.indices((height, width))
    red, green, blue = (pixels[..., channel].astype(np.int16) for channel in range(3))
    garment = (
        (x >= GARMENT_ZONE[0] * SCALE)
        & (x < GARMENT_ZONE[2] * SCALE)
        & (y >= GARMENT_ZONE[1] * SCALE)
        & (y < GARMENT_ZONE[3] * SCALE)
        & (blue > red + 18)
        & (blue > green + 8)
        & (red < 115)
        & (green < 125)
    )
    pixels[..., 3] = np.where(garment, 255, 0).astype(np.uint8)
    pixels[~garment, :3] = 0
    result = Image.fromarray(pixels).resize(CANVAS, Image.Resampling.LANCZOS)
    # LANCZOS retains the premium edge but can leave a faint alpha tail below
    # the shoe-safe ceiling; trim only that impossible contact area.
    output = np.asarray(result).copy()

    # Straight-fit waist contact follows the canonical tee for the first
    # visible rows.  Volume can open below this zone, but the waistband must
    # never flare from behind the torso like a pasted photograph.
    top_alpha = np.asarray(
        load(MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png")
    )[..., 3]
    for row in range(280, 288):
        top_columns = np.where(top_alpha[row] > 24)[0]
        if not len(top_columns):
            continue
        left = max(0, int(top_columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(top_columns.max()) + 1)
        output[row, :left] = 0
        output[row, right + 1 :] = 0

    # Straight hems use a restrained bottomOverShoeUpper contact: only the
    # inner/outer cuff sides descend over the shoe throat.  The canonical
    # tongue and lace centers remain visible, avoiding both a blunt crop and
    # a shoe-covering flap.
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    cuff_depth = rows - 329
    cuff_side_contact = (
        (rows >= 329)
        & (rows <= 332)
        & (
            ((cols >= 93 + cuff_depth) & (cols <= 104 - (2 * cuff_depth)))
            | ((cols >= 120 + cuff_depth) & (cols <= 126))
            | ((cols >= 129) & (cols <= 135 - cuff_depth))
            | ((cols >= 151 + (2 * cuff_depth)) & (cols <= 162 - cuff_depth))
        )
    )
    output[329:338, 127:130] = 0

    shoe_alpha = np.asarray(
        load(MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png")
    )[..., 3]
    output[(shoe_alpha > 24) & ~cuff_side_contact] = 0
    output[333:] = 0
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def canonical_composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#fff9fc")
    for path in (
        MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
        bottom,
        MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        result.alpha_composite(path if isinstance(path, Image.Image) else load(path))
    return result


def review_image(full: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1024, 520), "#fff9fc")
    draw = ImageDraw.Draw(board)
    title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    label = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    draw.text((24, 20), "NAVY STRAIGHT PANTS · CANONICAL SITTING CANDIDATE", font=title, fill="#412c39")
    draw.text((24, 52), "original canonical base and shoes retained · 4× waist / crotch / cuff inspection", font=label, fill="#806a77")
    board.paste(full.convert("RGB"), (140, 88))
    crop = full.crop((70, 260, 188, 354)).resize((472, 376), Image.Resampling.NEAREST)
    board.paste(crop.convert("RGB"), (490, 108))
    draw.text((490, 84), "waist · separated legs · individual shoe contacts", font=label, fill="#412c39")
    return board


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bottom = extract_bottom(load(MASTER))
    bottom.save(OUTPUT, optimize=True)
    full = canonical_composite(bottom)
    full.convert("RGB").save(COMPOSITE, optimize=True)
    review_image(full).save(CONTACT, optimize=True)
    print(OUTPUT)
    print(COMPOSITE)
    print(CONTACT)


if __name__ == "__main__":
    main()
