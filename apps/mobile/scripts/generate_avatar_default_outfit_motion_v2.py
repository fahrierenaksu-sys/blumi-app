#!/usr/bin/env python3
"""Fit the default outfit to the approved female walking and sitting rig."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-default-outfit-motion-qa"
SHOE_SOURCE = QA_DIR / "premium_shoes_generation_source.png"
THUMBNAIL_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
CANVAS = (256, 384)
SCALE = 4
BACKGROUND = (251, 242, 248, 255)

VISIBLE_ITEMS = {
    "top": (
        "cream_basic_tee",
        "blush_lace_cardigan",
        "sage_ribbon_knit_jacket",
        "cherry_heart_milkmaid_blouse",
        "powder_blue_ribbon_corset_top",
        "noir_rose_heart_cardigan",
        "boho_patchwork_maxi_dress",
        "embroidered_halter_wrap_dress",
        "ruched_patchwork_mini_dress",
        "white_lace_cami_mini_dress",
    ),
    "bottom": (
        "denim_skort_shorts",
        "striped_crochet_shorts",
        "layered_lace_ruffle_mini_skirt",
        "black_palm_embellished_pants",
        "coral_embellished_laceup_pants",
        "smoky_floral_mesh_pants",
        "yellow_bow_lace_ruffle_skirt",
    ),
    "shoes": (
        "milk_tea_court_sneakers",
        "cherry_satin_ballets",
        "onyx_heart_mary_janes",
        "rosewood_platform_loafers",
        "pearl_slingback_sandals",
    ),
    "hair": (
        "mocha_ribbon_blowout",
        "midnight_french_bob",
        "honey_halfup_waves",
        "cherry_ribbon_twin_braids",
        "rosewood_butterfly_layers",
        "caramel_braided_crown",
        "berry_velvet_soft_updo",
    ),
    "accessory": (
        "ivory_ribbon_beret",
        "cherry_bow_headband",
        "sage_heart_glasses",
        "pearl_drop_earrings",
        "golden_heart_locket",
        "buttercream_neck_scarf",
        "cherry_micro_bag",
        "sunny_star_clips",
    ),
}


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def transparent(size: tuple[int, int] = CANVAS) -> Image.Image:
    return Image.new("RGBA", size, (0, 0, 0, 0))


def scaled(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    return [(x * SCALE, y * SCALE) for x, y in points]


def build_sitting_top() -> Image.Image:
    layer = transparent((CANVAS[0] * SCALE, CANVAS[1] * SCALE))
    draw = ImageDraw.Draw(layer)
    cream = (255, 246, 215, 255)
    cream_shadow = (244, 224, 193, 175)
    pink = (225, 132, 151, 255)

    bodice = scaled([
        (106, 222), (150, 222), (157, 232), (159, 263),
        (156, 286), (100, 286), (97, 263), (99, 232),
    ])
    draw.polygon(bodice, fill=cream, outline=pink, width=2 * SCALE)
    draw.polygon(
        scaled([(100, 232), (92, 236), (89, 245), (96, 251), (103, 242)]),
        fill=cream,
        outline=pink,
        width=2 * SCALE,
    )
    draw.polygon(
        scaled([(156, 232), (164, 236), (167, 245), (160, 251), (153, 242)]),
        fill=cream,
        outline=pink,
        width=2 * SCALE,
    )

    draw.ellipse(
        (116 * SCALE, 216 * SCALE, 140 * SCALE, 238 * SCALE),
        fill=(0, 0, 0, 0),
    )
    draw.arc(
        (116 * SCALE, 216 * SCALE, 140 * SCALE, 238 * SCALE),
        start=0,
        end=180,
        fill=pink,
        width=2 * SCALE,
    )
    draw.polygon(
        scaled([(99, 267), (105, 281), (151, 281), (157, 267), (157, 286), (99, 286)]),
        fill=cream_shadow,
    )
    draw.line(scaled([(102, 284), (154, 284)]), fill=(238, 189, 174, 170), width=SCALE)

    draw.ellipse(
        (124 * SCALE, 248 * SCALE, 128 * SCALE, 252 * SCALE),
        fill=pink,
    )
    draw.ellipse(
        (128 * SCALE, 248 * SCALE, 132 * SCALE, 252 * SCALE),
        fill=pink,
    )
    draw.line(
        scaled([(128, 251), (128, 257)]),
        fill=pink,
        width=SCALE,
    )
    return layer.resize(CANVAS, Image.Resampling.LANCZOS)


def build_sitting_bottom() -> Image.Image:
    layer = transparent((CANVAS[0] * SCALE, CANVAS[1] * SCALE))
    draw = ImageDraw.Draw(layer)
    denim = (88, 163, 202, 255)
    denim_light = (119, 188, 219, 235)
    denim_dark = (45, 112, 158, 255)
    stitch = (224, 197, 150, 190)

    draw.rounded_rectangle(
        (98 * SCALE, 282 * SCALE, 158 * SCALE, 293 * SCALE),
        radius=4 * SCALE,
        fill=denim_dark,
        outline=(39, 93, 135, 255),
        width=SCALE,
    )
    # A seated wrap-skirt silhouette: narrow at the waist, curved over both knees.
    draw.polygon(
        scaled([
            (96, 289), (160, 289), (166, 296), (168, 304),
            (164, 311), (151, 317), (128, 320), (105, 317),
            (92, 311), (88, 304), (90, 296),
        ]),
        fill=denim_dark,
        outline=denim_dark,
        width=SCALE,
    )
    draw.polygon(
        scaled([
            (96, 290), (130, 290), (136, 299), (132, 309),
            (119, 317), (105, 315), (93, 309), (90, 302),
        ]),
        fill=denim,
    )
    draw.polygon(
        scaled([
            (124, 290), (160, 290), (166, 298), (165, 306),
            (155, 313), (137, 318), (119, 317), (132, 307),
        ]),
        fill=denim_light,
    )
    draw.line(scaled([(100, 287), (156, 287)]), fill=stitch, width=SCALE)
    draw.line(
        scaled([(124, 292), (143, 315)]),
        fill=(40, 102, 145, 215),
        width=SCALE,
    )
    draw.line(
        scaled([(94, 307), (106, 314), (128, 318), (151, 314), (163, 307)]),
        fill=stitch,
        width=SCALE,
    )
    draw.line(scaled([(101, 290), (98, 306)]), fill=(148, 205, 227, 165), width=SCALE)
    draw.line(scaled([(155, 290), (159, 305)]), fill=(63, 132, 175, 175), width=SCALE)
    return layer.resize(CANVAS, Image.Resampling.LANCZOS)


def fit_sitting_shoe_pair(source: Image.Image) -> Image.Image:
    fitted = transparent()
    target_boxes = ((93, 322, 127, 346), (129, 322, 163, 346))
    source_boxes = ((0, 280, 128, 360), (128, 280, 256, 360))
    for source_box, target_box in zip(source_boxes, target_boxes):
        half = source.crop(source_box)
        alpha_box = half.getchannel("A").getbbox()
        if alpha_box is None:
            continue
        component = half.crop(alpha_box).resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        fitted.alpha_composite(component, target_box[:2])
    return fitted


def chroma_alpha(image: Image.Image) -> Image.Image:
    """Remove the generated flat green field without repainting shoe edges."""
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, _alpha in rgba.getdata():
        green_distance = green - max(red, blue)
        if green > 145 and green_distance > 50:
            alpha = 0
        elif green > 105 and green_distance > 20:
            alpha = max(0, 255 - (green_distance - 20) * 5)
        else:
            alpha = 255
        pixels.append((red, green, blue, alpha))
    rgba.putdata(pixels)
    return rgba


def install_premium_static_shoes() -> None:
    """Extract only the approved generated footwear and fit it to the room feet."""
    if not SHOE_SOURCE.exists():
        return

    source = chroma_alpha(Image.open(SHOE_SOURCE))
    # Each crop contains footwear only. The generated body is deliberately excluded.
    source_boxes = {
        "milk_tea_court_sneakers": (93, 602, 229, 686),
        "cherry_satin_ballets": (452, 607, 590, 681),
        "onyx_heart_mary_janes": (805, 604, 950, 684),
        "rosewood_platform_loafers": (1155, 601, 1309, 685),
        "pearl_slingback_sandals": (1511, 602, 1670, 684),
    }
    target_boxes = {
        "milk_tea_court_sneakers": (99, 319, 157, 348),
        "cherry_satin_ballets": (100, 321, 156, 347),
        "onyx_heart_mary_janes": (99, 318, 157, 348),
        "rosewood_platform_loafers": (99, 319, 157, 349),
        "pearl_slingback_sandals": (100, 320, 156, 348),
    }
    for slug, source_box in source_boxes.items():
        shoe_pair = source.crop(source_box)
        alpha_box = shoe_pair.getchannel("A").getbbox()
        if alpha_box is None:
            continue
        shoe_pair = shoe_pair.crop(alpha_box)
        target_box = target_boxes[slug]
        shoe_pair = shoe_pair.resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        fitted = transparent()
        fitted.alpha_composite(shoe_pair, target_box[:2])
        save(fitted, ROOM_DIR / f"avatar_room_shoes_female_{slug}_v2.png")


def fit_premium_pair_to_motion(
    source: Image.Image,
    target_boxes: tuple[tuple[int, int, int, int], tuple[int, int, int, int]],
) -> Image.Image:
    """Fit each premium shoe to foot boxes measured from the approved motion base."""
    fitted = transparent()
    for (x0, x1), target_box in zip(((0, 128), (128, 256)), target_boxes):
        source_half = source.crop((x0, 280, x1, 360))
        source_alpha = source_half.getchannel("A").getbbox()
        if source_alpha is None:
            continue
        component = source_half.crop(source_alpha)
        component = component.resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        fitted.alpha_composite(component, target_box[:2])
    return fitted


def install_premium_walking_shoes() -> None:
    frame_targets = {
        1: ((98, 322, 127, 348), (129, 322, 158, 348)),
        2: ((102, 313, 129, 338), (119, 322, 148, 348)),
        3: ((102, 322, 130, 348), (123, 313, 150, 339)),
        4: ((102, 313, 129, 338), (119, 322, 148, 348)),
    }
    for slug in VISIBLE_ITEMS["shoes"]:
        static_path = ROOM_DIR / f"avatar_room_shoes_female_{slug}_v2.png"
        source = Image.open(static_path).convert("RGBA")
        for frame in range(1, 5):
            path = MOTION_DIR / f"room_avatar_shoes_female_{slug}_v2_walking_front_f0{frame}.png"
            save(fit_premium_pair_to_motion(source, frame_targets[frame]), path)


def clear_lower_face_hair_overlap(image: Image.Image) -> Image.Image:
    """Keep bangs intact while protecting the approved cheek and chin silhouette."""
    safe_mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(safe_mask)
    draw.ellipse((89, 108, 167, 210), fill=255)
    draw.rectangle((0, 0, 255, 147), fill=0)
    alpha = image.getchannel("A")
    alpha = ImageChops.subtract(alpha, safe_mask)
    result = image.copy()
    result.putalpha(alpha)
    return result


def install_face_safe_hair_fronts() -> None:
    slugs = (
        "honey_halfup_waves",
        "cherry_ribbon_twin_braids",
        "rosewood_butterfly_layers",
        "caramel_braided_crown",
        "berry_velvet_soft_updo",
    )
    for slug in slugs:
        paths = [ROOM_DIR / f"avatar_room_hair_front_female_{slug}_v2.png"]
        paths.extend(MOTION_DIR.glob(f"room_avatar_hair_front_female_{slug}_v2_*.png"))
        for path in paths:
            save(clear_lower_face_hair_overlap(Image.open(path).convert("RGBA")), path)


def install_explicit_static_head_motion_assets() -> None:
    """The approved rig keeps its head anchor fixed across walk and sit frames."""
    slugs = (
        "cherry_ribbon_twin_braids",
        "rosewood_butterfly_layers",
        "caramel_braided_crown",
        "berry_velvet_soft_updo",
    )
    suffixes = (
        "walking_front_f01",
        "walking_front_f02",
        "walking_front_f03",
        "walking_front_f04",
        "sitting_front_f01",
    )
    for slug in slugs:
        for layer_kind in ("hair_back", "hair_front"):
            source_path = ROOM_DIR / f"avatar_room_{layer_kind}_female_{slug}_v2.png"
            source = Image.open(source_path).convert("RGBA")
            for suffix in suffixes:
                target = MOTION_DIR / f"room_avatar_{layer_kind}_female_{slug}_v2_{suffix}.png"
                save(source.copy(), target)


def save_product_only_thumbnail(layers: list[Image.Image], path: Path) -> None:
    composite = transparent()
    for layer in layers:
        composite.alpha_composite(layer)
    bbox = composite.getchannel("A").getbbox()
    if bbox is None:
        return
    product = composite.crop(bbox)
    product.thumbnail((196, 196), Image.Resampling.LANCZOS)
    thumb = Image.new("RGBA", (224, 224), (0, 0, 0, 0))
    thumb.alpha_composite(product, ((224 - product.width) // 2, (224 - product.height) // 2))
    save(thumb, path)


def install_hair_head_thumbnails() -> None:
    """Shop cards show the hairstyle itself; live try-on shows the worn result."""
    for slug in VISIBLE_ITEMS["hair"]:
        layers = [
            Image.open(ROOM_DIR / f"avatar_room_hair_back_female_{slug}_v2.png").convert("RGBA"),
            Image.open(ROOM_DIR / f"avatar_room_hair_front_female_{slug}_v2.png").convert("RGBA"),
        ]
        save_product_only_thumbnail(
            layers,
            THUMBNAIL_DIR / f"avatar_v2_hair_{slug}.png",
        )


def install_clothing_shop_thumbnails() -> None:
    """Product cards stay item-only; the Shop hero owns the live try-on composite."""
    for kind in ("top", "bottom", "shoes"):
        for slug in VISIBLE_ITEMS[kind]:
            if (kind, slug) in (("top", "cream_basic_tee"), ("bottom", "denim_skort_shorts")):
                continue
            layers: list[Image.Image] = []
            if kind == "top":
                paired_bottom = ROOM_DIR / f"avatar_room_bottom_female_{slug}_v2.png"
                if paired_bottom.exists():
                    layers.append(Image.open(paired_bottom).convert("RGBA"))
            layers.append(
                Image.open(ROOM_DIR / f"avatar_room_{kind}_female_{slug}_v2.png").convert("RGBA")
            )
            prefix = "top" if kind == "top" else kind
            save_product_only_thumbnail(
                layers,
                THUMBNAIL_DIR / f"avatar_v2_{prefix}_{slug}.png",
            )


def install_accessory_shop_thumbnails() -> None:
    for slug in VISIBLE_ITEMS["accessory"]:
        layer = Image.open(
            ROOM_DIR / f"avatar_room_accessory_female_{slug}_v2.png"
        ).convert("RGBA")
        save_product_only_thumbnail(
            [layer],
            THUMBNAIL_DIR / f"avatar_v2_accessory_{slug}.png",
        )


def fit_sitting_trousers(source: Image.Image) -> Image.Image:
    """Rebuild seated full-length trousers as two knee-to-shoe leg volumes."""
    fitted = transparent()
    target_boxes = ((89, 284, 128, 338), (128, 284, 167, 338))
    silhouettes = (
        [(89, 284), (128, 284), (126, 338), (98, 338), (92, 320)],
        [(128, 284), (167, 284), (164, 320), (158, 338), (130, 338)],
    )
    for (x0, x1), target_box, silhouette in zip(
        ((0, 128), (128, 256)), target_boxes, silhouettes
    ):
        half = source.crop((x0, 250, x1, 355))
        alpha_box = half.getchannel("A").getbbox()
        if alpha_box is None:
            continue
        component = half.crop(alpha_box).resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        component_layer = transparent()
        component_layer.alpha_composite(component, target_box[:2])
        mask = Image.new("L", CANVAS, 0)
        ImageDraw.Draw(mask).polygon(silhouette, fill=255)
        component_layer.putalpha(ImageChops.multiply(component_layer.getchannel("A"), mask))
        fitted.alpha_composite(component_layer)
    return fitted


def install_sitting_trousers() -> None:
    trouser_slugs = (
        "black_palm_embellished_pants",
        "coral_embellished_laceup_pants",
        "smoky_floral_mesh_pants",
    )
    for slug in trouser_slugs:
        static_path = ROOM_DIR / f"avatar_room_bottom_female_{slug}_v2.png"
        target_path = MOTION_DIR / f"room_avatar_bottom_female_{slug}_v2_sitting_front_f01.png"
        save(fit_sitting_trousers(Image.open(static_path).convert("RGBA")), target_path)


def normalize_accessory_component(
    image: Image.Image,
    max_size: tuple[int, int],
    offset: tuple[int, int] = (0, 0),
) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return image
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    if width <= max_size[0] and height <= max_size[1]:
        return image
    scale = min(max_size[0] / width, max_size[1] / height)
    component = image.crop(bbox).resize(
        (max(1, round(width * scale)), max(1, round(height * scale))),
        Image.Resampling.LANCZOS,
    )
    center_x = (bbox[0] + bbox[2]) // 2 + offset[0]
    center_y = (bbox[1] + bbox[3]) // 2 + offset[1]
    fitted = transparent()
    fitted.alpha_composite(
        component,
        (center_x - component.width // 2, center_y - component.height // 2),
    )
    return fitted


def install_normalized_accessories() -> None:
    fit_specs = {
        "cherry_bow_headband": ((94, 60), (0, 2)),
        "sage_heart_glasses": ((66, 28), (0, 0)),
        "pearl_drop_earrings": ((66, 36), (0, 0)),
        "buttercream_neck_scarf": ((64, 37), (0, 8)),
        "cherry_micro_bag": ((68, 112), (0, 0)),
        "sunny_star_clips": ((56, 25), (0, 0)),
    }
    for slug, (max_size, offset) in fit_specs.items():
        paths = [ROOM_DIR / f"avatar_room_accessory_female_{slug}_v2.png"]
        paths.extend(MOTION_DIR.glob(f"room_avatar_accessory_female_{slug}_v2_*.png"))
        for path in paths:
            source = Image.open(path).convert("RGBA")
            fitted = normalize_accessory_component(source, max_size, offset)
            if slug == "sage_heart_glasses":
                alpha = fitted.getchannel("A")
                if alpha.getextrema()[1] > 165:
                    alpha = alpha.point(lambda value: min(value, 155))
                    fitted.putalpha(alpha)
            save(fitted, path)


def install_sitting_assets() -> None:
    install_normalized_accessories()
    install_face_safe_hair_fronts()
    install_explicit_static_head_motion_assets()
    install_hair_head_thumbnails()
    install_accessory_shop_thumbnails()
    install_premium_static_shoes()
    install_premium_walking_shoes()
    install_sitting_trousers()
    save(
        build_sitting_top(),
        MOTION_DIR / "room_avatar_top_female_cream_basic_tee_v2_sitting_front_f01.png",
    )
    save(
        build_sitting_bottom(),
        MOTION_DIR / "room_avatar_bottom_female_denim_skort_shorts_v2_sitting_front_f01.png",
    )
    for static_path in ROOM_DIR.glob("avatar_room_shoes_female_*_v2.png"):
        slug = static_path.name.removeprefix("avatar_room_shoes_female_").removesuffix("_v2.png")
        if slug == "cream_sneakers":
            continue
        save(
            fit_sitting_shoe_pair(Image.open(static_path).convert("RGBA")),
            MOTION_DIR / f"room_avatar_shoes_female_{slug}_v2_sitting_front_f01.png",
        )
    install_clothing_shop_thumbnails()


def load_layer(prefix: str, suffix: str | None = None) -> Image.Image:
    directory = MOTION_DIR if suffix else ROOM_DIR
    filename = f"{prefix}_{suffix}.png" if suffix else f"avatar_{prefix}.png"
    return Image.open(directory / filename).convert("RGBA")


def composite_frame(suffix: str | None) -> Image.Image:
    if suffix:
        names = [
            "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
            "room_avatar_base_female_v2",
            "room_avatar_face_female_soft_doll_foundation_v2",
            "room_avatar_eyes_female_mocha_doe_v2",
            "room_avatar_nose_female_soft_button_v2",
            "room_avatar_mouth_female_peach_whisper_smile_v2",
            "room_avatar_bottom_female_denim_skort_shorts_v2",
            "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
            "room_avatar_top_female_cream_basic_tee_v2",
            "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
        ]
        layers = [load_layer(name, suffix) for name in names]
    else:
        names = [
            "room_hair_back_female_mocha_ribbon_blowout_v2",
            "room_base_female_v2",
            "room_face_female_soft_doll_foundation_v2",
            "room_eyes_female_mocha_doe_v2",
            "room_nose_female_soft_button_v2",
            "room_mouth_female_peach_whisper_smile_v2",
            "room_bottom_female_denim_skort_shorts_v2",
            "room_shoes_female_milk_tea_court_sneakers_v2",
            "room_top_female_cream_basic_tee_v2",
            "room_hair_front_female_mocha_ribbon_blowout_v2",
        ]
        layers = [load_layer(name) for name in names]

    result = transparent()
    for layer in layers:
        result.alpha_composite(layer)
    return result


def build_qa() -> None:
    frames = [
        ("Static", None),
        ("Walk 01", "walking_front_f01"),
        ("Walk 02", "walking_front_f02"),
        ("Walk 03", "walking_front_f03"),
        ("Walk 04", "walking_front_f04"),
        ("Sit", "sitting_front_f01"),
    ]
    sheet = Image.new("RGBA", (1620, 610), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((28, 22), "Default Outfit Motion V2 - full composite fit", fill=(73, 53, 71, 255))
    for index, (label, suffix) in enumerate(frames):
        x = 20 + index * 265
        draw.text((x + 96, 60), label, fill=(73, 53, 71, 255))
        render = composite_frame(suffix)
        sheet.alpha_composite(
            render.resize((256, 384), Image.Resampling.LANCZOS),
            (x, 88),
        )
    save(sheet, QA_DIR / "default_outfit_motion_v2.png")


def composite_selected_item(kind: str, slug: str, suffix: str | None) -> Image.Image:
    if kind in ("hair", "accessory"):
        return composite_selected_feature(kind, slug, suffix)
    directory = MOTION_DIR if suffix else ROOM_DIR

    def path_for(layer_kind: str, layer_slug: str) -> Path:
        slug_part = f"_{layer_slug}" if layer_slug else ""
        if suffix:
            filename = f"room_avatar_{layer_kind}_female{slug_part}_v2_{suffix}.png"
        else:
            filename = f"avatar_room_{layer_kind}_female{slug_part}_v2.png"
        return directory / filename

    paired_top = path_for("top", slug)
    paired_bottom = path_for("bottom", slug)
    default_top = path_for("top", "cream_basic_tee")
    default_bottom = path_for("bottom", "denim_skort_shorts")
    default_shoes = path_for("shoes", "milk_tea_court_sneakers")

    top_path = paired_top if kind == "top" else default_top
    bottom_path = paired_bottom if kind == "bottom" else default_bottom
    shoes_path = default_shoes
    if kind == "top" and paired_bottom.exists():
        bottom_path = paired_bottom
    if kind == "bottom" and paired_top.exists():
        top_path = paired_top
    if kind == "shoes":
        shoes_path = path_for("shoes", slug)

    paths = [
        path_for("hair_back", "mocha_ribbon_blowout"),
        path_for("base", ""),
        path_for("face", "soft_doll_foundation"),
        path_for("eyes", "mocha_doe"),
        path_for("nose", "soft_button"),
        path_for("mouth", "peach_whisper_smile"),
        bottom_path,
        shoes_path,
        top_path,
        path_for("hair_front", "mocha_ribbon_blowout"),
    ]
    result = transparent()
    for path in paths:
        result.alpha_composite(Image.open(path).convert("RGBA"))
    return result


def feature_layer_path(layer_kind: str, slug: str, suffix: str | None) -> Path:
    slug_part = f"_{slug}" if slug else ""
    if suffix:
        motion_path = MOTION_DIR / f"room_avatar_{layer_kind}_female{slug_part}_v2_{suffix}.png"
        if motion_path.exists():
            return motion_path
    return ROOM_DIR / f"avatar_room_{layer_kind}_female{slug_part}_v2.png"


def composite_selected_feature(kind: str, slug: str, suffix: str | None) -> Image.Image:
    hair_slug = slug if kind == "hair" else "mocha_ribbon_blowout"
    paths = [
        feature_layer_path("hair_back", hair_slug, suffix),
        feature_layer_path("base", "", suffix),
        feature_layer_path("face", "soft_doll_foundation", suffix),
        feature_layer_path("eyes", "mocha_doe", suffix),
        feature_layer_path("nose", "soft_button", suffix),
        feature_layer_path("mouth", "peach_whisper_smile", suffix),
        feature_layer_path("bottom", "denim_skort_shorts", suffix),
        feature_layer_path("shoes", "milk_tea_court_sneakers", suffix),
        feature_layer_path("top", "cream_basic_tee", suffix),
    ]
    if kind == "accessory":
        paths.append(feature_layer_path("accessory", slug, suffix))
    paths.append(feature_layer_path("hair_front", hair_slug, suffix))
    result = transparent()
    for path in paths:
        result.alpha_composite(Image.open(path).convert("RGBA"))
    return result


def build_collection_qa(kind: str, suffix: str) -> None:
    prefix = f"room_avatar_{kind}_female_"
    suffix_token = f"_v2_{suffix}.png"
    slugs = sorted({
        path.name.removeprefix(prefix).removesuffix(suffix_token)
        for path in MOTION_DIR.glob(f"{prefix}*{suffix_token}")
        if "cream_sneakers" not in path.name
    })
    columns = 4
    rows = (len(slugs) + columns - 1) // columns
    sheet = Image.new("RGBA", (1200, 70 + rows * 330), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    pose_label = "Sit" if suffix.startswith("sitting") else "Walk 02"
    draw.text((24, 20), f"{kind.title()} collection - {pose_label} full composite", fill=(73, 53, 71, 255))
    for index, slug in enumerate(slugs):
        column = index % columns
        row = index // columns
        x = 20 + column * 295
        y = 55 + row * 330
        draw.text((x, y), slug.replace("_", " ").title(), fill=(73, 53, 71, 255))
        render = composite_selected_item(kind, slug, suffix)
        sheet.alpha_composite(
            render.resize((192, 288), Image.Resampling.LANCZOS),
            (x + 48, y + 24),
        )
    save(sheet, QA_DIR / f"{kind}_collection_{suffix}.png")


def build_sitting_shoe_closeup_qa() -> None:
    suffix = "sitting_front_f01"
    prefix = "room_avatar_shoes_female_"
    suffix_token = f"_v2_{suffix}.png"
    slugs = sorted({
        path.name.removeprefix(prefix).removesuffix(suffix_token)
        for path in MOTION_DIR.glob(f"{prefix}*{suffix_token}")
        if "cream_sneakers" not in path.name
    })
    columns = 3
    rows = (len(slugs) + columns - 1) // columns
    sheet = Image.new("RGBA", (1200, 60 + rows * 300), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 18), "Sitting shoes - ankle contact and baseline close-up", fill=(73, 53, 71, 255))
    for index, slug in enumerate(slugs):
        column = index % columns
        row = index // columns
        x = 20 + column * 395
        y = 50 + row * 300
        draw.text((x, y), slug.replace("_", " ").title(), fill=(73, 53, 71, 255))
        render = composite_selected_item("shoes", slug, suffix)
        closeup = render.crop((74, 270, 182, 354)).resize(
            (324, 252), Image.Resampling.LANCZOS
        )
        sheet.alpha_composite(closeup, (x + 34, y + 25))
    save(sheet, QA_DIR / "shoes_sitting_closeup.png")


def build_visible_motion_matrix(kind: str) -> None:
    frames = (
        ("Static", None),
        ("Walk 01", "walking_front_f01"),
        ("Walk 02", "walking_front_f02"),
        ("Walk 03", "walking_front_f03"),
        ("Walk 04", "walking_front_f04"),
        ("Sit", "sitting_front_f01"),
    )
    slugs = VISIBLE_ITEMS[kind]
    sheet = Image.new("RGBA", (1120, 48 + len(slugs) * 210), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), f"Visible {kind} catalog - Static / Walk 01-04 / Sit", fill=(73, 53, 71, 255))
    for column, (label, _) in enumerate(frames):
        draw.text((210 + column * 148, 16), label, fill=(73, 53, 71, 255))
    for row, slug in enumerate(slugs):
        y = 45 + row * 210
        draw.text((18, y + 82), slug.replace("_", " ").title(), fill=(73, 53, 71, 255))
        for column, (_, suffix) in enumerate(frames):
            render = composite_selected_item(kind, slug, suffix)
            sheet.alpha_composite(
                render.resize((128, 192), Image.Resampling.LANCZOS),
                (195 + column * 148, y),
            )
    save(sheet, QA_DIR / f"visible_{kind}_motion_matrix.png")


def main() -> None:
    install_sitting_assets()
    build_qa()
    for kind in ("top", "bottom", "shoes"):
        build_collection_qa(kind, "walking_front_f02")
        build_collection_qa(kind, "sitting_front_f01")
    build_sitting_shoe_closeup_qa()
    for kind in VISIBLE_ITEMS:
        build_visible_motion_matrix(kind)


if __name__ == "__main__":
    main()
