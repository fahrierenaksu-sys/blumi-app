#!/usr/bin/env python3
"""Install the approved cheeky Blumi face without redrawing its anatomy."""

from itertools import product
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
PROFILE_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMB_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-premium-face-v4"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-premium-face-v4-qa"

CANVAS = (256, 384)
SOURCE_CANVAS = (1254, 1254)
PLACED_SIZE = (176, 176)
PLACED_ORIGIN = (40, 78)
BACKGROUND = (251, 242, 248, 255)

EYE_SLUGS = (
    "mocha_doe",
    "sage_glass",
    "twilight_plum",
    "hazel_almond_doe",
    "deep_brown_star",
    "cocoa_puppy",
    "honey_amber",
    "chestnut_luminous",
)
NOSE_SLUGS = (
    "soft_button",
    "petal_curve",
    "gentle_bridge",
    "tiny_upturned",
    "petite_rounded",
    "heart_tip",
    "narrow_button",
    "sculpted_doll",
)
MOUTH_SLUGS = (
    "peach_whisper_smile",
    "rose_gloss_smile",
    "berry_soft_kiss",
    "coral_bow_smile",
    "nude_pink_whisper",
    "cherry_balm_smile",
    "soft_mauve_smile",
    "rosewater_cupid_bow",
)
HAIR_SLUGS = (
    "mocha_ribbon_blowout",
    "midnight_french_bob",
    "honey_halfup_waves",
    "cherry_ribbon_twin_braids",
    "rosewood_butterfly_layers",
    "caramel_braided_crown",
    "berry_velvet_soft_updo",
)

MOTION_OFFSETS = {
    "walking_front_f01": (0, 0, 0),
    "walking_front_f02": (-1, -1, -2),
    "walking_front_f03": (0, -2, 0),
    "walking_front_f04": (1, -1, 2),
    "sitting_front_f01": (0, 0, 0),
}


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def transparent_canvas() -> Image.Image:
    return Image.new("RGBA", CANVAS, (0, 0, 0, 0))


def place_source_canvas(source: Image.Image) -> Image.Image:
    if source.size != SOURCE_CANVAS:
        raise ValueError(f"Expected {SOURCE_CANVAS}, got {source.size}")
    layer = transparent_canvas()
    layer.alpha_composite(
        source.resize(PLACED_SIZE, Image.Resampling.LANCZOS),
        PLACED_ORIGIN,
    )
    return layer


def match_body_skin(source: Image.Image) -> Image.Image:
    image = source.copy()
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            brightness = (red + green + blue) / 3
            weight = max(0.0, min(1.0, (brightness - 85) / 145))
            pixels[x, y] = (
                red,
                min(255, round(green + 22 * weight)),
                min(255, round(blue + 45 * weight)),
                alpha,
            )
    return image


def match_face_skin_on_body(source: Image.Image) -> Image.Image:
    image = source.copy()
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            brightness = (red + green + blue) / 3
            weight = max(0.0, min(1.0, (brightness - 70) / 185))
            pixels[x, y] = (
                red,
                max(0, round(green - 10 * weight)),
                max(0, round(blue - 16 * weight)),
                alpha,
            )
    return image


def build_clean_foundation_neck(foundation: Image.Image) -> Image.Image:
    result = foundation.copy()
    pixels = result.load()
    for y in range(208, 221):
        progress = max(0.0, min(1.0, (y - 208) / 12))
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            pixels[x, y] = (
                254,
                round(201 + 12 * progress),
                round(159 + 18 * progress),
                alpha,
            )
    return result


