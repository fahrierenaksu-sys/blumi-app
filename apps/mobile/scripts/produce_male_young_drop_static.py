#!/usr/bin/env python3
"""Create static-fit candidates for the young male wardrobe drop.

This stays deliberately outside the live catalog. It accepts only independently
generated chroma-key sources that were already alpha-extracted, fits one item at
a time to the canonical male envelope, and writes reviewable static evidence.
Motion and catalog promotion remain separate gates.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from refit_male_wardrobe_static import (
    TOP_FIT_PROFILES,
    apply_top_fit_profile,
    build_bottom_candidate_from_master,
    fit_shoe_source as canonical_fit_shoe_source,
    load_reillustrated_bottom_master,
    reillustrated_bottom_master_path,
)


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-young-drop/2026-07-18"
SOURCES = ROOT / "docs/avatar-motion-pipeline/render-sources/male-young-drop/2026-07-18"
CANDIDATES = EVIDENCE / "candidate-layers/static"
COMPOSITES = EVIDENCE / "static-composites"
RECORDS = EVIDENCE / "static-records"
CANVAS = (256, 384)
RIG_ID = "blumi_2_5d_layered_v1"
FIT_PROFILE_ID = "blumi_male_room_avatar_v1"

@dataclass(frozen=True)
class Item:
    slug: str
    category: str
    role: str
    label: str
    accessory_group: str | None = None


ITEMS = (
    Item("retro_colorblock_runner", "shoes", "shoes", "Retro Color-Block Runner"),
    Item("chunky_skate_sneakers", "shoes", "shoes", "Chunky Skate Sneakers"),
    Item("suede_penny_mules", "shoes", "shoes", "Suede Penny Mules"),
    Item("lightweight_trail_sneakers", "shoes", "shoes", "Lightweight Trail Sneakers"),
    Item("soft_patch_beanie", "accessory", "headwear", "Soft Patch Beanie", "headwear"),
    Item("nylon_crossbody_bag", "accessory", "bag", "Nylon Crossbody Bag", "bag"),
    Item("beaded_charm_necklace", "accessory", "neck", "Beaded Charm Necklace", "neck"),
    Item("tinted_star_glasses", "accessory", "eyewear", "Tinted Star Glasses", "eyewear"),
    Item("washed_baggy_denim", "bottom", "bottom", "Washed Baggy Denim"),
    Item("soft_parachute_cargo_pants", "bottom", "bottom", "Soft Parachute Cargo Pants"),
    Item("colorblock_nylon_track_pants", "bottom", "bottom", "Color-Block Nylon Track Pants"),
    Item("striped_chunky_cardigan", "top", "top", "Striped Chunky Cardigan"),
    Item("colorblock_rugby_polo", "top", "top", "Color-Block Rugby Polo"),
    Item("pixel_heart_boxy_tee", "top", "top", "Pixel Heart Boxy Tee"),
    Item("soft_varsity_knit_jacket", "top", "top", "Soft Varsity Knit Jacket"),
    Item("soft_panel_overshirt_bomber", "top", "top", "Soft Panel Overshirt Bomber"),
)
ITEMS_BY_SLUG = {item.slug: item for item in ITEMS}
FIT_BOXES = {
    "top": (82, 214, 174, 300),
    "bottom": (96, 286, 160, 344),
    "shoes": (96, 322, 160, 350),
    "headwear": (90, 80, 166, 150),
    "bag": (94, 218, 162, 286),
    "neck": (100, 214, 156, 246),
    "eyewear": (100, 152, 158, 176),
}


def clean(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    result.putdata([(0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha) for red, green, blue, alpha in result.getdata()])
    return result


def load_source(item: Item) -> Image.Image:
    path = SOURCES / f"{item.slug}-alpha.png"
    if not path.exists():
        raise FileNotFoundError(f"missing alpha source: {path}")
    image = clean(Image.open(path))
    bounds = image.getchannel("A").point(lambda value: 255 if value > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"source alpha is empty: {path}")
    return image.crop(bounds)


def fit_to_box(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    width, height = box[2] - box[0], box[3] - box[1]
    fitted = image.resize((width, height), Image.Resampling.LANCZOS)
    output.alpha_composite(fitted, box[:2])
    return clean(output)


def fit(item: Item) -> Image.Image:
    if item.role == "top":
        profile = TOP_FIT_PROFILES.get(item.slug)
        if profile is None:
            raise ValueError(f"missing construction-aware male top profile: {item.slug}")
        return apply_top_fit_profile(fit_to_box(load_source(item), profile.box), profile)
    if item.role == "bottom":
        return build_bottom_candidate_from_master(
            item.slug,
            load_reillustrated_bottom_master(item.slug),
        )
    if item.role == "shoes":
        return canonical_fit_shoe_source(item.slug, load_source(item))
    box = FIT_BOXES[item.role]
    return fit_to_box(load_source(item), box)


def load_room(name: str) -> Image.Image:
    image = clean(Image.open(ROOM / name))
    if image.size != CANVAS:
        raise ValueError(f"{name}: expected {CANVAS}, got {image.size}")
    return image


def composite(item: Item, layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    defaults = (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
        "avatar_room_bottom_male_navy_straight_pants_v1.png",
        "avatar_room_top_male_powder_blue_crew_tee_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    for name in defaults:
        if item.category == "top" and name.endswith("top_male_powder_blue_crew_tee_v1.png"):
            continue
        if item.category == "bottom" and name.endswith("bottom_male_navy_straight_pants_v1.png"):
            continue
        if item.category == "shoes" and name.endswith("shoes_male_milk_tea_court_v1.png"):
            continue
        if item.role == "headwear" and name.endswith("avatar_room_hair_front_male_espresso_crop_v1.png"):
            result.alpha_composite(layer)
        result.alpha_composite(load_room(name))
    if item.role != "headwear":
        result.alpha_composite(layer)
    return clean(result)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size)
    except OSError:
        return ImageFont.load_default()


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    output = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(255, 253, 254) if (x // cell + y // cell) % 2 else (241, 235, 239))
    return output


def render_sheet(item: Item, layer: Image.Image, avatar: Image.Image) -> Path:
    sheet = Image.new("RGB", (684, 492), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 18), f"{item.label} · STATIC FIT", font=font(18, True), fill=(69, 43, 57))
    draw.text((20, 45), "Canonical male rig · candidate only · pre-motion", font=font(12), fill=(126, 104, 116))
    alpha_panel = checkerboard(CANVAS)
    alpha_panel.paste(layer, (0, 0), layer)
    sheet.paste(alpha_panel, (30, 84))
    sheet.paste(avatar, (338, 84), avatar)
    draw.text((104, 432), "alpha layer", font=font(13, True), fill=(69, 43, 57))
    draw.text((405, 432), "body-fit composite", font=font(13, True), fill=(69, 43, 57))
    path = EVIDENCE / f"static-{item.slug}-proof.png"
    sheet.save(path, optimize=True)
    return path


def bounds(image: Image.Image) -> list[int]:
    result = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if result is None:
        raise ValueError("candidate alpha is empty")
    return list(result)


def production_source_path(item: Item) -> Path:
    if item.role == "bottom":
        return reillustrated_bottom_master_path(item.slug)
    return SOURCES / f"{item.slug}-alpha.png"


def run(slug: str) -> None:
    item = ITEMS_BY_SLUG[slug]
    for path in (EVIDENCE, CANDIDATES, COMPOSITES, RECORDS):
        path.mkdir(parents=True, exist_ok=True)
    layer = fit(item)
    candidate_path = CANDIDATES / f"{slug}.png"
    composite_path = COMPOSITES / f"{slug}.png"
    layer.save(candidate_path, optimize=True)
    avatar = composite(item, layer)
    avatar.save(composite_path, optimize=True)
    proof = render_sheet(item, layer, avatar)
    record = {
        "schemaVersion": 1,
        "phase": "static-fit-candidate",
        "rigId": RIG_ID,
        "fitProfileId": FIT_PROFILE_ID,
        "staticFitVerdict": "CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
        "motionOrCatalogProduced": False,
        "item": asdict(item),
        "sourcePath": str(production_source_path(item).relative_to(ROOT)),
        "candidatePath": str(candidate_path.relative_to(ROOT)),
        "compositePath": str(composite_path.relative_to(ROOT)),
        "proofPath": str(proof.relative_to(ROOT)),
        "canvas": list(CANVAS),
        "alphaBounds": bounds(layer),
    }
    (RECORDS / f"{slug}.json").write_text(json.dumps(record, indent=2) + "\n")
    print(proof)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True, choices=sorted(ITEMS_BY_SLUG))
    args = parser.parse_args()
    run(args.slug)


if __name__ == "__main__":
    main()
