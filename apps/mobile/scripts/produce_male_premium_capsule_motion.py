#!/usr/bin/env python3
"""Stage pose-specific 4W+1S motion candidates for approved male capsule clothing.

This intentionally stays outside the live registry: independent visual QA must pass
the staged frames before a layer is promoted into the room catalog.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16"
OUTPUT = EVIDENCE / "motion-candidates"
CANVAS = (256, 384)


@dataclass(frozen=True)
class Clothing:
    category: str
    slug: str


PILOT_CLOTHING = (
    Clothing("top", "tonal_geometric_camp_collar_shirt"),
    Clothing("top", "cropped_cocoa_moto_jacket"),
    Clothing("bottom", "wide_pleated_technical_trousers"),
    Clothing("top", "midnight_relaxed_tailoring_jacket"),
    Clothing("bottom", "midnight_relaxed_tailoring_trousers"),
    Clothing("top", "acid_washed_boxy_sweatshirt"),
)
ALL_CLOTHING = (
    Clothing("top", "tonal_geometric_camp_collar_shirt"),
    Clothing("top", "asymmetric_utility_overshirt"),
    Clothing("top", "abstract_resort_shirt"),
    Clothing("top", "cropped_cocoa_moto_jacket"),
    Clothing("top", "charcoal_leather_bomber_hybrid"),
    Clothing("bottom", "wide_pleated_technical_trousers"),
    Clothing("bottom", "straight_utility_tailored_trousers"),
    Clothing("top", "midnight_relaxed_tailoring_jacket"),
    Clothing("bottom", "midnight_relaxed_tailoring_trousers"),
    Clothing("top", "warm_sand_deconstructed_jacket"),
    Clothing("bottom", "warm_sand_deconstructed_trousers"),
    Clothing("top", "acid_washed_boxy_sweatshirt"),
    Clothing("top", "diagonal_seam_zip_mock_neck"),
    Clothing("top", "textured_knit_polo"),
    Clothing("top", "monochrome_street_tailoring_top"),
    Clothing("bottom", "monochrome_street_tailoring_bottom"),
    Clothing("top", "modern_track_luxury_top"),
    Clothing("bottom", "modern_track_luxury_bottom"),
    Clothing("top", "contemporary_resort_street_top"),
    Clothing("bottom", "contemporary_resort_street_bottom"),
    Clothing("top", "creative_utility_top"),
    Clothing("bottom", "creative_utility_bottom"),
    Clothing("bottom", "relaxed_tailored_shorts"),
    Clothing("bottom", "refined_utility_cargo_shorts"),
    Clothing("bottom", "technical_sport_shorts"),
)
CLOTHING_BY_SLUG = {item.slug: item for item in ALL_CLOTHING}
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")


def clean(image: Image.Image) -> Image.Image:
    output = image.convert("RGBA")
    output.putdata([(0, 0, 0, 0) if a == 0 else (r, g, b, a) for r, g, b, a in output.getdata()])
    return output


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return clean(image)


def static_path(item: Clothing) -> Path:
    return ROOM / f"avatar_room_{item.category}_male_{item.slug}_v1.png"


def top_frame(source: Image.Image, state: str) -> Image.Image:
    if state == "walking_front_f01":
        return source.copy()
    if state == "sitting_front_f01":
        # The collar stays anchored while the mid-torso compresses gently to the seated hip.
        return clean(source.transform(CANVAS, Image.Transform.AFFINE, (1, 0, 0, 0, 1.06, -18), Image.Resampling.BICUBIC))
    shear = {"walking_front_f02": 0.020, "walking_front_f03": -0.020, "walking_front_f04": 0.010}[state]
    # The shoulder/collar row remains in place; only the sleeve and hem drift with the step.
    return clean(source.transform(CANVAS, Image.Transform.AFFINE, (1, shear, -214 * shear, 0, 1, 0), Image.Resampling.BICUBIC))


def bottom_frame(source: Image.Image, state: str) -> Image.Image:
    offsets = {
        "walking_front_f01": ((0, 0), (0, 0)),
        "walking_front_f02": ((-2, 1), (2, -1)),
        "walking_front_f03": ((2, -1), (-2, 1)),
        "walking_front_f04": ((-1, 1), (2, -1)),
        "sitting_front_f01": ((-4, 2), (4, 2)),
    }
    left, right = offsets[state]
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    # The waistband/crotch hinge stays continuous; only the lower legs follow the pose.
    output.alpha_composite(source.crop((0, 0, 256, 316)), (0, 0))
    output.alpha_composite(source.crop((88, 308, 128, 352)), (88 + left[0], 308 + left[1]))
    output.alpha_composite(source.crop((128, 308, 168, 352)), (128 + right[0], 308 + right[1]))
    return clean(output)


def candidate_frame(item: Clothing, state: str) -> Image.Image:
    source = load(static_path(item))
    return top_frame(source, state) if item.category == "top" else bottom_frame(source, state)


def motion_path(name: str, state: str) -> Path:
    pose, frame = state.rsplit("_f", 1)
    return MOTION / f"room_avatar_{name}_{pose}_f{frame}.png"


def pose_composite(item: Clothing, state: str, candidate: Image.Image) -> Image.Image:
    if state == "walking_front_f01" or state.startswith("walking"):
        pose = state
    else:
        pose = state
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(load(motion_path("base_male_light_v1", pose)))
    result.alpha_composite(load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"))
    if item.category == "bottom":
        result.alpha_composite(load(motion_path("top_male_powder_blue_crew_tee_v1", pose)))
    else:
        result.alpha_composite(load(motion_path("bottom_male_navy_straight_pants_v1", pose)))
    result.alpha_composite(load(motion_path("shoes_male_milk_tea_court_v1", pose)))
    result.alpha_composite(load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    result.alpha_composite(candidate)
    return clean(result)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size)
    except OSError:
        return ImageFont.load_default()


def contact_sheet(item: Clothing, frames: dict[str, Image.Image]) -> Path:
    sheet = Image.new("RGB", (6 * 196, 350), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 14), f"{item.slug} · 4W+1S MOTION QA", font=font(17, True), fill=(69, 43, 57))
    for index, state in enumerate(STATES):
        composite = pose_composite(item, state, frames[state]).resize((128, 192), Image.Resampling.NEAREST)
        x = 22 + index * 196
        sheet.paste(composite, (x, 58), composite)
        draw.text((x, 260), state.replace("_front_", " "), font=font(11, True), fill=(69, 43, 57))
    path = OUTPUT / item.slug / "motion-contact-sheet.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slugs", help="comma-separated approved clothing slugs; defaults to the reviewed pilot")
    args = parser.parse_args()
    requested = [] if not args.slugs else [slug for slug in args.slugs.split(",") if slug]
    unknown = sorted(set(requested) - CLOTHING_BY_SLUG.keys())
    if unknown:
        raise SystemExit(f"unknown clothing slugs: {', '.join(unknown)}")
    selected = PILOT_CLOTHING if not requested else tuple(CLOTHING_BY_SLUG[slug] for slug in requested)
    records = []
    for item in selected:
        destination = OUTPUT / item.slug
        destination.mkdir(parents=True, exist_ok=True)
        frames = {state: candidate_frame(item, state) for state in STATES}
        for state, frame in frames.items():
            frame.save(destination / f"{state}.png", optimize=True)
        contact = contact_sheet(item, frames)
        records.append({"category": item.category, "slug": item.slug, "states": list(STATES), "contactSheet": str(contact.relative_to(ROOT))})
    is_full_batch = selected == ALL_CLOTHING
    manifest = {
        "schemaVersion": 1,
        "phase": "pilot-motion-staging" if selected == PILOT_CLOTHING else "full-motion-staging" if is_full_batch else "single-item-motion-staging",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "liveCatalogPromoted": False,
        "items": records,
    }
    output = "pilot-motion-manifest.json" if selected == PILOT_CLOTHING else "full-motion-manifest.json" if is_full_batch else f"motion-{selected[0].slug}-manifest.json"
    (EVIDENCE / output).write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
