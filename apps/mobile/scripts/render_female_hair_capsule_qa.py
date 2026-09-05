#!/usr/bin/env python3
"""Render independent front QA sheets for the current female hair capsule."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/feature-qa"
BG = (247, 237, 244, 255)
HAIR_CANDIDATES = (
    ("copper_bow_waves", "Copper Bow Waves"),
    ("golden_waves", "Golden Waves"),
    ("ink_twin_braids", "Ink Twin Braids"),
    ("ink_pageboy_star", "Ink Pageboy Star"),
    ("pale_golden_bow_bob", "Pale Golden Bow Bob"),
)
SLUGS = tuple(
    (slug, name)
    for slug, name in HAIR_CANDIDATES
    if (ROOM / f"avatar_room_hair_back_female_{slug}_v2.png").exists()
    and (ROOM / f"avatar_room_hair_front_female_{slug}_v2.png").exists()
    and all(
        (
            MOTION
            / f"room_avatar_hair_{part}_female_{slug}_v2_walking_front_f0{frame}.png"
        ).exists()
        for part in ("back", "front")
        for frame in range(1, 5)
    )
)
STATES = ((None, "Static"), ("walking_front_f01", "Walk 01"),
          ("walking_front_f02", "Walk 02"), ("walking_front_f03", "Walk 03"),
          ("walking_front_f04", "Walk 04"), ("sitting_front_f01", "Sit 01"))


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


def load(prefix: str, suffix: str | None) -> Image.Image:
    path = (MOTION / f"room_avatar_{prefix}_{suffix}.png") if suffix else (ROOM / f"avatar_room_{prefix}.png")
    return Image.open(path).convert("RGBA")


def compose(slug: str, suffix: str | None) -> Image.Image:
    image = Image.new("RGBA", (256, 384), BG)
    layers = (
        # Match ROOM_AVATAR_LAYER_ORDER exactly: hairBack is behind the body,
        # while hairFront is the final head layer above clothing.
        f"hair_back_female_{slug}_v2",
        "base_female_v2",
        "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
        "bottom_female_denim_skort_shorts_v2",
        "shoes_female_milk_tea_court_sneakers_v2",
        "top_female_cream_basic_tee_v2",
        f"hair_front_female_{slug}_v2",
    )
    for prefix in layers:
        image.alpha_composite(load(prefix, suffix))
    return image


def main() -> None:
    if not SLUGS:
        raise SystemExit("No complete hair capsule found; static and 4W layers are required.")
    OUT.mkdir(parents=True, exist_ok=True)
    full = Image.new("RGBA", (len(STATES) * 280, len(SLUGS) * 440), BG)
    draw = ImageDraw.Draw(full)
    for row, (slug, name) in enumerate(SLUGS):
        for column, (suffix, label) in enumerate(STATES):
            x, y = column * 280, row * 440
            draw.text((x + 6, y + 8), f"{name} · {label}", fill=(60, 40, 60, 255), font=font(14))
            full.alpha_composite(compose(slug, suffix), (x + 12, y + 34))
    full.convert("RGB").save(OUT / "2026-07-15-female-hair-static-4w1s-contact-sheet.png", optimize=True)

    close = Image.new("RGBA", (len(SLUGS) * 760, 820), BG)
    draw = ImageDraw.Draw(close)
    for index, (slug, name) in enumerate(SLUGS):
        image = compose(slug, None).crop((38, 66, 218, 250)).resize((720, 736), Image.Resampling.NEAREST)
        close.alpha_composite(image, (index * 760, 42))
        draw.text((index * 760 + 6, 8), name, fill=(60, 40, 60, 255), font=font(16))
    close.convert("RGB").save(OUT / "2026-07-15-female-hair-head-closeup-8x.png", optimize=True)


if __name__ == "__main__":
    main()
