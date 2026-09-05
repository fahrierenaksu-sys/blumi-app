#!/usr/bin/env python3
"""Fit male hair and shoe render sources to the canonical 256x384 room rig.

The ImageGen sources provide painterly material detail. This producer owns the
fit contract: fixed head/foot anchors, clean alpha, and pant/shoe contact. It
writes static QA candidates only; it does not touch runtime catalogs or motion.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
SOURCE_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-male-hair-shoes-wave3"
OUTPUT_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-hair-shoes-wave3-qa"
CANVAS = (256, 384)
SCALE = 4


@dataclass(frozen=True)
class Item:
    slug: str
    name: str
    category: str
    target_box: tuple[int, int, int, int]
    underlay: tuple[int, int, int]


NEW_ITEMS = (
    Item("cocoa_textured_quiff", "Cocoa Textured Quiff", "hair", (71, 101, 186, 199), (85, 41, 43)),
    Item("soft_black_side_part", "Soft Black Side Part", "hair", (70, 98, 187, 194), (36, 31, 36)),
    Item("chestnut_short_waves", "Chestnut Short Waves", "hair", (71, 98, 186, 196), (117, 58, 42)),
    Item("cloud_white_trainers", "Cloud White Trainers", "shoes", (105, 325, 151, 348), (243, 232, 210)),
    Item("cocoa_penny_loafers", "Cocoa Penny Loafers", "shoes", (105, 325, 151, 348), (114, 58, 39)),
    Item("dusty_blue_canvas_sneakers", "Dusty Blue Canvas Sneakers", "shoes", (105, 325, 151, 348), (103, 133, 158)),
)

EXISTING_HAIR = Item("espresso_crop", "Espresso Crop", "hair", (72, 103, 186, 199), (74, 37, 37))
EXISTING_SHOES = Item("milk_tea_court", "Milk Tea Court", "shoes", (105, 326, 151, 348), (238, 205, 183))
DISPLAY_ITEMS = (
    EXISTING_HAIR,
    *tuple(item for item in NEW_ITEMS if item.category == "hair"),
    EXISTING_SHOES,
    *tuple(item for item in NEW_ITEMS if item.category == "shoes"),
)


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.width <= 0 or image.height <= 0:
        raise ValueError(f"{path}: invalid canvas")
    return image


def sanitize_transparency(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif green > red + 12 and green > blue + 12:
                # Render sources are keyed green/magenta. Hair/shoe palettes do
                # not contain vivid green, so remove any residual green spill.
                neutral = max(red, blue)
                pixels[x, y] = (red, min(green, neutral + 6), blue, alpha)
    return rgba


def repair_green_fringe(image: Image.Image) -> Image.Image:
    """Neutralize key spill without moving any alpha or silhouette pixels."""

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    replacements: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 11 or green <= red + 12 or green <= blue + 12:
                continue
            samples: list[tuple[int, int, int]] = []
            for radius in (1, 2, 3):
                for sample_y in range(max(0, y - radius), min(rgba.height, y + radius + 1)):
                    for sample_x in range(max(0, x - radius), min(rgba.width, x + radius + 1)):
                        sample_red, sample_green, sample_blue, sample_alpha = pixels[sample_x, sample_y]
                        if sample_alpha < 64:
                            continue
                        if sample_green > sample_red + 12 and sample_green > sample_blue + 12:
                            continue
                        samples.append((sample_red, sample_green, sample_blue))
                if samples:
                    break
            if samples:
                count = len(samples)
                replacements[(x, y)] = (
                    sum(sample[0] for sample in samples) // count,
                    sum(sample[1] for sample in samples) // count,
                    sum(sample[2] for sample in samples) // count,
                    alpha,
                )
            else:
                replacements[(x, y)] = (red, min(green, max(red, blue) + 6), blue, alpha)

    for (x, y), replacement in replacements.items():
        pixels[x, y] = replacement
    return sanitize_transparency(rgba)


def opaque_crop(image: Image.Image, threshold: int = 20) -> Image.Image:
    alpha = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("render source is fully transparent")
    return image.crop(bbox)


def antialiased_shoe_mask(item: Item) -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    draw = ImageDraw.Draw(mask)

    def shoe(points: tuple[tuple[int, int], ...]) -> None:
        draw.polygon([(x * SCALE, y * SCALE) for x, y in points], fill=255)

    # Each footwear model owns a genuinely different cut pattern. They share
    # only the canonical foot anchors, pant-over-upper contact, and baseline.
    if item.slug == "cloud_white_trainers":
        # Round padded collar, high lace tongue and thick softly curved sole.
        shoe(((110, 327), (122, 327), (126, 332), (128, 338), (127, 343), (124, 345), (108, 345), (105, 342), (106, 336)))
        shoe(((134, 327), (146, 327), (150, 336), (151, 342), (148, 345), (132, 345), (129, 343), (128, 338), (130, 332)))
        draw.rounded_rectangle((106 * SCALE, 341 * SCALE, 127 * SCALE, 347 * SCALE), radius=3 * SCALE, fill=255)
        draw.rounded_rectangle((129 * SCALE, 341 * SCALE, 150 * SCALE, 347 * SCALE), radius=3 * SCALE, fill=255)
    elif item.slug == "cocoa_penny_loafers":
        # Low vamp and flatter apron toe with a distinctly thin dress sole.
        shoe(((112, 327), (120, 327), (122, 331), (126, 335), (127, 341), (124, 345), (108, 345), (106, 342), (107, 336), (110, 332)))
        shoe(((136, 327), (144, 327), (146, 332), (149, 336), (150, 342), (148, 345), (132, 345), (129, 341), (130, 335), (134, 331)))
        draw.rounded_rectangle((106 * SCALE, 344 * SCALE, 127 * SCALE, 347 * SCALE), radius=1 * SCALE, fill=255)
        draw.rounded_rectangle((129 * SCALE, 344 * SCALE, 150 * SCALE, 347 * SCALE), radius=1 * SCALE, fill=255)
    elif item.slug == "dusty_blue_canvas_sneakers":
        # Wide canvas collar, pinched eyelet waist and flared rubber toe create
        # an hourglass contour unlike both the padded trainer and low loafer.
        shoe(((108, 327), (124, 327), (123, 331), (121, 335), (126, 338), (128, 343), (125, 346), (107, 346), (105, 343), (106, 339), (111, 335), (109, 331)))
        shoe(((132, 327), (148, 327), (147, 331), (145, 335), (150, 339), (151, 343), (149, 346), (131, 346), (128, 343), (130, 338), (135, 335), (133, 331)))
        draw.rounded_rectangle((106 * SCALE, 343 * SCALE, 127 * SCALE, 347 * SCALE), radius=2 * SCALE, fill=255)
        draw.rounded_rectangle((129 * SCALE, 343 * SCALE, 150 * SCALE, 347 * SCALE), radius=2 * SCALE, fill=255)
    else:
        raise ValueError(f"unsupported shoe silhouette: {item.slug}")
    mask = mask.resize(CANVAS, Image.Resampling.LANCZOS)
    pixels = mask.load()
    for y in range(CANVAS[1]):
        for x in range(CANVAS[0]):
            outside_envelope = x < 105 or x > 150 or y < 326 or y > 347
            outside_pant_contact = y <= 333 and (x < 107 or x > 148)
            center_foot_gap = x == 128 and y >= 334
            if outside_envelope or outside_pant_contact or center_foot_gap:
                pixels[x, y] = 0
    # Hidden beneath the pants at runtime: two shared contact anchors preserve
    # the canonical x107–148 hem seal without flattening visible silhouettes.
    pixels[107, 333] = 255
    pixels[148, 333] = 255
    return mask


def fit_hair(item: Item, source: Image.Image) -> Image.Image:
    cropped = opaque_crop(source)
    target_width = item.target_box[2] - item.target_box[0]
    target_height = item.target_box[3] - item.target_box[1]
    fitted = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # Contract the matte after downsampling, then restore a soft one-pixel
    # illustrated edge. This removes stray chroma without making hair jagged.
    alpha = fitted.getchannel("A")
    alpha = alpha.point(lambda value: 0 if value < 36 else value)
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    fitted.putalpha(alpha)

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(fitted, (item.target_box[0], item.target_box[1]))

    # The approved Espresso Crop is the face-clearance authority. New styles
    # may change their crown and outer silhouette, but they cannot spill into
    # pixels the approved hair leaves open over the eyes, cheeks, and ears.
    approved = load_room("avatar_room_hair_front_male_espresso_crop_v1.png")
    canvas_alpha = canvas.getchannel("A")
    approved_alpha = approved.getchannel("A")
    alpha_pixels = canvas_alpha.load()
    approved_pixels = approved_alpha.load()
    for y in range(138, 204):
        for x in range(78, 179):
            if approved_pixels[x, y] <= 8:
                alpha_pixels[x, y] = 0
    canvas.putalpha(canvas_alpha)
    return sanitize_transparency(canvas)


def fit_shoes(item: Item, source: Image.Image) -> Image.Image:
    cropped = opaque_crop(source)
    target_width = item.target_box[2] - item.target_box[0]
    target_height = item.target_box[3] - item.target_box[1]
    texture = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    texture_canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    texture_canvas.alpha_composite(texture, (item.target_box[0], item.target_box[1]))

    mask = antialiased_shoe_mask(item)
    base = Image.new("RGBA", CANVAS, (*item.underlay, 0))
    base.putalpha(mask)

    texture_alpha = ImageChops.multiply(texture_canvas.getchannel("A"), mask)
    texture_canvas.putalpha(texture_alpha)
    fitted = Image.alpha_composite(base, texture_canvas)
    fitted.putalpha(mask)
    return sanitize_transparency(fitted)


def load_room(name: str) -> Image.Image:
    image = load_rgba(ROOM_ROOT / name)
    if image.size != CANVAS:
        raise ValueError(f"{name}: expected {CANVAS}, got {image.size}")
    return image


def avatar_composite(item: Item, layer: Image.Image) -> Image.Image:
    default_hair = load_room("avatar_room_hair_front_male_espresso_crop_v1.png")
    default_shoes = load_room("avatar_room_shoes_male_milk_tea_court_v1.png")
    ordered_layers = (
        load_room("avatar_room_base_male_light_v1.png"),
        load_room("avatar_room_face_male_warm_friendly_v1.png"),
        layer if item.category == "shoes" else default_shoes,
        load_room("avatar_room_bottom_male_navy_straight_pants_v1.png"),
        load_room("avatar_room_top_male_powder_blue_crew_tee_v1.png"),
        layer if item.category == "hair" else default_hair,
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for ordered_layer in ordered_layers:
        result = Image.alpha_composite(result, ordered_layer)
    return result


def checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    result = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            fill = (255, 252, 254) if (x // cell + y // cell) % 2 == 0 else (238, 231, 236)
            draw.rectangle((x, y, x + cell, y + cell), fill=fill)
    return result


def render_contact_sheet(composites: dict[str, Image.Image]) -> Path:
    tile_width, tile_height = 320, 500
    sheet = Image.new("RGB", (tile_width * 4, 78 + tile_height * 2), (255, 247, 251))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((24, 18), "MALE HAIR + SHOES · WAVE 3 STATIC CANDIDATES", font=font, fill=(69, 43, 57))
    draw.text((24, 42), "Canonical 256x384 · ImageGen render detail + deterministic rig anchors · no catalog/motion", font=font, fill=(126, 104, 116))

    for index, item in enumerate(DISPLAY_ITEMS):
        column, row = index % 4, index // 4
        x, y = column * tile_width, 78 + row * tile_height
        panel = checkerboard(CANVAS)
        avatar = composites[item.slug]
        panel.paste(avatar, (0, 0), avatar)
        sheet.paste(panel, (x + 42, y))
        draw.text((x + 24, y + 391), item.name, font=font, fill=(69, 43, 57))
        state = "APPROVED BASELINE" if item in (EXISTING_HAIR, EXISTING_SHOES) else "STATIC CANDIDATE"
        draw.text((x + 24, y + 412), f"{state} · {item.category.upper()}", font=font, fill=(38, 142, 102))
        draw.text((x + 24, y + 432), f"anchor {item.target_box}", font=font, fill=(126, 104, 116))

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_ROOT / "2026-07-14-male-hair-shoes-wave3-contact-sheet.png"
    sheet.save(path, optimize=True)
    return path


def render_closeups(composites: dict[str, Image.Image]) -> Path:
    tile_width, tile_height = 320, 250
    sheet = Image.new("RGB", (tile_width * 4, 72 + tile_height * 2), (255, 247, 251))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((24, 17), "MALE WAVE 3 · HEAD ANCHOR + PANT/SHOE CONTACT", font=font, fill=(69, 43, 57))
    draw.text((24, 39), "Inspect forehead/temple/ear clearance and pant hem over shoe upper", font=font, fill=(126, 104, 116))

    for index, item in enumerate(DISPLAY_ITEMS):
        column, row = index % 4, index // 4
        x, y = column * tile_width, 72 + row * tile_height
        box = (62, 92, 194, 220) if item.category == "hair" else (96, 316, 160, 352)
        avatar = composites[item.slug]
        crop = avatar.crop(box).resize((264, 216), Image.Resampling.NEAREST)
        background = checkerboard(crop.size, 16)
        background.paste(crop, (0, 0), crop)
        sheet.paste(background, (x + 38, y))
        draw.text((x + 24, y + 222), item.name, font=font, fill=(69, 43, 57))

    path = OUTPUT_ROOT / "2026-07-14-male-hair-shoes-wave3-closeups.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    composites: dict[str, Image.Image] = {}

    existing_hair = load_room("avatar_room_hair_front_male_espresso_crop_v1.png")
    composites[EXISTING_HAIR.slug] = avatar_composite(EXISTING_HAIR, existing_hair)
    existing_shoes = load_room("avatar_room_shoes_male_milk_tea_court_v1.png")
    repaired_shoes = repair_green_fringe(existing_shoes)
    repaired_path = OUTPUT_ROOT / "avatar_room_shoes_male_milk_tea_court_v1_repaired_alpha.png"
    repaired_shoes.save(repaired_path, optimize=True)
    composites[EXISTING_SHOES.slug] = avatar_composite(EXISTING_SHOES, repaired_shoes)
    composites[EXISTING_HAIR.slug].save(OUTPUT_ROOT / "espresso_crop_composite.png", optimize=True)
    composites[EXISTING_SHOES.slug].save(OUTPUT_ROOT / "milk_tea_court_repaired_composite.png", optimize=True)
    print(repaired_path)

    for item in NEW_ITEMS:
        source = load_rgba(SOURCE_ROOT / f"{item.slug}_alpha.png")
        candidate = fit_hair(item, source) if item.category == "hair" else fit_shoes(item, source)
        prefix = "avatar_room_hair_front_male" if item.category == "hair" else "avatar_room_shoes_male"
        candidate_path = OUTPUT_ROOT / f"{prefix}_{item.slug}_v1_alpha.png"
        candidate.save(candidate_path, optimize=True)

        composite = avatar_composite(item, candidate)
        composites[item.slug] = composite
        composite.save(OUTPUT_ROOT / f"{item.slug}_composite.png", optimize=True)
        print(candidate_path)

    print(render_contact_sheet(composites))
    print(render_closeups(composites))


if __name__ == "__main__":
    main()