def recolor_champagne_blonde(layer: Image.Image) -> Image.Image:
    recolored = layer.copy()
    pixels = recolored.load()
    for y in range(recolored.height):
        for x in range(recolored.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            is_brown_hair = red > green * 1.15 and green > blue * 1.15
            if not is_brown_hair:
                continue
            luminance = max(
                0.0,
                min(1.0, (0.3 * red + 0.59 * green + 0.11 * blue - 35) / 180),
            )
            pixels[x, y] = (
                round(165 + 90 * luminance),
                round(105 + 105 * luminance),
                round(35 + 80 * luminance),
                alpha,
            )
    return recolored


def composite(*layers: Image.Image) -> Image.Image:
    image = transparent_canvas()
    for layer in layers:
        image.alpha_composite(layer)
    return image


def feature_difference(
    full_face: Image.Image,
    foundation: Image.Image,
    region: tuple[int, int, int, int],
) -> Image.Image:
    difference = ImageChops.difference(full_face.convert("RGB"), foundation.convert("RGB"))
    strength = difference.convert("L").point(
        lambda value: 0 if value <= 9 else min(255, (value - 9) * 5)
    )
    region_mask = Image.new("L", SOURCE_CANVAS, 0)
    ImageDraw.Draw(region_mask).rounded_rectangle(region, radius=26, fill=255)
    alpha = ImageChops.multiply(strength, region_mask)
    alpha = ImageChops.multiply(alpha, full_face.getchannel("A"))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.45))
    feature = full_face.copy()
    feature.putalpha(alpha)
    return feature


def cleaned_body() -> Image.Image:
    # The first walking guide retains the approved body and neck geometry even
    # while the static base is being regenerated by this pipeline.
    body = Image.open(
        SOURCE_DIR / "motion-guides/base_walking_front_f01.png"
    ).convert("RGBA")
    alpha = body.getchannel("A")
    erase = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(erase)
    draw.ellipse((48, 75, 208, 216), fill=255)
    alpha.paste(0, mask=erase)
    body.putalpha(alpha)
    return match_face_skin_on_body(body)


def build_layers() -> tuple[Image.Image, Image.Image, Image.Image, Image.Image, Image.Image]:
    full_face = Image.open(SOURCE_DIR / "approved-face.png").convert("RGBA")
    blank_face = Image.open(SOURCE_DIR / "approved-foundation.png").convert("RGBA")
    hair_source = Image.open(SOURCE_DIR / "approved-mocha-hair.png").convert("RGBA")

    foundation = build_clean_foundation_neck(
        place_source_canvas(match_body_skin(blank_face))
    )
    eyes = place_source_canvas(
        feature_difference(full_face, blank_face, (330, 455, 930, 710))
    )
    nose = place_source_canvas(
        feature_difference(full_face, blank_face, (535, 675, 720, 815))
    )
    mouth = place_source_canvas(
        feature_difference(full_face, blank_face, (485, 785, 775, 920))
    )
    hair = place_source_canvas(hair_source)
    return foundation, eyes, nose, mouth, hair


def shift_layer(layer: Image.Image, x: int, y: int) -> Image.Image:
    shifted = transparent_canvas()
    shifted.alpha_composite(layer, (x, y))
    return shifted


def fit_v3_layer_to_v4(layer: Image.Image) -> Image.Image:
    scale = PLACED_SIZE[0] / 200
    inverse = 1 / scale
    old_x, old_y = (28, 63)
    new_x, new_y = PLACED_ORIGIN
    return layer.transform(
        CANVAS,
        Image.Transform.AFFINE,
        (
            inverse,
            0,
            old_x - new_x * inverse,
            0,
            inverse,
            old_y - new_y * inverse,
        ),
        Image.Resampling.BICUBIC,
    )


def clean_motion_body(suffix: str) -> Image.Image:
    body = Image.open(SOURCE_DIR / f"motion-guides/base_{suffix}.png").convert("RGBA")
    alpha = body.getchannel("A")
    erase = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(erase)
    draw.ellipse((45, 72, 211, 216), fill=255)
    alpha.paste(0, mask=erase)
    body.putalpha(alpha)
    return match_face_skin_on_body(body)


