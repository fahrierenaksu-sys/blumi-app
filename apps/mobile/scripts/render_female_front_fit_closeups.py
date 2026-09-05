#!/usr/bin/env python3
"""Render native-resolution close-ups for female front-fit inspection."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
OUT = ROOT / "docs/avatar-motion-pipeline/female-nondress-wardrobe-qa/2026-07-14-female-front-fit-zone-closeups.png"
PAIR_OUT = ROOT / "docs/avatar-motion-pipeline/female-nondress-wardrobe-qa/2026-07-14-female-front-top-bottom-seam-matrix.png"
CANVAS = (256, 384)
BACKGROUND = (247, 237, 244, 255)

TOPS = [
    ("Cream tee", "avatar_room_top_female_cream_basic_tee_v2.png"),
    ("Blush cardigan", "avatar_room_top_female_blush_lace_cardigan_v2.png"),
    ("Sage jacket", "avatar_room_top_female_sage_ribbon_knit_jacket_v2.png"),
    ("Cherry blouse", "avatar_room_top_female_cherry_heart_milkmaid_blouse_v2.png"),
    ("Powder corset", "avatar_room_top_female_powder_blue_ribbon_corset_top_v2.png"),
    ("Noir cardigan", "avatar_room_top_female_noir_rose_heart_cardigan_v2.png"),
]

BOTTOMS = [
    ("Denim skort", "avatar_room_bottom_female_denim_skort_shorts_v2.png", False),
    ("Crochet shorts", "avatar_room_bottom_female_striped_crochet_shorts_v2.png", False),
    ("Lace skirt", "avatar_room_bottom_female_layered_lace_ruffle_mini_skirt_v2.png", False),
    ("Black trousers", "avatar_room_bottom_female_black_palm_embellished_pants_v2.png", True),
    ("Coral trousers", "avatar_room_bottom_female_coral_embellished_laceup_pants_v2.png", True),
    ("Smoky trousers", "avatar_room_bottom_female_smoky_floral_mesh_pants_v2.png", True),
    ("Yellow skirt", "avatar_room_bottom_female_yellow_bow_lace_ruffle_skirt_v2.png", False),
]

SHOES = [
    ("Milk tea court", "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png"),
    ("Cherry ballet", "avatar_room_shoes_female_cherry_satin_ballets_v2.png"),
    ("Onyx Mary Jane", "avatar_room_shoes_female_onyx_heart_mary_janes_v2.png"),
    ("Rosewood loafer", "avatar_room_shoes_female_rosewood_platform_loafers_v2.png"),
    ("Pearl slingback", "avatar_room_shoes_female_pearl_slingback_sandals_v2.png"),
]

ACCESSORIES = [
    ("Neck scarf", "avatar_room_accessory_female_buttercream_neck_scarf_v2.png"),
    ("Bow headband", "avatar_room_accessory_female_cherry_bow_headband_v2.png"),
    ("Micro bag", "avatar_room_accessory_female_cherry_micro_bag_v2.png"),
    ("Heart locket", "avatar_room_accessory_female_golden_heart_locket_v2.png"),
    ("Ribbon beret", "avatar_room_accessory_female_ivory_ribbon_beret_v2.png"),
    ("Pearl earrings", "avatar_room_accessory_female_pearl_drop_earrings_v2.png"),
    ("Heart glasses", "avatar_room_accessory_female_sage_heart_glasses_v2.png"),
    ("Star clips", "avatar_room_accessory_female_sunny_star_clips_v2.png"),
]


def load(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


def compose(layer: str | None = None, *, bottom: str | None = None, shoes: str | None = None, accessory: str | None = None, trousers: bool = False) -> Image.Image:
    image = Image.new("RGBA", CANVAS, BACKGROUND)
    # Mirror the live front-only stack so accessory and neckline inspection is
    # not performed against a headless placeholder body.
    image.alpha_composite(load("avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png"))
    image.alpha_composite(load("avatar_room_base_female_v2.png"))
    for head_layer in (
        "avatar_room_face_female_soft_doll_foundation_v2.png",
        "avatar_room_eyes_female_mocha_doe_v2.png",
        "avatar_room_nose_female_soft_button_v2.png",
        "avatar_room_mouth_female_peach_whisper_smile_v2.png",
    ):
        image.alpha_composite(load(head_layer))
    if shoes and trousers:
        image.alpha_composite(load(shoes))
    if bottom:
        image.alpha_composite(load(bottom))
    if shoes and not trousers:
        image.alpha_composite(load(shoes))
    if layer:
        image.alpha_composite(load(layer))
    image.alpha_composite(load("avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png"))
    if accessory:
        image.alpha_composite(load(accessory))
    return image


def crop_card(image: Image.Image, crop: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    return image.crop(crop).resize(size, Image.Resampling.NEAREST)


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


def sheet(title: str, items: list[tuple[str, Image.Image]], crop: tuple[int, int, int, int], card_size: tuple[int, int], columns: int) -> Image.Image:
    label_h = 34
    cell_w = card_size[0] + 18
    cell_h = card_size[1] + label_h + 18
    rows = (len(items) + columns - 1) // columns
    output = Image.new("RGBA", (cell_w * columns, 52 + cell_h * rows), BACKGROUND)
    draw = ImageDraw.Draw(output)
    draw.text((14, 14), title, fill=(74, 48, 67, 255), font=font(24))
    for index, (name, image) in enumerate(items):
        x = (index % columns) * cell_w + 9
        y = 52 + (index // columns) * cell_h
        output.alpha_composite(crop_card(image, crop, card_size), (x, y + label_h))
        draw.text((x, y + 7), name, fill=(74, 48, 67, 255), font=font(15))
    return output


def main() -> None:
    top_items = [(name, compose(layer=asset)) for name, asset in TOPS]
    shoe_default = "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png"
    bottom_items = [
        (name, compose(bottom=asset, shoes=shoe_default, trousers=trousers))
        for name, asset, trousers in BOTTOMS
    ]
    shoe_items = [(name, compose(shoes=asset)) for name, asset in SHOES]
    accessory_items = [(name, compose(accessory=asset)) for name, asset in ACCESSORIES]

    sheets = [
        sheet("TOPS · neckline / shoulder / waist", top_items, (62, 196, 194, 312), (264, 232), 3),
        sheet("BOTTOMS · waist / crotch / hem / shoe", bottom_items, (72, 264, 184, 356), (264, 220), 3),
        sheet("SHOES · upper / sole / baseline", shoe_items, (78, 296, 178, 356), (264, 180), 3),
        sheet("ACCESSORIES · head / neck / hand anchor zones", accessory_items, (30, 32, 230, 350), (264, 420), 4),
    ]
    width = max(image.width for image in sheets)
    height = sum(image.height for image in sheets) + 24 * (len(sheets) - 1)
    output = Image.new("RGBA", (width, height), BACKGROUND)
    y = 0
    for image in sheets:
        output.alpha_composite(image, (0, y))
        y += image.height + 24
    OUT.parent.mkdir(parents=True, exist_ok=True)
    output.convert("RGB").save(OUT, optimize=True)
    render_pair_matrix()


def render_pair_matrix() -> None:
    """Render every promoted top × bottom front seam at native geometry."""
    columns = 4
    cell_w, cell_h = 300, 214
    rows = (len(TOPS) * len(BOTTOMS) + columns - 1) // columns
    output = Image.new("RGBA", (cell_w * columns, 42 + cell_h * rows), BACKGROUND)
    draw = ImageDraw.Draw(output)
    draw.text((12, 12), "TOP × BOTTOM · front waist / crotch seam matrix", fill=(74, 48, 67, 255), font=font(22))
    index = 0
    for top_name, top_asset in TOPS:
        for bottom_name, bottom_asset, trousers in BOTTOMS:
            image = compose(layer=top_asset, bottom=bottom_asset)
            crop = crop_card(image, (78, 256, 178, 322), (276, 182))
            x = (index % columns) * cell_w + 12
            y = 42 + (index // columns) * cell_h
            output.alpha_composite(crop, (x, y + 23))
            draw.text((x, y + 3), f"{top_name} + {bottom_name}", fill=(74, 48, 67, 255), font=font(13))
            index += 1
    PAIR_OUT.parent.mkdir(parents=True, exist_ok=True)
    output.convert("RGB").save(PAIR_OUT, optimize=True)


if __name__ == "__main__":
    main()
