#!/usr/bin/env python3
"""Extract a seated charcoal-chino layer from an approved on-base art master."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/bottom-sitting-on-base-v6"
MASTER = EVIDENCE / "masters/charcoal-tapered-chinos-on-base-master-v2-256.png"
OUTPUT = EVIDENCE / "candidates/room_avatar_bottom_male_charcoal_tapered_chinos_v1_sitting_front_f01-v2.png"
COMPOSITE = EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v6-hem-v2.png"
CONTACT = EVIDENCE / "charcoal-tapered-chinos-canonical-sitting-v6-hem-v2-contact.png"
CANVAS = (256, 384)
GARMENT_ZONE = (76, 272, 180, 341)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != CANVAS:
        raise ValueError(f"master must be {CANVAS}")
    pixels = np.asarray(master).copy()
    height, width = pixels.shape[:2]
    y, x = np.indices((height, width))
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    # The image-authored charcoal fabric is the only dark material within the
    # locked seated lower-body zone. Shoes are tan and stay in their canonical
    # layer above it; limbs remain outside the horizontal garment envelope.
    mask = (
        (x >= GARMENT_ZONE[0]) & (x < GARMENT_ZONE[2])
        & (y >= GARMENT_ZONE[1]) & (y < GARMENT_ZONE[3])
        & (red < 112) & (green < 112) & (blue < 112)
    )
    pixels[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    pixels[~mask, :3] = 0
    return Image.fromarray(pixels)


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


def review_image(bottom: Image.Image, full: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1024, 520), "#fff9fc")
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    draw.text((24, 20), "CHARCOAL TAPERED CHINOS · CANONICAL SITTING V6", font=font, fill="#412c39")
    draw.text((24, 52), "On-base master extraction; canonical base and canonical shoes retained", font=small, fill="#806a77")
    board.paste(full.convert("RGB"), (140, 88))
    crop = full.crop((70, 260, 188, 354)).resize((472, 376), Image.Resampling.NEAREST)
    board.paste(crop.convert("RGB"), (490, 108))
    draw.text((490, 84), "4× waist · seated thighs · hem · shoes", font=small, fill="#412c39")
    return board


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bottom = extract_bottom(load(MASTER))
    bottom.save(OUTPUT, optimize=True)
    full = canonical_composite(bottom)
    full.convert("RGB").save(COMPOSITE, optimize=True)
    review_image(bottom, full).save(CONTACT, optimize=True)
    print(OUTPUT)
    print(COMPOSITE)
    print(CONTACT)


if __name__ == "__main__":
    main()
