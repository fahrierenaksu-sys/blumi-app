#!/usr/bin/env python3
"""Build 4W+1S candidates from reviewed static layers for the young male drop.

The source artwork is never redrawn here. This script only creates conservative
pose variants on the canonical 256x384 male rig and writes contact sheets for
visual review before catalog promotion.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-young-drop/2026-07-18"
STATIC = EVIDENCE / "candidate-layers/static"
OUTPUT = EVIDENCE / "motion-candidates"
CANVAS = (256, 384)
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")

ITEMS = (
    ("shoes", "retro_colorblock_runner", "body"),
    ("shoes", "chunky_skate_sneakers", "body"),
    ("shoes", "suede_penny_mules", "body"),
    ("shoes", "lightweight_trail_sneakers", "body"),
    ("accessory", "soft_patch_beanie", "fixed"),
    ("accessory", "nylon_crossbody_bag", "fixed"),
    ("accessory", "beaded_charm_necklace", "fixed"),
    ("accessory", "tinted_star_glasses", "fixed"),
    ("bottom", "washed_baggy_denim", "body"),
    ("bottom", "soft_parachute_cargo_pants", "body"),
    ("bottom", "colorblock_nylon_track_pants", "body"),
    ("top", "striped_chunky_cardigan", "body"),
    ("top", "colorblock_rugby_polo", "body"),
    ("top", "pixel_heart_boxy_tee", "body"),
    ("top", "soft_varsity_knit_jacket", "body"),
    ("top", "soft_panel_overshirt_bomber", "body"),
)
HEADWEAR_SLUGS = {"soft_patch_beanie"}


def clean(image: Image.Image) -> Image.Image:
    output = image.convert("RGBA")
    output.putdata([(0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha) for red, green, blue, alpha in output.getdata()])
    return output


def load(path: Path) -> Image.Image:
    image = clean(Image.open(path))
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(image, (dx, dy))
    return clean(output)


def top_frame(source: Image.Image, state: str) -> Image.Image:
    if state == "walking_front_f01":
        return source.copy()
    if state == "sitting_front_f01":
        return clean(source.transform(CANVAS, Image.Transform.AFFINE, (1, 0, 0, 0, 1.06, -18), Image.Resampling.BICUBIC))
    shear = {"walking_front_f02": 0.020, "walking_front_f03": -0.020, "walking_front_f04": 0.010}[state]
    return clean(source.transform(CANVAS, Image.Transform.AFFINE, (1, shear, -214 * shear, 0, 1, 0), Image.Resampling.BICUBIC))


def split_leg_frame(source: Image.Image, state: str, top_y: int, split_y: int, bottom_y: int) -> Image.Image:
    offsets = {
        "walking_front_f01": ((0, 0), (0, 0)),
        "walking_front_f02": ((-2, 1), (2, -1)),
        "walking_front_f03": ((2, -1), (-2, 1)),
        "walking_front_f04": ((-1, 1), (2, -1)),
        "sitting_front_f01": ((-3, 1), (3, 1)),
    }
    left, right = offsets[state]
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(source.crop((0, 0, 256, split_y)), (0, 0))
    output.alpha_composite(source.crop((84, split_y, 128, bottom_y)), (84 + left[0], split_y + left[1]))
    output.alpha_composite(source.crop((128, split_y, 172, bottom_y)), (128 + right[0], split_y + right[1]))
    return clean(output)


def body_frame(category: str, source: Image.Image, state: str) -> Image.Image:
    if category == "top":
        return top_frame(source, state)
    if category == "bottom":
        return split_leg_frame(source, state, 278, 308, 354)
    if category == "shoes":
        return split_leg_frame(source, state, 326, 338, 360)
    raise ValueError(f"unsupported animated category: {category}")


def motion_name(category: str, slug: str, state: str) -> str:
    return f"room_avatar_{category}_male_{slug}_v1_{state}.png"


def load_pose(name: str, state: str) -> Image.Image:
    return load(MOTION / f"room_avatar_{name}_v1_{state}.png")


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size)
    except OSError:
        return ImageFont.load_default()


def contact_sheet(category: str, slug: str, frames: dict[str, Image.Image]) -> Path:
    sheet = Image.new("RGB", (6 * 196, 350), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 14), f"{slug} · 4W+1S MOTION QA", font=font(17, True), fill=(69, 43, 57))
    for index, state in enumerate(STATES):
        image = composite_for_slug(category, slug, state, frames[state]).resize((128, 192), Image.Resampling.NEAREST)
        x = 22 + index * 196
        sheet.paste(image, (x, 58), image)
        draw.text((x, 260), state.replace("_front_", " "), font=font(11, True), fill=(69, 43, 57))
    path = OUTPUT / slug / "motion-contact-sheet.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, optimize=True)
    return path


def composite_for_slug(category: str, slug: str, state: str, layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(load_pose("base_male_light", state))
    result.alpha_composite(load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"))
    if category != "shoes":
        result.alpha_composite(load_pose("shoes_male_milk_tea_court", state))
    if category != "bottom":
        result.alpha_composite(load_pose("bottom_male_navy_straight_pants", state))
    if category != "top":
        result.alpha_composite(load_pose("top_male_powder_blue_crew_tee", state))
    if slug in HEADWEAR_SLUGS:
        result.alpha_composite(layer)
    result.alpha_composite(load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    if slug not in HEADWEAR_SLUGS:
        result.alpha_composite(layer)
    return clean(result)


def run() -> None:
    MOTION.mkdir(parents=True, exist_ok=True)
    records = []
    for category, slug, treatment in ITEMS:
        static = STATIC / f"{slug}.png"
        if not static.exists():
            raise FileNotFoundError(f"missing reviewed static candidate: {static}")
        room_static = ROOM / f"avatar_room_{category}_male_{slug}_v1.png"
        shutil.copy2(static, room_static)
        source = load(static)
        frames = {state: source.copy() if treatment == "fixed" else body_frame(category, source, state) for state in STATES}
        candidate_dir = OUTPUT / slug
        candidate_dir.mkdir(parents=True, exist_ok=True)
        generated = []
        if treatment == "body":
            for state, frame in frames.items():
                candidate = candidate_dir / f"{state}.png"
                target = MOTION / motion_name(category, slug, state)
                frame.save(candidate, optimize=True)
                frame.save(target, optimize=True)
                generated.append(str(target.relative_to(ROOT)))
        contact = contact_sheet(category, slug, frames)
        records.append({
            "category": category,
            "slug": slug,
            "motionTreatment": treatment,
            "staticPath": str(room_static.relative_to(ROOT)),
            "motionPaths": generated,
            "states": list(STATES),
            "contactSheet": str(contact.relative_to(ROOT)),
        })
    manifest = {
        "schemaVersion": 1,
        "phase": "motion-candidate",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "catalogPromoted": False,
        "items": records,
    }
    (EVIDENCE / "motion-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    run()