def install_motion(
    foundation: Image.Image,
    eyes: Image.Image,
    nose: Image.Image,
    mouth: Image.Image,
    hair: Image.Image,
) -> None:
    motion_dir = ROOM_DIR / "motion"
    for suffix, (face_x, face_y, hair_x) in MOTION_OFFSETS.items():
        save(
            clean_motion_body(suffix),
            motion_dir / f"room_avatar_base_female_v2_{suffix}.png",
        )
        save(
            shift_layer(foundation, face_x, face_y),
            motion_dir
            / f"room_avatar_face_female_soft_doll_foundation_v2_{suffix}.png",
        )
        save(
            shift_layer(eyes, face_x, face_y),
            motion_dir / f"room_avatar_eyes_female_mocha_doe_v2_{suffix}.png",
        )
        save(
            shift_layer(nose, face_x, face_y),
            motion_dir / f"room_avatar_nose_female_soft_button_v2_{suffix}.png",
        )
        save(
            shift_layer(mouth, face_x, face_y),
            motion_dir / f"room_avatar_mouth_female_peach_whisper_smile_v2_{suffix}.png",
        )
        for part in ("back", "front"):
            save(
                shift_layer(hair, hair_x, face_y),
                motion_dir
                / f"room_avatar_hair_{part}_female_mocha_ribbon_blowout_v2_{suffix}.png",
            )

        for kind, slugs in (
            ("eyes", EYE_SLUGS[1:3]),
            ("nose", NOSE_SLUGS[1:3]),
            ("mouth", MOUTH_SLUGS[1:3]),
        ):
            for slug in slugs:
                layer = Image.open(
                    ROOM_DIR / f"avatar_room_{kind}_female_{slug}_v2.png"
                ).convert("RGBA")
                save(
                    shift_layer(layer, face_x, face_y),
                    motion_dir / f"room_avatar_{kind}_female_{slug}_v2_{suffix}.png",
                )
        for slug in HAIR_SLUGS[1:3]:
            for part in ("back", "front"):
                layer = Image.open(
                    ROOM_DIR / f"avatar_room_hair_{part}_female_{slug}_v2.png"
                ).convert("RGBA")
                save(
                    shift_layer(layer, hair_x, face_y),
                    motion_dir / f"room_avatar_hair_{part}_female_{slug}_v2_{suffix}.png",
                )


def install() -> tuple[Image.Image, Image.Image, Image.Image, Image.Image, Image.Image, Image.Image]:
    foundation, eyes, nose, mouth, hair = build_layers()
    body = cleaned_body()

    save(body, ROOM_DIR / "avatar_room_base_female_v2.png")
    save(foundation, ROOM_DIR / "avatar_room_face_female_soft_doll_foundation_v2.png")
    save(eyes, ROOM_DIR / "avatar_room_eyes_female_mocha_doe_v2.png")
    save(nose, ROOM_DIR / "avatar_room_nose_female_soft_button_v2.png")
    save(mouth, ROOM_DIR / "avatar_room_mouth_female_peach_whisper_smile_v2.png")
    for part in ("back", "front"):
        save(
            hair,
            ROOM_DIR / f"avatar_room_hair_{part}_female_mocha_ribbon_blowout_v2.png",
        )

    for image, path in (
        (foundation, PROFILE_DIR / "avatar_face_soft_doll_foundation.png"),
        (eyes, PROFILE_DIR / "avatar_eyes_mocha_doe.png"),
        (nose, PROFILE_DIR / "avatar_nose_soft_button.png"),
        (mouth, PROFILE_DIR / "avatar_mouth_peach_whisper_smile.png"),
        (hair, PROFILE_DIR / "avatar_hair_mocha_ribbon_blowout.png"),
    ):
        save(image.resize((512, 768), Image.Resampling.LANCZOS), path)

    legacy_source_dir = SOURCE_DIR / "v3-static"
    for kind, slugs in (
        ("eyes", EYE_SLUGS[1:]),
        ("nose", NOSE_SLUGS[1:]),
        ("mouth", MOUTH_SLUGS[1:]),
    ):
        for slug in slugs:
            filename = f"avatar_room_{kind}_female_{slug}_v2.png"
            layer = fit_v3_layer_to_v4(
                Image.open(legacy_source_dir / filename).convert("RGBA")
            )
            save(layer, ROOM_DIR / filename)
            save(
                layer.resize((512, 768), Image.Resampling.LANCZOS),
                PROFILE_DIR / f"avatar_{kind}_{slug}.png",
            )
    for slug in HAIR_SLUGS[1:]:
        combined = transparent_canvas()
        for part in ("back", "front"):
            filename = f"avatar_room_hair_{part}_female_{slug}_v2.png"
            layer = fit_v3_layer_to_v4(
                Image.open(legacy_source_dir / filename).convert("RGBA")
            )
            if slug == "honey_halfup_waves":
                layer = recolor_champagne_blonde(layer)
            save(layer, ROOM_DIR / filename)
            combined.alpha_composite(layer)
        save(
            combined.resize((512, 768), Image.Resampling.LANCZOS),
            PROFILE_DIR / f"avatar_hair_{slug}.png",
        )

    install_motion(foundation, eyes, nose, mouth, hair)

    return body, foundation, eyes, nose, mouth, hair


