#!/usr/bin/env python3
"""Render final visual QA sheets from the promoted male premium capsule assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT = ROOT / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/final-qa"
CANVAS = (256, 384)

ITEMS = (
    ("top", "tonal_geometric_camp_collar_shirt", "Tonal geometric camp shirt"),
    ("top", "asymmetric_utility_overshirt", "Asymmetric utility overshirt"),
    ("top", "abstract_resort_shirt", "Abstract resort shirt"),
    ("top", "cropped_cocoa_moto_jacket", "Cropped cocoa moto jacket"),
    ("top", "charcoal_leather_bomber_hybrid", "Charcoal leather bomber"),
    ("bottom", "wide_pleated_technical_trousers", "Wide pleated trousers"),
    ("bottom", "straight_utility_tailored_trousers", "Straight utility trousers"),
    ("top", "midnight_relaxed_tailoring_jacket", "Midnight tailoring jacket"),
    ("bottom", "midnight_relaxed_tailoring_trousers", "Midnight tailoring trousers"),
    ("top", "warm_sand_deconstructed_jacket", "Warm sand jacket"),
    ("bottom", "warm_sand_deconstructed_trousers", "Warm sand trousers"),
    ("top", "acid_washed_boxy_sweatshirt", "Acid-washed sweatshirt"),
    ("top", "diagonal_seam_zip_mock_neck", "Diagonal zip mock-neck"),
    ("top", "textured_knit_polo", "Textured knit polo"),
    ("top", "monochrome_street_tailoring_top", "Monochrome tailoring top"),
    ("bottom", "monochrome_street_tailoring_bottom", "Monochrome tailoring trousers"),
    ("top", "modern_track_luxury_top", "Modern track-luxury top"),
    ("bottom", "modern_track_luxury_bottom", "Modern track-luxury trousers"),
    ("top", "contemporary_resort_street_top", "Contemporary resort-street top"),
    ("bottom", "contemporary_resort_street_bottom", "Contemporary resort-street bottom"),
    ("top", "creative_utility_top", "Creative utility overshirt"),
    ("bottom", "creative_utility_bottom", "Creative utility trousers"),
    ("bottom", "relaxed_tailored_shorts", "Relaxed tailored shorts"),
    ("bottom", "refined_utility_cargo_shorts", "Refined utility cargo shorts"),
    ("bottom", "technical_sport_shorts", "Technical sport shorts"),
    ("accessory", "slim_oval_glasses", "Slim oval glasses"),
    ("accessory", "soft_rectangular_glasses", "Soft rectangular glasses"),
    ("accessory", "translucent_wrap_glasses", "Translucent wrap glasses"),
    ("hair_front", "soft_textured_crop", "Soft textured crop"),
    ("hair_front", "medium_curtain_middle_part", "Medium curtain middle-part"),
    ("hair_front", "controlled_modern_mullet", "Controlled modern mullet"),
    ("hair_front", "voluminous_wavy_quiff", "Voluminous wavy quiff"),
    ("hair_front", "short_twists_textured_style", "Short twists textured style"),
)
LOOKS = (
    ("Midnight relaxed tailoring", "midnight_relaxed_tailoring_jacket", "midnight_relaxed_tailoring_trousers"),
    ("Warm sand deconstructed tailoring", "warm_sand_deconstructed_jacket", "warm_sand_deconstructed_trousers"),
    ("Monochrome street tailoring", "monochrome_street_tailoring_top", "monochrome_street_tailoring_bottom"),
    ("Modern track-luxury", "modern_track_luxury_top", "modern_track_luxury_bottom"),
    ("Contemporary resort-street", "contemporary_resort_street_top", "contemporary_resort_street_bottom"),
    ("Creative utility", "creative_utility_top", "creative_utility_bottom"),
    ("Midnight jacket + track trousers", "midnight_relaxed_tailoring_jacket", "modern_track_luxury_bottom"),
    ("Resort shirt + tailored shorts", "abstract_resort_shirt", "relaxed_tailored_shorts"),
    ("Bomber + utility trousers", "charcoal_leather_bomber_hybrid", "straight_utility_tailored_trousers"),
    ("Knit polo + sport shorts", "textured_knit_polo", "technical_sport_shorts"),
)


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        name = "Arial Bold.ttf" if bold else "Arial.ttf"
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, received {image.size}")
    return image


def path(category: str, slug: str) -> Path:
    return ROOM / f"avatar_room_{category}_male_{slug}_v1.png"


def compose(top: str | None = None, bottom: str | None = None, accessory: str | None = None, hair: str | None = None) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
    ):
        output.alpha_composite(load(ROOM / name))
    output.alpha_composite(load(path("bottom", bottom)) if bottom else load(ROOM / "avatar_room_bottom_male_navy_straight_pants_v1.png"))
    output.alpha_composite(load(path("top", top)) if top else load(ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"))
    output.alpha_composite(load(path("hair_front", hair)) if hair else load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    if accessory:
        output.alpha_composite(load(path("accessory", accessory)))
    return output


def paste_tile(sheet: Image.Image, image: Image.Image, x: int, y: int, scale: int = 1) -> None:
    preview = image.resize((CANVAS[0] * scale, CANVAS[1] * scale), Image.Resampling.NEAREST)
    sheet.paste(preview, (x, y), preview)


def write_feature_sheet(filename: str, title: str, category: str, slugs: tuple[str, ...]) -> Path:
    tile_w, tile_h = 220, 356
    sheet = Image.new("RGB", (len(slugs) * tile_w, tile_h), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), title, font=font(17, True), fill=(69, 43, 57))
    for index, slug in enumerate(slugs):
        image = compose(accessory=slug) if category == "accessory" else compose(hair=slug)
        preview = image.resize((128, 192), Image.Resampling.NEAREST)
        x = index * tile_w + 46
        sheet.paste(preview, (x, 58), preview)
        draw.text((index * tile_w + 14, 272), slug.replace("_", " ")[:28], font=font(11, True), fill=(69, 43, 57))
        draw.text((index * tile_w + 14, 294), "same male face · 4W+1S keyed", font=font(10), fill=(38, 142, 102))
    destination = OUTPUT / filename
    sheet.save(destination, optimize=True)
    return destination


def write_outfit_sheet() -> Path:
    tile_w, tile_h, columns = 256, 320, 5
    rows = (len(LOOKS) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, 74 + rows * tile_h), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), "MALE PREMIUM CAPSULE · OUTFIT COMPATIBILITY", font=font(17, True), fill=(69, 43, 57))
    draw.text((18, 42), "Six coordinated looks plus four representative mix-and-match combinations", font=font(11), fill=(126, 104, 116))
    for index, (label, top, bottom) in enumerate(LOOKS):
        image = compose(top=top, bottom=bottom)
        x = (index % columns) * tile_w + 64
        y = 74 + (index // columns) * tile_h
        preview = image.resize((128, 192), Image.Resampling.NEAREST)
        sheet.paste(preview, (x, y + 8), preview)
        draw.text((x - 48, y + 218), label[:32], font=font(11, True), fill=(69, 43, 57))
    destination = OUTPUT / "outfit-compatibility-sheet.png"
    sheet.save(destination, optimize=True)
    return destination


def write_catalog_sheet() -> Path:
    tile_w, tile_h, columns = 230, 264, 4
    rows = (len(ITEMS) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, 74 + rows * tile_h), (255, 248, 251))
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), "MALE PREMIUM CAPSULE · CATALOG RUNTIME QA", font=font(17, True), fill=(69, 43, 57))
    draw.text((18, 42), "33 locked catalog entries · male rig · preview source · 4W+1S mapping", font=font(11), fill=(126, 104, 116))
    for index, (category, slug, label) in enumerate(ITEMS):
        image = compose(
            top=slug if category == "top" else None,
            bottom=slug if category == "bottom" else None,
            accessory=slug if category == "accessory" else None,
            hair=slug if category == "hair_front" else None,
        )
        x = (index % columns) * tile_w + 51
        y = 74 + (index // columns) * tile_h
        preview = image.resize((102, 153), Image.Resampling.NEAREST)
        sheet.paste(preview, (x, y + 8), preview)
        draw.text((x - 38, y + 172), label[:28], font=font(10, True), fill=(69, 43, 57))
        draw.text((x - 38, y + 193), f"{category} · locked", font=font(10), fill=(126, 104, 116))
    destination = OUTPUT / "catalog-runtime-qa.png"
    sheet.save(destination, optimize=True)
    return destination


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "hairComparison": str(write_feature_sheet("hair-comparison-qa.png", "MALE PREMIUM CAPSULE · HAIR QA", "hair_front", tuple(item[1] for item in ITEMS if item[0] == "hair_front")).relative_to(ROOT)),
        "glassesComparison": str(write_feature_sheet("glasses-comparison-qa.png", "MALE PREMIUM CAPSULE · GLASSES QA", "accessory", tuple(item[1] for item in ITEMS if item[0] == "accessory")).relative_to(ROOT)),
        "outfitCompatibility": str(write_outfit_sheet().relative_to(ROOT)),
        "catalogRuntime": str(write_catalog_sheet().relative_to(ROOT)),
    }
    (OUTPUT / "final-qa-manifest.json").write_text(json.dumps({"rigId": "blumi_2_5d_layered_v1", "fitProfileId": "blumi_male_room_avatar_v1", "outputs": outputs}, indent=2) + "\n")
    for output in outputs.values():
        print(ROOT / output)


if __name__ == "__main__":
    main()
