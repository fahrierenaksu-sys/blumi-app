#!/usr/bin/env python3
"""Package a shoe-contoured charcoal seated hem from the 4x on-base master."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v6"
MASTER = EVIDENCE / "masters/charcoal-tapered-chinos-on-base-master-v2-1024.png"
OUTPUT = EVIDENCE / "candidates/room_avatar_bottom_male_charcoal_tapered_chinos_v1_sitting_front_f01-v4-shoe-contoured.png"
COMPOSITE = EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v8-shoe-contoured.png"
CONTACT = EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v8-shoe-contoured-contact.png"
CANVAS = (256, 384)
SCALE = 4
GARMENT_ZONE = (76, 272, 180, 341)
HEM_CONTACT_DEPTH = 5


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def shoe_topline() -> np.ndarray:
    alpha = np.asarray(load(MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"))[..., 3]
    top = np.full(CANVAS[0], 333, dtype=np.int16)
    for x in range(CANVAS[0]):
        ys = np.where(alpha[:, x] > 24)[0]
        if len(ys):
            top[x] = ys.min()
    # Ensure the curve continues one pixel beyond each shoe so the dark hem
    # cannot leave a detached flat tab beside its own cuff.
    for start, end in ((90, 130), (127, 166)):
        for x in range(start, end):
            nearby = top[max(start, x - 2) : min(end, x + 3)]
            top[x] = min(top[x], int(nearby.min()) + 2)
    return top


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected the 4x seated on-base master")
    pixels = np.asarray(master).copy()
    height, width = pixels.shape[:2]
    y, x = np.indices((height, width))
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    native_x = np.clip(x // SCALE, 0, CANVAS[0] - 1)
    hem_limit = (shoe_topline()[native_x] + HEM_CONTACT_DEPTH) * SCALE
    garment = (
        (x >= GARMENT_ZONE[0] * SCALE) & (x < GARMENT_ZONE[2] * SCALE)
        & (y >= GARMENT_ZONE[1] * SCALE) & (y < GARMENT_ZONE[3] * SCALE)
        & (red < 112) & (green < 112) & (blue < 112)
        & ((y < 326 * SCALE) | (y < hem_limit))
    )
    pixels[..., 3] = np.where(garment, 255, 0).astype(np.uint8)
    pixels[~garment, :3] = 0
    layer_4x = Image.fromarray(pixels)
    return layer_4x.resize(CANVAS, Image.Resampling.LANCZOS)


def canonical_composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#fff9fc")
    for entry in (
        MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        bottom,
        MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
        MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        result.alpha_composite(entry if isinstance(entry, Image.Image) else load(entry))
    return result


def review_image(full: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1024, 520), "#fff9fc")
    draw = ImageDraw.Draw(board)
    title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    label = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    draw.text((24, 20), "CHARCOAL TAPERED CHINOS · CANONICAL SITTING V7", font=title, fill="#412c39")
    draw.text((24, 52), "4× shoe-contoured cuffs · canonical shoes retained above the trouser layer", font=label, fill="#806a77")
    board.paste(full.convert("RGB"), (140, 88))
    crop = full.crop((70, 260, 188, 354)).resize((472, 376), Image.Resampling.NEAREST)
    board.paste(crop.convert("RGB"), (490, 108))
    draw.text((490, 84), "4× waist · seated thighs · individual cuffs · shoes", font=label, fill="#412c39")
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