def build_qa(
    body: Image.Image,
    foundation: Image.Image,
    eyes: Image.Image,
    nose: Image.Image,
    mouth: Image.Image,
    hair: Image.Image,
) -> None:
    top = Image.open(ROOM_DIR / "avatar_room_top_female_cream_basic_tee_v2.png").convert("RGBA")
    bottom = Image.open(ROOM_DIR / "avatar_room_bottom_female_denim_skort_shorts_v2.png").convert("RGBA")
    face = composite(body, foundation, eyes, nose, mouth)
    dressed = composite(hair, body, foundation, eyes, nose, mouth, bottom, top, hair)

    sheet = Image.new("RGBA", (1200, 900), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((45, 28), "Approved Face V4 - exact source decomposition", fill=(73, 53, 71, 255))
    sheet.alpha_composite(face.crop((55, 72, 201, 245)).resize((440, 520), Image.Resampling.LANCZOS), (70, 100))
    sheet.alpha_composite(dressed.resize((480, 720), Image.Resampling.LANCZOS), (640, 95))
    save(sheet, QA_DIR / "approved_face_v4_static_fit.png")

    thumb = dressed.crop((55, 72, 201, 340)).resize((220, 220), Image.Resampling.LANCZOS)
    for path in (
        THUMB_DIR / "avatar_v2_eyes_mocha_doe.png",
        THUMB_DIR / "avatar_v2_nose_soft_button.png",
        THUMB_DIR / "avatar_v2_mouth_peach_whisper_smile.png",
        THUMB_DIR / "avatar_v2_hair_mocha_ribbon_blowout.png",
    ):
        save(thumb, path)

    default_bottom = bottom
    for kind, slugs in (
        ("eyes", EYE_SLUGS),
        ("nose", NOSE_SLUGS),
        ("mouth", MOUTH_SLUGS),
        ("hair", HAIR_SLUGS),
    ):
        for slug in slugs:
            selected_eyes = eyes
            selected_nose = nose
            selected_mouth = mouth
            selected_hair = hair
            if kind == "eyes":
                selected_eyes = Image.open(
                    ROOM_DIR / f"avatar_room_eyes_female_{slug}_v2.png"
                ).convert("RGBA")
            elif kind == "nose":
                selected_nose = Image.open(
                    ROOM_DIR / f"avatar_room_nose_female_{slug}_v2.png"
                ).convert("RGBA")
            elif kind == "mouth":
                selected_mouth = Image.open(
                    ROOM_DIR / f"avatar_room_mouth_female_{slug}_v2.png"
                ).convert("RGBA")
            else:
                selected_hair = Image.open(
                    ROOM_DIR / f"avatar_room_hair_front_female_{slug}_v2.png"
                ).convert("RGBA")
            preview = composite(
                selected_hair,
                body,
                foundation,
                selected_eyes,
                selected_nose,
                selected_mouth,
                default_bottom,
                top,
                selected_hair,
            )
            save(
                preview.crop((55, 72, 201, 340)).resize(
                    (220, 220), Image.Resampling.LANCZOS
                ),
                THUMB_DIR / f"avatar_v2_{kind}_{slug}.png",
            )

    faces = Image.new("RGBA", (1600, 1040), BACKGROUND)
    face_draw = ImageDraw.Draw(faces)
    for index, (eye_slug, nose_slug, mouth_slug) in enumerate(
        zip(EYE_SLUGS, NOSE_SLUGS, MOUTH_SLUGS)
    ):
        column = index % 4
        row = index // 4
        x = 25 + column * 390
        y = 20 + row * 505
        face_draw.text((x, y), f"Face {index + 1}", fill=(73, 53, 71, 255))
        eye = Image.open(ROOM_DIR / f"avatar_room_eyes_female_{eye_slug}_v2.png").convert("RGBA")
        nose_layer = Image.open(ROOM_DIR / f"avatar_room_nose_female_{nose_slug}_v2.png").convert("RGBA")
        mouth_layer = Image.open(ROOM_DIR / f"avatar_room_mouth_female_{mouth_slug}_v2.png").convert("RGBA")
        render = composite(body, foundation, eye, nose_layer, mouth_layer)
        faces.alpha_composite(
            render.crop((55, 72, 201, 245)).resize((352, 442), Image.Resampling.LANCZOS),
            (x + 18, y + 38),
        )
    save(faces, QA_DIR / "approved_face_v4_feature_collection.png")

    combinations = Image.new("RGBA", (1800, 1640), BACKGROUND)
    combination_draw = ImageDraw.Draw(combinations)
    for index, (eye_slug, nose_slug, mouth_slug) in enumerate(
        product(EYE_SLUGS[:3], NOSE_SLUGS[:3], MOUTH_SLUGS[:3])
    ):
        column = index % 6
        row = index // 6
        x = 20 + column * 295
        y = 20 + row * 320
        combination_draw.text(
            (x, y),
            f"E{EYE_SLUGS.index(eye_slug) + 1} N{NOSE_SLUGS.index(nose_slug) + 1} M{MOUTH_SLUGS.index(mouth_slug) + 1}",
            fill=(73, 53, 71, 255),
        )
        eye = Image.open(
            ROOM_DIR / f"avatar_room_eyes_female_{eye_slug}_v2.png"
        ).convert("RGBA")
        nose_layer = Image.open(
            ROOM_DIR / f"avatar_room_nose_female_{nose_slug}_v2.png"
        ).convert("RGBA")
        mouth_layer = Image.open(
            ROOM_DIR / f"avatar_room_mouth_female_{mouth_slug}_v2.png"
        ).convert("RGBA")
        render = composite(body, foundation, eye, nose_layer, mouth_layer)
        combinations.alpha_composite(
            render.crop((55, 72, 201, 245)).resize(
                (258, 288), Image.Resampling.LANCZOS
            ),
            (x + 18, y + 25),
        )
    save(combinations, QA_DIR / "approved_face_v4_27_combinations.png")

    hairstyles = Image.new("RGBA", (1500, 1230), BACKGROUND)
    hair_draw = ImageDraw.Draw(hairstyles)
    for index, hair_slug in enumerate(HAIR_SLUGS):
        column = index % 3
        row = index // 3
        x = 25 + column * 490
        y = 20 + row * 400
        hair_label = (
            "Golden Blonde Half-Up Waves"
            if hair_slug == "honey_halfup_waves"
            else hair_slug.replace("_", " ").title()
        )
        hair_draw.text((x, y), hair_label, fill=(73, 53, 71, 255))
        hair_layer = Image.open(
            ROOM_DIR / f"avatar_room_hair_front_female_{hair_slug}_v2.png"
        ).convert("RGBA")
        render = composite(
            hair_layer,
            body,
            foundation,
            eyes,
            nose,
            mouth,
            top,
            hair_layer,
        )
        hairstyles.alpha_composite(
            render.resize((240, 360), Image.Resampling.LANCZOS),
            (x + 125, y + 25),
        )
    save(hairstyles, QA_DIR / "approved_face_v4_hair_collection.png")


def main() -> None:
    build_qa(*install())


if __name__ == "__main__":
    main()
