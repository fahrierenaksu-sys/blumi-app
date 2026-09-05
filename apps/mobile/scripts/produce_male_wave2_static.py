#!/usr/bin/env python3
"""Fit illustrated male capsule render sources to the canonical room rig.

This is a static-only producer. It deliberately writes candidates and visual
evidence outside the live catalog; animation and catalog promotion happen only
after independent visual QA.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
SOURCE_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-male-wave2-static"
OUTPUT_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-wave2-static-qa"
CANVAS = (256, 384)
SCALE = 4


@dataclass(frozen=True)
class Item:
    slug: str
    name: str
    category: str
    chroma: str
    base_color: tuple[int, int, int]


ITEMS = (
    Item("mist_blue_oxford_shirt", "Mist Blue Oxford Shirt", "shirt", "green", (174, 205, 229)),
    Item("soft_sage_linen_shirt", "Soft Sage Linen Shirt", "shirt", "magenta", (173, 188, 144)),
    Item("cocoa_varsity_jacket", "Cocoa Varsity Jacket", "jacket", "green", (145, 91, 55)),
    Item("dusty_navy_chore_jacket", "Dusty Navy Chore Jacket", "jacket", "green", (65, 82, 125)),
    Item("mid_blue_straight_jeans", "Mid Blue Straight Jeans", "pants", "magenta", (53, 113, 169)),
    Item("charcoal_tapered_chinos", "Charcoal Tapered Chinos", "pants", "green", (64, 61, 69)),
    Item("warm_sand_relaxed_pants", "Warm Sand Relaxed Pants", "pants", "magenta", (224, 186, 132)),
)


def sanitize_transparency(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def opaque_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("render source is fully transparent")
    return bbox


def antialiased_mask(draw_at_scale) -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    draw_at_scale(ImageDraw.Draw(mask))
    return mask.resize(CANVAS, Image.Resampling.LANCZOS)


def polygon(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], fill: int = 255) -> None:
    draw.polygon([(x * SCALE, y * SCALE) for x, y in points], fill=fill)


def ellipse(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: int = 255) -> None:
    draw.ellipse(tuple(value * SCALE for value in box), fill=fill)


def rounded_rectangle(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: int = 255,
) -> None:
    draw.rounded_rectangle(tuple(value * SCALE for value in box), radius * SCALE, fill=fill)


def top_mask(item: Item) -> Image.Image:
    def paint(draw: ImageDraw.ImageDraw) -> None:
        # Torso and shoulder cap share one continuous contour; sleeves follow
        # the canonical body arms and stop before the hands.
        polygon(draw, [(105, 219), (98, 222), (94, 229), (99, 244), (104, 251), (103, 291),
                       (108, 294), (148, 294), (153, 291), (152, 251), (157, 244), (162, 229),
                       (158, 222), (151, 219)])
        if item.category == "shirt" and item.slug == "mist_blue_oxford_shirt":
            polygon(draw, [(99, 224), (92, 227), (86, 244), (88, 252), (98, 250), (105, 236)])
            polygon(draw, [(157, 224), (164, 227), (170, 244), (168, 252), (158, 250), (151, 236)])
        else:
            polygon(draw, [(100, 224), (93, 227), (85, 253), (86, 266), (96, 267), (102, 250), (106, 233)])
            polygon(draw, [(156, 224), (163, 227), (171, 253), (170, 266), (160, 267), (154, 250), (150, 233)])

        # The neck remains open through y218. A shallow front opening is cut
        # once, avoiding the doubled rear-collar band seen in rejected tops.
        ellipse(draw, (115, 214, 141, 224), fill=0)
        if item.category == "shirt":
            polygon(draw, [(124, 219), (132, 219), (128, 229)], fill=0)
        elif item.category == "jacket":
            polygon(draw, [(122, 219), (134, 219), (128, 226)], fill=0)

    return antialiased_mask(paint)


def pants_mask(item: Item) -> Image.Image:
    def paint(draw: ImageDraw.ImageDraw) -> None:
        rounded_rectangle(draw, (103, 288, 153, 303), 5)

        if item.slug == "charcoal_tapered_chinos":
            # A continuous taper: narrower already at the thigh line, then
            # closes another pixel toward the ankle and stays narrow at hem.
            polygon(draw, [(104, 296), (128, 296), (125, 310), (124, 334), (106, 334), (105, 310)])
            polygon(draw, [(128, 296), (152, 296), (151, 310), (150, 334), (132, 334), (131, 310)])
            polygon(draw, [(125, 307), (131, 307), (131, 335), (125, 335)], fill=0)
        elif item.slug == "warm_sand_relaxed_pants":
            # Relaxed side seams stay wider from thigh through cuff; the leg
            # gap remains readable without collapsing the garment into shorts.
            polygon(draw, [(103, 296), (128, 296), (127, 334), (103, 334)])
            polygon(draw, [(128, 296), (153, 296), (153, 334), (129, 334)])
            polygon(draw, [(127, 307), (129, 307), (129, 335), (127, 335)], fill=0)
        else:
            # Straight keeps parallel side seams and a stable cuff width.
            polygon(draw, [(104, 296), (128, 296), (126, 334), (104, 334)])
            polygon(draw, [(128, 296), (152, 296), (152, 334), (130, 334)])
            polygon(draw, [(126, 307), (130, 307), (130, 335), (126, 335)], fill=0)

    return antialiased_mask(paint)


def source_texture(item: Item, target_box: tuple[int, int, int, int]) -> Image.Image:
    source_path = SOURCE_ROOT / f"{item.slug}_alpha.png"
    source = Image.open(source_path).convert("RGBA")
    source = source.crop(opaque_bbox(source))
    width = target_box[2] - target_box[0]
    height = target_box[3] - target_box[1]
    source = source.resize((width * SCALE, height * SCALE), Image.Resampling.LANCZOS)
    # Use only source colors inside the deterministic canonical mask. The
    # render-source alpha is not the fit authority, so there is no photo-shell
    # gap after normalization.
    texture = Image.new("RGBA", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), (0, 0, 0, 0))
    texture.paste(source, (target_box[0] * SCALE, target_box[1] * SCALE), source)
    return texture


def soft_color_underlay(item: Item, mask: Image.Image) -> Image.Image:
    # The underlay is only visible where a source silhouette has tiny holes;
    # it continues the same material palette so no body pinhole can appear.
    red, green, blue = item.base_color
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    pixels = layer.load()
    for y in range(CANVAS[1]):
        shade = 0.90 + 0.12 * ((y % 17) / 16)
        for x in range(CANVAS[0]):
            alpha = mask.getpixel((x, y))
            if alpha:
                center = 1.0 + max(0.0, 1.0 - abs(x - 128) / 44) * 0.06
                pixels[x, y] = (
                    min(255, int(red * shade * center)),
                    min(255, int(green * shade * center)),
                    min(255, int(blue * shade * center)),
                    alpha,
                )
    return layer


def add_mobile_details(image: Image.Image, item: Item) -> Image.Image:
    detail = Image.new("RGBA", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(detail)
    if item.category in {"shirt", "jacket"}:
        seam = (72, 63, 72, 100) if item.category == "shirt" else (48, 38, 45, 125)
        draw.line((128 * SCALE, 226 * SCALE, 128 * SCALE, 291 * SCALE), fill=seam, width=1 * SCALE)
        button_color = (246, 226, 187, 255) if item.category == "shirt" else (112, 73, 51, 255)
        for y in (237, 252, 267, 282):
            draw.ellipse(((126.5 * SCALE), ((y - 1.5) * SCALE), (129.5 * SCALE), ((y + 1.5) * SCALE)), fill=button_color)
        if item.category == "jacket":
            draw.rounded_rectangle((108 * SCALE, 260 * SCALE, 120 * SCALE, 273 * SCALE), radius=2 * SCALE, outline=seam, width=1 * SCALE)
            draw.rounded_rectangle((136 * SCALE, 260 * SCALE, 148 * SCALE, 273 * SCALE), radius=2 * SCALE, outline=seam, width=1 * SCALE)
    else:
        seam = (53, 48, 55, 110) if "charcoal" in item.slug else (89, 69, 50, 100)
        draw.line((104 * SCALE, 297 * SCALE, 152 * SCALE, 297 * SCALE), fill=seam, width=SCALE)
        draw.line((128 * SCALE, 298 * SCALE, 128 * SCALE, 307 * SCALE), fill=seam, width=SCALE)
        draw.arc((121 * SCALE, 296 * SCALE, 135 * SCALE, 312 * SCALE), 270, 90, fill=seam, width=SCALE)
        draw.line((107 * SCALE, 301 * SCALE, 116 * SCALE, 307 * SCALE), fill=seam, width=SCALE)
        draw.line((149 * SCALE, 301 * SCALE, 140 * SCALE, 307 * SCALE), fill=seam, width=SCALE)
        draw.ellipse((126 * SCALE, 291 * SCALE, 130 * SCALE, 295 * SCALE), fill=(171, 128, 67, 255))
        if "jeans" in item.slug:
            stitch = (235, 181, 91, 150)
            draw.line((107 * SCALE, 331 * SCALE, 125 * SCALE, 331 * SCALE), fill=stitch, width=SCALE)
            draw.line((131 * SCALE, 331 * SCALE, 149 * SCALE, 331 * SCALE), fill=stitch, width=SCALE)
    detail = detail.resize(CANVAS, Image.Resampling.LANCZOS)
    return Image.alpha_composite(image, detail)


def fit_item(item: Item) -> Image.Image:
    if item.category == "pants":
        mask = pants_mask(item)
        target_box = (103, 288, 153, 335)
    else:
        mask = top_mask(item)
        target_box = (84, 216, 172, 295)

    underlay = soft_color_underlay(item, mask)
    texture_large = source_texture(item, target_box)
    texture = texture_large.resize(CANVAS, Image.Resampling.LANCZOS)
    texture.putalpha(ImageChops.multiply(texture.getchannel("A"), mask))
    fitted = Image.alpha_composite(underlay, texture)
    fitted.putalpha(mask)
    fitted = add_mobile_details(fitted, item)
    fitted.putalpha(mask)
    return sanitize_transparency(fitted)


def load_room(name: str) -> Image.Image:
    image = Image.open(ROOM_ROOT / name).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{name}: expected {CANVAS}, got {image.size}")
    return image


def avatar_composite(item: Item, garment: Image.Image) -> Image.Image:
    layers = [
        load_room("avatar_room_base_male_light_v1.png"),
        load_room("avatar_room_face_male_warm_friendly_v1.png"),
        load_room("avatar_room_shoes_male_milk_tea_court_v1.png"),
        garment if item.category == "pants" else load_room("avatar_room_bottom_male_navy_straight_pants_v1.png"),
        load_room("avatar_room_top_male_powder_blue_crew_tee_v1.png") if item.category == "pants" else garment,
        load_room("avatar_room_hair_front_male_espresso_crop_v1.png"),
    ]
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result = Image.alpha_composite(result, layer)
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
    tile_w, tile_h = 350, 520
    sheet = Image.new("RGB", (tile_w * 4, 80 + tile_h * 2), (255, 247, 251))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((24, 18), "MALE CAPSULE WAVE 2 · STATIC FIT CANDIDATES", font=font, fill=(69, 43, 57))
    draw.text((24, 42), "Canonical 256x384 · source texture + deterministic body-contact mask · not catalog promoted", font=font, fill=(126, 104, 116))
    for index, item in enumerate(ITEMS):
        column, row = index % 4, index // 4
        x, y = column * tile_w, 80 + row * tile_h
        panel = checkerboard(CANVAS)
        avatar = composites[item.slug]
        panel.paste(avatar, (0, 0), avatar)
        sheet.paste(panel, (x + 47, y))
        draw.text((x + 22, y + 392), item.name, font=font, fill=(69, 43, 57))
        draw.text((x + 22, y + 412), f"STATIC CANDIDATE · {item.category.upper()}", font=font, fill=(38, 142, 102))
        crop = avatar.crop((80, 208, 176, 348)).resize((192, 280), Image.Resampling.NEAREST)
        crop_bg = checkerboard(crop.size, cell=16)
        crop_bg.paste(crop, (0, 0), crop)
        crop_bg.thumbnail((150, 78), Image.Resampling.NEAREST)
        sheet.paste(crop_bg, (x + 178, y + 430))
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_ROOT / "2026-07-14-male-wave2-static-contact-sheet.png"
    sheet.save(path, optimize=True)
    return path


def render_fit_sheet(composites: dict[str, Image.Image]) -> Path:
    row_height = 190
    sheet = Image.new("RGB", (900, 72 + len(ITEMS) * row_height), (255, 247, 251))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((24, 17), "MALE WAVE 2 · STATIC BODY-CONTACT CLOSE-UPS", font=font, fill=(69, 43, 57))
    draw.text((24, 39), "Neck/shoulder + waist for tops · waist + hem/shoe contact for pants", font=font, fill=(126, 104, 116))
    for index, item in enumerate(ITEMS):
        y = 72 + index * row_height
        avatar = composites[item.slug]
        draw.text((20, y + 14), item.category.upper(), font=font, fill=(236, 79, 150))
        draw.text((20, y + 35), item.name, font=font, fill=(69, 43, 57))
        if item.category == "pants":
            crops = ((96, 282, 160, 310), (96, 318, 160, 350))
        else:
            crops = ((82, 208, 174, 254), (94, 278, 162, 306))
        for crop_index, box in enumerate(crops):
            crop = avatar.crop(box).resize(((box[2] - box[0]) * 4, (box[3] - box[1]) * 4), Image.Resampling.NEAREST)
            background = checkerboard(crop.size, cell=16)
            background.paste(crop, (0, 0), crop)
            sheet.paste(background, (190 + crop_index * 355, y + 8))
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_ROOT / "2026-07-14-male-wave2-fit-closeups.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    composites: dict[str, Image.Image] = {}
    for item in ITEMS:
        garment = fit_item(item)
        alpha_path = OUTPUT_ROOT / f"avatar_room_{'bottom' if item.category == 'pants' else 'top'}_male_{item.slug}_v1_alpha.png"
        garment.save(alpha_path, optimize=True)
        composite = avatar_composite(item, garment)
        composites[item.slug] = composite
        composite.save(OUTPUT_ROOT / f"{item.slug}_composite.png", optimize=True)
        print(alpha_path)
    print(render_contact_sheet(composites))
    print(render_fit_sheet(composites))


if __name__ == "__main__":
    main()
