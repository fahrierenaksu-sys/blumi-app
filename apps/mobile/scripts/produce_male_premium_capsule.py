#!/usr/bin/env python3
"""Produce static-fit candidates for the original Blumi male premium capsule.

The script only accepts individually generated, chroma-keyed source renders.
It fits one approved source at a time to the canonical male room envelope,
creates proof composites, and never creates motion or catalog entries.
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
    load_reillustrated_bottom_master,
    reillustrated_bottom_master_path,
)


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16"
SOURCE_ALPHA = EVIDENCE / "source-alpha"
CANDIDATES = EVIDENCE / "candidate-layers/static"
COMPOSITES = EVIDENCE / "static-composites"
STATIC_RECORDS = EVIDENCE / "static-records"
CANVAS = (256, 384)
RIG_ID = "blumi_2_5d_layered_v1"
FIT_PROFILE_ID = "blumi_male_room_avatar_v1"

@dataclass(frozen=True)
class Item:
    slug: str
    category: str
    role: str
    label: str
    pilot: bool


ITEMS = (
    Item("tonal_geometric_camp_collar_shirt", "top", "top", "Tonal Geometric Camp-Collar Shirt", True),
    Item("asymmetric_utility_overshirt", "top", "top", "Asymmetric Utility Overshirt", False),
    Item("abstract_resort_shirt", "top", "top", "Abstract Resort Shirt", False),
    Item("cropped_cocoa_moto_jacket", "top", "top", "Cropped Cocoa Moto Jacket", True),
    Item("charcoal_leather_bomber_hybrid", "top", "top", "Charcoal Leather Bomber Hybrid", False),
    Item("wide_pleated_technical_trousers", "bottom", "trouser", "Wide Pleated Technical Trousers", True),
    Item("straight_utility_tailored_trousers", "bottom", "trouser", "Straight Utility-Tailored Trousers", False),
    Item("midnight_relaxed_tailoring_jacket", "top", "top", "Midnight Relaxed Tailoring Jacket", True),
    Item("midnight_relaxed_tailoring_trousers", "bottom", "trouser", "Midnight Relaxed Tailoring Trousers", True),
    Item("warm_sand_deconstructed_jacket", "top", "top", "Warm Sand Deconstructed Jacket", False),
    Item("warm_sand_deconstructed_trousers", "bottom", "trouser", "Warm Sand Deconstructed Trousers", False),
    Item("acid_washed_boxy_sweatshirt", "top", "top", "Acid-Washed Boxy Sweatshirt", True),
    Item("diagonal_seam_zip_mock_neck", "top", "top", "Diagonal-Seam Zip Mock-Neck", False),
    Item("textured_knit_polo", "top", "top", "Textured Knit Polo", False),
    Item("monochrome_street_tailoring_top", "top", "top", "Monochrome Street Tailoring Top", False),
    Item("monochrome_street_tailoring_bottom", "bottom", "trouser", "Monochrome Street Tailoring Trousers", False),
    Item("modern_track_luxury_top", "top", "top", "Modern Track-Luxury Zip Top", False),
    Item("modern_track_luxury_bottom", "bottom", "trouser", "Modern Track-Luxury Trousers", False),
    Item("contemporary_resort_street_top", "top", "top", "Contemporary Resort-Street Top", False),
    Item("contemporary_resort_street_bottom", "bottom", "trouser", "Contemporary Resort-Street Fluid Bottom", False),
    Item("creative_utility_top", "top", "top", "Creative Utility Overshirt", False),
    Item("creative_utility_bottom", "bottom", "trouser", "Creative Utility Trousers", False),
    Item("relaxed_tailored_shorts", "bottom", "short", "Relaxed Tailored Shorts", False),
    Item("refined_utility_cargo_shorts", "bottom", "short", "Refined Utility Cargo Shorts", False),
    Item("technical_sport_shorts", "bottom", "short", "Premium Technical Sport Shorts", False),
    Item("slim_oval_glasses", "accessory", "glasses", "Slim Oval Glasses", True),
    Item("soft_rectangular_glasses", "accessory", "glasses", "Soft Rectangular Glasses", False),
    Item("translucent_wrap_glasses", "accessory", "glasses", "Translucent Modern Wrap Glasses", False),
    Item("soft_textured_crop", "hair_front", "hair", "Soft Textured Crop", True),
    Item("medium_curtain_middle_part", "hair_front", "hair", "Medium Curtain Middle-Part", False),
    Item("controlled_modern_mullet", "hair_front", "hair", "Controlled Modern Mullet", False),
    Item("voluminous_wavy_quiff", "hair_front", "hair", "Voluminous Wavy Quiff", False),
    Item("short_twists_textured_style", "hair_front", "hair", "Short Twists Textured Style", False),
)
ITEMS_BY_SLUG = {item.slug: item for item in ITEMS}


def clean(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    result.putdata([
        (0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha)
        for red, green, blue, alpha in result.getdata()
    ])
    return result


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def source(item: Item) -> Image.Image:
    path = SOURCE_ALPHA / f"{item.slug}.png"
    if not path.exists():
        raise FileNotFoundError(f"missing alpha source: {path}")
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").point(lambda value: 255 if value > 32 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"source alpha is empty: {path}")
    return image.crop(bbox)


def fit_to_box(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    width = box[2] - box[0]
    height = box[3] - box[1]
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    fitted = image.resize((width, height), Image.Resampling.LANCZOS)
    result.alpha_composite(fitted, box[:2])
    return clean(result)


def fit(item: Item) -> Image.Image:
    if item.role in {"trouser", "short"}:
        return build_bottom_candidate_from_master(
            item.slug,
            load_reillustrated_bottom_master(item.slug),
        )
    render = source(item)
    if item.role == "top":
        profile = TOP_FIT_PROFILES.get(item.slug)
        if profile is None:
            raise ValueError(f"missing construction-aware male top profile: {item.slug}")
        return apply_top_fit_profile(fit_to_box(render, profile.box), profile)
    if item.role == "glasses":
        return fit_to_box(render, (91, 146, 165, 181))
    if item.role == "hair":
        return fit_to_box(render, (82, 72, 174, 187))
    raise ValueError(f"unsupported role: {item.role}")


def runtime_path(item: Item) -> Path:
    return ROOM / f"avatar_room_{item.category}_male_{item.slug}_v1.png"


def production_source_path(item: Item) -> Path:
    if item.role in {"trouser", "short"}:
        return reillustrated_bottom_master_path(item.slug)
    return SOURCE_ALPHA / f"{item.slug}.png"


def load_layer(name: str) -> Image.Image:
    path = ROOM / name
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def avatar_composite(item: Item, layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    shoe_layer = (
        "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1.png"
        if item.slug == "modern_track_luxury_bottom"
        else "avatar_room_shoes_male_milk_tea_court_v1.png"
    )
    base_layers = (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        shoe_layer,
        "avatar_room_bottom_male_navy_straight_pants_v1.png",
        "avatar_room_top_male_powder_blue_crew_tee_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    for name in base_layers:
        if item.category == "bottom" and name == "avatar_room_bottom_male_navy_straight_pants_v1.png":
            continue
        if item.category == "top" and name == "avatar_room_top_male_powder_blue_crew_tee_v1.png":
            continue
        if item.category == "hair_front" and name == "avatar_room_hair_front_male_espresso_crop_v1.png":
            continue
        result.alpha_composite(load_layer(name))
    if item.category == "bottom":
        result.alpha_composite(layer)
    elif item.category == "top":
        result.alpha_composite(layer)
    elif item.category == "accessory":
        result.alpha_composite(layer)
    else:
        result.alpha_composite(layer)
    return clean(result)


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    output = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=(255, 253, 254) if (x // cell + y // cell) % 2 else (241, 235, 239),
            )
    return output


def render_sheet(records: list[dict[str, object]], closeup: bool, output_name: str) -> Path:
    columns = 4
    tile_w, tile_h = (292, 300) if closeup else (292, 470)
    rows = max(1, (len(records) + columns - 1) // columns)
    sheet = Image.new("RGB", (columns * tile_w, 76 + rows * tile_h), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    title = "MALE PREMIUM CAPSULE · STATIC FIT CLOSE-UPS" if closeup else "MALE PREMIUM CAPSULE · STATIC FIT CANDIDATES"
    draw.text((20, 18), title, font=font(18, True), fill=(69, 43, 57))
    draw.text((20, 44), "Canonical male 256×384 · source-rendered, alpha-cleaned, pre-motion proof", font=font(12), fill=(126, 104, 116))
    for index, record in enumerate(records):
        x = (index % columns) * tile_w
        y = 76 + (index // columns) * tile_h
        composite = Image.open(record["compositePath"]).convert("RGBA")
        if closeup:
            item = record["item"]
            category = item["category"]
            crop = (74, 66, 182, 194) if category in {"accessory", "hair_front"} else (76, 204, 180, 304) if category == "top" else (88, 270, 168, 354)
            composite = composite.crop(crop).resize((216, 216), Image.Resampling.NEAREST)
        panel = checkerboard(composite.size)
        panel.paste(composite, (0, 0), composite)
        sheet.paste(panel, (x + (38 if closeup else 18), y + 8))
        item = record["item"]
        label_y = y + (230 if closeup else 396)
        draw.text((x + 16, label_y), item["label"][:32], font=font(13, True), fill=(69, 43, 57))
        draw.text((x + 16, label_y + 22), f"{item['category']} · static candidate", font=font(12), fill=(38, 142, 102))
    suffix = "static-closeups" if closeup else "static-contact-sheet"
    path = EVIDENCE / f"{output_name}-{suffix}.png"
    sheet.save(path, optimize=True)
    return path


def alpha_bounds(image: Image.Image) -> list[int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox is None:
        raise ValueError("candidate alpha is empty")
    return list(bbox)


def run(slugs: list[str]) -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    COMPOSITES.mkdir(parents=True, exist_ok=True)
    STATIC_RECORDS.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    for slug in slugs:
        item = ITEMS_BY_SLUG[slug]
        layer = fit(item)
        static = runtime_path(item)
        # Bottoms stay candidate-only until the static-fit reviewer and user
        # approve them. Direct-master production must never silently replace
        # a live catalog layer.
        if item.category != "bottom":
            static.parent.mkdir(parents=True, exist_ok=True)
            layer.save(static, optimize=True)
        candidate = CANDIDATES / f"{item.slug}.png"
        layer.save(candidate, optimize=True)
        composite = avatar_composite(item, layer)
        composite_path = COMPOSITES / f"{item.slug}.png"
        composite.save(composite_path, optimize=True)
        records.append({
            "item": asdict(item),
            "staticPath": str(static.relative_to(ROOT)),
            "sourcePath": str(production_source_path(item).relative_to(ROOT)),
            "runtimeWritten": item.category != "bottom",
            "candidatePath": str(candidate.relative_to(ROOT)),
            "compositePath": str(composite_path.relative_to(ROOT)),
            "alphaBounds": alpha_bounds(layer),
            "canvas": list(CANVAS),
        })
    is_pilot_batch = len(records) == 8 and all(record["item"]["pilot"] for record in records)
    output_name = "pilot" if is_pilot_batch else f"static-{records[0]['item']['slug']}" if len(records) == 1 else "static-batch"
    contact = render_sheet(records, closeup=False, output_name=output_name)
    closeups = render_sheet(records, closeup=True, output_name=output_name)
    manifest = {
        "schemaVersion": 1,
        "phase": "static-fit",
        "rigId": RIG_ID,
        "fitProfileId": FIT_PROFILE_ID,
        "staticFitVerdict": "CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
        "motionOrCatalogProduced": False,
        "staticContactSheet": str(contact.relative_to(ROOT)),
        "staticCloseupSheet": str(closeups.relative_to(ROOT)),
        "items": records,
    }
    manifest_path = EVIDENCE / ("pilot-static-manifest.json" if is_pilot_batch else f"{output_name}-manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    for record in records:
        slug = record["item"]["slug"]
        (STATIC_RECORDS / f"{slug}.json").write_text(json.dumps(record, indent=2) + "\n")
    print(contact)
    print(closeups)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slugs", required=True, help="comma-separated inventory slugs")
    args = parser.parse_args()
    slugs = [slug for slug in args.slugs.split(",") if slug]
    unknown = sorted(set(slugs) - ITEMS_BY_SLUG.keys())
    if unknown:
        raise ValueError(f"unknown capsule slugs: {', '.join(unknown)}")
    run(slugs)


if __name__ == "__main__":
    main()
