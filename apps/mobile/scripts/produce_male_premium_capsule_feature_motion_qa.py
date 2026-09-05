#!/usr/bin/env python3
"""Render motion-state QA previews for fixed-head male hair and eyewear layers."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16"
OUTPUT = EVIDENCE / "feature-motion-qa"
V3_EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
V3_OUTPUT = V3_EVIDENCE / "male-sunglasses-and-hair-wave2-v3-motion-qa"
CANVAS = (256, 384)
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")
PILOT_FEATURES = (("accessory", "slim_oval_glasses"), ("hair_front", "soft_textured_crop"))
ALL_FEATURES = (
    ("accessory", "slim_oval_glasses"),
    ("accessory", "soft_rectangular_glasses"),
    ("accessory", "translucent_wrap_glasses"),
    ("accessory", "tortoiseshell_smoke_sunglasses"),
    ("accessory", "matte_black_panto_sunglasses"),
    ("hair_front", "soft_textured_crop"),
    ("hair_front", "medium_curtain_middle_part"),
    ("hair_front", "controlled_modern_mullet"),
    ("hair_front", "voluminous_wavy_quiff"),
    ("hair_front", "short_twists_textured_style"),
    ("hair_front", "copper_compact_quiff"),
    ("hair_front", "ash_blond_low_fade_crop"),
    ("hair_front", "blue_black_short_curls"),
)
FEATURE_BY_SLUG = {slug: (kind, slug) for kind, slug in ALL_FEATURES}
V3_SLUGS = {
    "tortoiseshell_smoke_sunglasses",
    "matte_black_panto_sunglasses",
    "copper_compact_quiff",
    "ash_blond_low_fade_crop",
    "blue_black_short_curls",
}


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def motion(name: str, state: str) -> Path:
    pose, frame = state.rsplit("_f", 1)
    return MOTION / f"room_avatar_{name}_{pose}_f{frame}.png"


def composite(kind: str, slug: str, state: str) -> Image.Image:
    image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    image.alpha_composite(load(motion("base_male_light_v1", state)))
    image.alpha_composite(load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"))
    image.alpha_composite(load(motion("top_male_powder_blue_crew_tee_v1", state)))
    image.alpha_composite(load(motion("bottom_male_navy_straight_pants_v1", state)))
    image.alpha_composite(load(motion("shoes_male_milk_tea_court_v1", state)))
    if kind == "accessory":
        image.alpha_composite(load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    image.alpha_composite(load(ROOM / f"avatar_room_{kind}_male_{slug}_v1.png"))
    return image


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size)
    except OSError:
        return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slugs", help="comma-separated fixed-head feature slugs; defaults to the reviewed pilot")
    args = parser.parse_args()
    requested = [] if not args.slugs else [slug for slug in args.slugs.split(",") if slug]
    unknown = sorted(set(requested) - FEATURE_BY_SLUG.keys())
    if unknown:
        raise SystemExit(f"unknown feature slugs: {', '.join(unknown)}")
    selected = PILOT_FEATURES if not requested else tuple(FEATURE_BY_SLUG[slug] for slug in requested)
    v3_review = bool(requested) and {slug for _, slug in selected} == V3_SLUGS
    output_root = V3_OUTPUT if v3_review else OUTPUT
    items = []
    for kind, slug in selected:
        directory = output_root / slug
        directory.mkdir(parents=True, exist_ok=True)
        frames = {}
        sheet = Image.new("RGB", (5 * 190, 330), (255, 248, 251))
        draw = ImageDraw.Draw(sheet)
        draw.text((18, 14), f"{slug} · MOTION-STATE QA", font=font(17, True), fill=(69, 43, 57))
        for index, state in enumerate(STATES):
            image = composite(kind, slug, state)
            path = directory / f"{state}.png"
            image.save(path, optimize=True)
            frames[state] = str(path.relative_to(ROOT))
            preview = image.resize((128, 192), Image.Resampling.NEAREST)
            x = 22 + index * 190
            sheet.paste(preview, (x, 58), preview)
            draw.text((x, 260), state.replace("_front_", " "), font=font(11, True), fill=(69, 43, 57))
        sheet_path = directory / "motion-contact-sheet.png"
        sheet.save(sheet_path, optimize=True)
        items.append({"kind": kind, "slug": slug, "frames": frames, "contactSheet": str(sheet_path.relative_to(ROOT))})
    output = "pilot-feature-motion-manifest.json" if selected == PILOT_FEATURES else f"feature-motion-{selected[0][1]}-manifest.json"
    phase = "pilot-feature-motion-qa" if selected == PILOT_FEATURES else "single-feature-motion-qa"
    manifest_root = V3_EVIDENCE if v3_review else EVIDENCE
    manifest_name = "male-sunglasses-and-hair-wave2-v3-motion-manifest.json" if v3_review else output
    manifest_root.mkdir(parents=True, exist_ok=True)
    (manifest_root / manifest_name).write_text(json.dumps({"phase": phase, "items": items}, indent=2) + "\n")


if __name__ == "__main__":
    main()
