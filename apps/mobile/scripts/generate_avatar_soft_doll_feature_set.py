#!/usr/bin/env python3
"""Render the Soft Doll avatar feature collection on the approved female base.

This intentionally renders complete, base-specific art instead of scaling a product
photo or a generic template onto the avatar.  Every motion frame is redrawn from its
own pose guide so hair, face details, and shoes retain believable contact.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
ROOM_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ROOM_DIR / "motion"
PROFILE_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMB_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/avatar-soft-doll-feature-qa"
SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources/avatar-soft-doll"

CANVAS = (256, 384)
SCALE = 5
MOTION_SUFFIXES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class Style:
    slug: str
    name: str


SHOES = (
    Style("milk_tea_court_sneakers", "Milk Tea Court Sneakers"),
    Style("cherry_satin_ballets", "Cherry Satin Ballets"),
    Style("onyx_heart_mary_janes", "Onyx Heart Mary Janes"),
)
HAIR = (
    Style("mocha_ribbon_blowout", "Mocha Ribbon Blowout"),
    Style("midnight_french_bob", "Midnight French Bob"),
    Style("honey_halfup_waves", "Honey Half-Up Waves"),
)
EYES = (
    Style("mocha_doe", "Mocha Doe Eyes"),
    Style("sage_glass", "Sage Glass Eyes"),
    Style("twilight_plum", "Twilight Plum Eyes"),
)
NOSES = (
    Style("soft_button", "Soft Button Nose"),
    Style("petal_curve", "Petal Curve Nose"),
    Style("gentle_bridge", "Gentle Bridge Nose"),
)
MOUTHS = (
    Style("peach_whisper_smile", "Peach Whisper Smile"),
    Style("rose_gloss_smile", "Rose Gloss Smile"),
    Style("berry_soft_kiss", "Berry Soft Kiss"),
)


def rgba(color: tuple[int, int, int], alpha: int = 255) -> tuple[int, int, int, int]:
    return (*color, alpha)


def p(x: float, y: float) -> tuple[int, int]:
    return (round(x * SCALE), round(y * SCALE))


def rect(x0: float, y0: float, x1: float, y1: float) -> tuple[int, int, int, int]:
    return (*p(x0, y0), *p(x1, y1))


def poly(points: tuple[tuple[float, float], ...] | list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [p(x, y) for x, y in points]


def new_layer() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def downsample(image: Image.Image) -> Image.Image:
    return image.resize(CANVAS, Image.Resampling.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode == "RGBA":
        red, green, blue, alpha = image.split()
        clear = alpha.point(lambda value: 255 if value == 0 else 0)
        zero = Image.new("L", image.size, 0)
        image = Image.merge("RGBA", (Image.composite(zero, red, clear), Image.composite(zero, green, clear), Image.composite(zero, blue, clear), alpha))
    image.save(path, optimize=True)


def gradient_fill(image: Image.Image, mask: Image.Image, top: tuple[int, int, int], bottom: tuple[int, int, int], alpha: int = 255) -> None:
    paint = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(paint)
    height = image.size[1]
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[index] * (1 - t) + bottom[index] * t) for index in range(3))
        draw.line((0, y, image.size[0], y), fill=rgba(color, alpha))
    paint.putalpha(ImageChops.multiply(mask, paint.getchannel("A")))
    image.alpha_composite(paint)


def polygon_gradient(image: Image.Image, points: tuple[tuple[float, float], ...], top: tuple[int, int, int], bottom: tuple[int, int, int], *, outline: tuple[int, int, int] | None = None, alpha: int = 255) -> None:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).polygon(poly(points), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(SCALE * 0.23))
    gradient_fill(image, mask, top, bottom, alpha)
    if outline is not None:
        ImageDraw.Draw(image).line(poly(points + (points[0],)), fill=rgba(outline, 132), width=max(1, round(SCALE * 0.52)), joint="curve")


def ellipse_glow(image: Image.Image, bounds: tuple[float, float, float, float], color: tuple[int, int, int], alpha: int, blur: float = 1.4) -> None:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).ellipse(rect(*bounds), fill=alpha)
    mask = mask.filter(ImageFilter.GaussianBlur(SCALE * blur))
    tint = Image.new("RGBA", image.size, rgba(color, 0))
    tint.putalpha(mask)
    image.alpha_composite(tint)


def line(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], color: tuple[int, int, int], alpha: int, width: float) -> None:
    draw.line(poly(points), fill=rgba(color, alpha), width=max(1, round(width * SCALE)), joint="curve")


FRAME_GUIDES = {
    "static": {"face": (0.0, 10.0), "shoe_left": (0.0, 0.0), "shoe_right": (0.0, 0.0), "hair": 0.0},
    "walking_front_f01": {"face": (0.0, 10.0), "shoe_left": (-1.4, 0.0), "shoe_right": (1.4, 0.0), "hair": -0.4},
    "walking_front_f02": {"face": (-1.1, 9.0), "shoe_left": (-7.0, -1.0), "shoe_right": (4.5, 0.7), "hair": -1.8},
    "walking_front_f03": {"face": (0.0, 8.5), "shoe_left": (-2.4, -1.2), "shoe_right": (2.4, -1.2), "hair": 0.5},
    "walking_front_f04": {"face": (1.1, 9.0), "shoe_left": (-4.5, 0.7), "shoe_right": (7.0, -1.0), "hair": 1.8},
    "sitting_front_f01": {"face": (0.0, 10.0), "shoe_left": (-20.0, -1.2), "shoe_right": (20.0, -1.2), "hair": 0.0},
}


IMAGEGEN_SOURCES = {
    "mocha_ribbon_blowout": "mocha_ribbon_blowout_hair_only.png",
    "midnight_french_bob": "midnight_french_bob.png",
    "honey_halfup_waves": "honey_halfup_waves.png",
}

HAIR_BACK_MATTE = {
    "mocha_ribbon_blowout": (126, 77, 59),
    "midnight_french_bob": (55, 42, 57),
    "honey_halfup_waves": (205, 145, 78),
}


def imagegen_sprite(filename: str, size: tuple[int, int]) -> Image.Image:
    source = Image.open(SOURCE_DIR / filename).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"ImageGen source has no visible pixels: {filename}")
    return source.crop(bbox).resize(size, Image.Resampling.LANCZOS)


def placed_sprite(sprite: Image.Image, x: float, y: float) -> Image.Image:
    image, _ = new_layer()
    image.alpha_composite(sprite, (round(x), round(y)))
    return downsample(image)


def source_hair_layers(style: Style, frame: str) -> tuple[Image.Image, Image.Image]:
    sway = FRAME_GUIDES[frame]["hair"]
    sprite = imagegen_sprite(IMAGEGEN_SOURCES[style.slug], (145 * SCALE, 147 * SCALE))
    source_alpha = sprite.getchannel("A")
    if "hair_only" in IMAGEGEN_SOURCES[style.slug]:
        hair_alpha = source_alpha
    else:
        # Legacy sources include a preview face; keep only their hair contour.
        face_cut = Image.new("L", sprite.size, 0)
        ImageDraw.Draw(face_cut).ellipse(rect(20, 44, 125, 150), fill=255)
        hair_alpha = ImageChops.subtract(
            source_alpha,
            face_cut.filter(ImageFilter.GaussianBlur(1.1 * SCALE)),
        )
    back_sprite = sprite.copy()
    back_sprite.putalpha(hair_alpha)
    back = placed_sprite(back_sprite, 56 * SCALE + sway * SCALE, 81 * SCALE)

    front_sprite = sprite.copy()
    front_sprite.putalpha(hair_alpha)
    front = placed_sprite(front_sprite, 56 * SCALE + sway * SCALE, 81 * SCALE)
    return back, front


def hair_back(style: Style, frame: str) -> Image.Image:
    return source_hair_layers(style, frame)[0]

    image, draw = new_layer()
    sway = FRAME_GUIDES[frame]["hair"]
    if style.slug == "mocha_ribbon_blowout":
        left = ((82 + sway, 143), (95 + sway, 122), (113 + sway, 136), (112 + sway, 211), (101 + sway, 263), (85 + sway, 276), (75 + sway, 252))
        right = ((144 + sway, 136), (163 + sway, 122), (177 + sway, 143), (182 + sway, 251), (170 + sway, 276), (153 + sway, 263), (143 + sway, 211))
        polygon_gradient(image, left, (181, 122, 83), (113, 70, 58), outline=(177, 107, 73))
        polygon_gradient(image, right, (181, 122, 83), (113, 70, 58), outline=(177, 107, 73))
        for index in range(5):
            y = 148 + index * 16
            line(draw, [(86 + sway, y), (95 + sway, y - 8), (102 + sway, y + 8), (105 + sway, y + 17)], (241, 186, 125), 45, 0.32)
            line(draw, [(170 + sway, y), (161 + sway, y - 8), (154 + sway, y + 8), (151 + sway, y + 17)], (241, 186, 125), 45, 0.32)
    elif style.slug == "midnight_french_bob":
        shape = ((79 + sway, 144), (91 + sway, 113), (126 + sway, 101), (165 + sway, 114), (178 + sway, 148), (176 + sway, 214), (162 + sway, 234), (145 + sway, 240), (128 + sway, 233), (111 + sway, 240), (93 + sway, 234), (79 + sway, 214))
        polygon_gradient(image, shape, (75, 61, 82), (40, 34, 52), outline=(91, 66, 84))
        for index in range(6):
            arc = 110 + index * 11
            draw.arc(rect(86 + sway, arc, 170 + sway, arc + 70), 192, 344, fill=rgba((189, 157, 184), 42), width=max(1, round(SCALE * 0.32)))
    else:
        left = ((81 + sway, 148), (96 + sway, 128), (116 + sway, 140), (113 + sway, 219), (101 + sway, 273), (80 + sway, 283), (70 + sway, 258))
        right = ((143 + sway, 140), (162 + sway, 128), (178 + sway, 148), (187 + sway, 258), (176 + sway, 283), (155 + sway, 273), (143 + sway, 219))
        polygon_gradient(image, left, (248, 201, 126), (190, 128, 70), outline=(207, 144, 80))
        polygon_gradient(image, right, (248, 201, 126), (190, 128, 70), outline=(207, 144, 80))
        for index in range(6):
            y = 150 + index * 15
            line(draw, [(83 + sway, y), (96 + sway, y - 10), (102 + sway, y + 8), (105 + sway, y + 19)], (255, 235, 183), 48, 0.34)
            line(draw, [(173 + sway, y), (160 + sway, y - 10), (154 + sway, y + 8), (151 + sway, y + 19)], (255, 235, 183), 48, 0.34)
    return downsample(image)


def hair_front(style: Style, frame: str) -> Image.Image:
    return source_hair_layers(style, frame)[1]

    image, draw = new_layer()
    sway = FRAME_GUIDES[frame]["hair"]
    if style.slug == "mocha_ribbon_blowout":
        crown = ((80 + sway, 149), (84 + sway, 120), (103 + sway, 101), (128 + sway, 95), (153 + sway, 102), (174 + sway, 122), (176 + sway, 151), (166 + sway, 163), (157 + sway, 149), (151 + sway, 128), (140 + sway, 117), (128 + sway, 113), (116 + sway, 117), (105 + sway, 128), (99 + sway, 149), (90 + sway, 163))
        polygon_gradient(image, crown, (182, 122, 83), (123, 76, 62), outline=(179, 108, 76))
        for index in range(11):
            x = 91 + index * 7.2 + sway
            line(draw, [(x, 119), (x + 5, 111), (128 + sway, 104)], (244, 190, 130), 52, 0.3)
        line(draw, [(94 + sway, 132), (89 + sway, 156), (94 + sway, 182), (89 + sway, 202)], (137, 82, 64), 165, 1.55)
        line(draw, [(162 + sway, 132), (168 + sway, 156), (162 + sway, 182), (168 + sway, 202)], (137, 82, 64), 165, 1.55)
        for x in (84 + sway, 170 + sway):
            draw.polygon(poly([(x - 8, 130), (x, 123), (x + 8, 130), (x, 139)]), fill=rgba((246, 235, 218), 230), outline=rgba((177, 143, 121), 150))
    elif style.slug == "midnight_french_bob":
        crown = ((77 + sway, 151), (83 + sway, 119), (103 + sway, 100), (130 + sway, 96), (158 + sway, 106), (176 + sway, 127), (179 + sway, 156), (166 + sway, 161), (157 + sway, 151), (149 + sway, 128), (133 + sway, 116), (116 + sway, 117), (101 + sway, 128), (95 + sway, 151), (86 + sway, 162))
        polygon_gradient(image, crown, (82, 66, 90), (48, 39, 59), outline=(98, 71, 94))
        line(draw, [(100 + sway, 112), (126 + sway, 103), (153 + sway, 113)], (197, 170, 196), 58, 0.42)
        line(draw, [(91 + sway, 146), (88 + sway, 177), (92 + sway, 198)], (59, 47, 68), 180, 1.8)
        line(draw, [(165 + sway, 142), (170 + sway, 172), (165 + sway, 198)], (59, 47, 68), 180, 1.8)
        for x, y in ((163 + sway, 136), (166 + sway, 143)):
            draw.ellipse(rect(x - 1.7, y - 1.7, x + 1.7, y + 1.7), fill=rgba((238, 224, 205), 242), outline=rgba((174, 145, 117), 165), width=max(1, round(SCALE * 0.35)))
    else:
        crown = ((81 + sway, 148), (86 + sway, 119), (104 + sway, 101), (128 + sway, 95), (153 + sway, 102), (171 + sway, 120), (176 + sway, 149), (167 + sway, 161), (157 + sway, 151), (150 + sway, 127), (139 + sway, 115), (128 + sway, 111), (116 + sway, 115), (105 + sway, 127), (99 + sway, 151), (89 + sway, 162))
        polygon_gradient(image, crown, (250, 207, 140), (207, 145, 83), outline=(209, 145, 82))
        for index in range(10):
            x = 91 + index * 7.5 + sway
            line(draw, [(x, 119), (x + 4, 109), (128 + sway, 103)], (255, 239, 194), 54, 0.32)
        draw.polygon(poly([(115 + sway, 111), (128 + sway, 98), (141 + sway, 111), (139 + sway, 124), (128 + sway, 119), (117 + sway, 124)]), fill=rgba((102, 59, 43), 238), outline=rgba((77, 42, 31), 150))
        draw.ellipse(rect(125.5 + sway, 108, 130.5 + sway, 113), fill=rgba((188, 125, 91), 220))
        line(draw, [(94 + sway, 133), (89 + sway, 156), (95 + sway, 188)], (218, 156, 85), 172, 1.35)
        line(draw, [(162 + sway, 133), (168 + sway, 156), (162 + sway, 188)], (218, 156, 85), 172, 1.35)
    return downsample(image)


def face_foundation(frame: str) -> Image.Image:
    image, _ = new_layer()
    dx, dy = FRAME_GUIDES[frame]["face"]
    for bounds in (
        (91 + dx, 166 + dy, 119 + dx, 190 + dy),
        (137 + dx, 166 + dy, 165 + dx, 190 + dy),
    ):
        ellipse_glow(image, bounds, (244, 147, 142), 48, 4.6)
    for bounds in (
        (99 + dx, 171 + dy, 116 + dx, 185 + dy),
        (140 + dx, 171 + dy, 157 + dx, 185 + dy),
    ):
        ellipse_glow(image, bounds, (251, 164, 153), 28, 2.8)
    ellipse_glow(image, (110 + dx, 127 + dy, 146 + dx, 149 + dy), (255, 244, 232), 16, 4.8)
    ellipse_glow(image, (118 + dx, 190 + dy, 138 + dx, 201 + dy), (255, 226, 210), 26, 2.4)
    return downsample(image)


def eyes_layer(style: Style, frame: str) -> Image.Image:
    image, draw = new_layer()
    dx, dy = FRAME_GUIDES[frame]["face"]
    palette = {
        "mocha_doe": ((94, 56, 43), (183, 121, 78), (58, 37, 35)),
        "sage_glass": ((67, 101, 80), (165, 182, 132), (61, 67, 56)),
        "twilight_plum": ((98, 60, 90), (189, 116, 151), (63, 40, 62)),
    }[style.slug]
    for cx, outer_direction in ((113.5 + dx, -1), (142.5 + dx, 1)):
        eye = (cx - 7.5, 153.8 + dy, cx + 7.5, 162.3 + dy)
        draw.ellipse(
            rect(*eye),
            fill=rgba((255, 247, 238), 248),
            outline=rgba((112, 69, 61), 132),
            width=max(1, round(SCALE * 0.42)),
        )
        iris_y = 158.4 + dy
        for radius, color, alpha in (
            (4.55, palette[1], 232),
            (3.35, palette[0], 246),
            (1.78, palette[2], 252),
        ):
            draw.ellipse(rect(cx - radius, iris_y - radius, cx + radius, iris_y + radius), fill=rgba(color, alpha))
        draw.ellipse(rect(cx + 0.8, 155.5 + dy, cx + 2.5, 157.2 + dy), fill=rgba((255, 255, 247), 242))
        draw.ellipse(rect(cx - 2.0, 159.9 + dy, cx - 1.15, 160.75 + dy), fill=rgba((255, 231, 216), 124))
        draw.arc(
            rect(cx - 7.9, 152.0 + dy, cx + 7.9, 162.5 + dy),
            194,
            347,
            fill=rgba((83, 44, 43), 226),
            width=max(1, round(SCALE * 0.82)),
        )
        outer_x = cx + outer_direction * 6.5
        line(draw, [(outer_x, 154.1 + dy), (outer_x + outer_direction * 2.2, 151.5 + dy)], (83, 44, 43), 186, 0.42)
        line(draw, [(outer_x - outer_direction * 1.2, 153.4 + dy), (outer_x + outer_direction * 0.6, 150.8 + dy)], (83, 44, 43), 160, 0.34)
    brow = (112, 69, 57)
    line(draw, [(105.8 + dx, 147.6 + dy), (112.9 + dx, 145.6 + dy), (120.1 + dx, 146.9 + dy)], brow, 158, 0.72)
    line(draw, [(135.9 + dx, 146.9 + dy), (143.1 + dx, 145.6 + dy), (150.2 + dx, 147.6 + dy)], brow, 158, 0.72)
    return downsample(image)


def nose_layer(style: Style, frame: str) -> Image.Image:
    image, draw = new_layer()
    dx, dy = FRAME_GUIDES[frame]["face"]
    shade = (183, 104, 87)
    if style.slug == "soft_button":
        ellipse_glow(image, (124.0 + dx, 169.2 + dy, 132.0 + dx, 176.2 + dy), (224, 142, 126), 34, 1.0)
        draw.arc(rect(124.1 + dx, 170.4 + dy, 131.9 + dx, 176.2 + dy), 24, 157, fill=rgba(shade, 116), width=max(1, round(SCALE * 0.48)))
    elif style.slug == "petal_curve":
        ellipse_glow(image, (123.6 + dx, 169.2 + dy, 132.4 + dx, 176.6 + dy), (237, 151, 139), 38, 1.1)
        line(draw, [(125.0 + dx, 173.2 + dy), (128.0 + dx, 175.0 + dy), (131.0 + dx, 173.2 + dy)], shade, 95, 0.5)
    else:
        line(draw, [(128.4 + dx, 166.2 + dy), (126.9 + dx, 173.0 + dy), (130.4 + dx, 174.6 + dy)], (206, 133, 111), 74, 0.43)
        draw.arc(rect(124.0 + dx, 171.4 + dy, 132.0 + dx, 176.4 + dy), 28, 153, fill=rgba(shade, 98), width=max(1, round(SCALE * 0.42)))
    draw.ellipse(rect(125.0 + dx, 173.4 + dy, 126.6 + dx, 174.8 + dy), fill=rgba((143, 76, 72), 86))
    draw.ellipse(rect(129.4 + dx, 173.4 + dy, 131.0 + dx, 174.8 + dy), fill=rgba((143, 76, 72), 86))
    return downsample(image)


def mouth_layer(style: Style, frame: str) -> Image.Image:
    image, draw = new_layer()
    dx, dy = FRAME_GUIDES[frame]["face"]
    if style.slug == "peach_whisper_smile":
        color, light = (181, 88, 99), (250, 164, 157)
        draw.arc(rect(117.7 + dx, 184.5 + dy, 138.3 + dx, 194.0 + dy), 14, 166, fill=rgba(color, 220), width=max(1, round(SCALE * 0.7)))
        draw.arc(rect(121.1 + dx, 185.2 + dy, 134.9 + dx, 191.4 + dy), 20, 160, fill=rgba(light, 166), width=max(1, round(SCALE * 0.32)))
        draw.ellipse(rect(126.2 + dx, 188.0 + dy, 129.8 + dx, 189.0 + dy), fill=rgba((255, 207, 197), 118))
    elif style.slug == "rose_gloss_smile":
        color, light = (176, 70, 101), (255, 177, 183)
        draw.polygon(poly([(118.5 + dx, 188.2 + dy), (123.7 + dx, 185.6 + dy), (128.0 + dx, 187.0 + dy), (132.3 + dx, 185.6 + dy), (137.5 + dx, 188.2 + dy), (132.4 + dx, 192.3 + dy), (128.0 + dx, 193.3 + dy), (123.6 + dx, 192.3 + dy)]), fill=rgba(color, 184))
        draw.ellipse(rect(123.0 + dx, 187.6 + dy, 127.0 + dx, 188.9 + dy), fill=rgba(light, 145))
    else:
        color, light = (140, 57, 91), (221, 124, 149)
        draw.polygon(poly([(119.0 + dx, 188.5 + dy), (124.1 + dx, 185.8 + dy), (128.0 + dx, 187.5 + dy), (131.9 + dx, 185.8 + dy), (137.0 + dx, 188.5 + dy), (132.0 + dx, 192.4 + dy), (128.0 + dx, 193.2 + dy), (124.0 + dx, 192.4 + dy)]), fill=rgba(color, 178))
        draw.ellipse(rect(125.0 + dx, 187.5 + dy, 128.2 + dx, 188.6 + dy), fill=rgba(light, 128))
    return downsample(image)


def shoe_layer(style: Style, frame: str) -> Image.Image:
    image, draw = new_layer()
    left_shift = FRAME_GUIDES[frame]["shoe_left"]
    right_shift = FRAME_GUIDES[frame]["shoe_right"]
    positions = ((100.4 + left_shift[0], 326.1 + left_shift[1]), (130.6 + right_shift[0], 326.1 + right_shift[1]))
    palette = {
        "milk_tea_court_sneakers": ((237, 222, 193), (181, 135, 96), (119, 83, 61), (251, 242, 222)),
        "cherry_satin_ballets": ((198, 48, 76), (255, 126, 142), (125, 42, 57), (248, 206, 207)),
        "onyx_heart_mary_janes": ((35, 31, 38), (91, 76, 92), (22, 18, 25), (239, 210, 148)),
    }[style.slug]
    for index, (x, y) in enumerate(positions):
        toe = x + 24.0
        silhouette = ((x, y + 4.0), (x + 3.2, y), (x + 15.0, y - 1.0), (toe - 1.0, y + 3.4), (toe, y + 12.4), (toe - 2.5, y + 16.3), (x + 4.0, y + 16.3), (x, y + 12.0))
        polygon_gradient(image, silhouette, palette[0], palette[2], outline=palette[2])
        if style.slug == "milk_tea_court_sneakers":
            draw.rounded_rectangle(rect(x + 1.0, y + 11.2, toe - 1.0, y + 18.0), radius=round(SCALE * 2.2), fill=rgba(palette[3], 242), outline=rgba((184, 160, 130), 138), width=max(1, round(SCALE * 0.42)))
            for lace in range(3):
                ly = y + 4.5 + lace * 2.15
                line(draw, [(x + 7.3, ly), (x + 17.0, ly + 0.2)], (248, 236, 211), 220, 0.65)
                draw.ellipse(rect(x + 5.8, ly - 0.8, x + 7.2, ly + 0.7), fill=rgba(palette[1], 220))
                draw.ellipse(rect(x + 17.2, ly - 0.8, x + 18.6, ly + 0.7), fill=rgba(palette[1], 220))
        elif style.slug == "cherry_satin_ballets":
            draw.arc(rect(x + 4.0, y + 3.0, toe - 4.0, y + 13.8), 194, 345, fill=rgba(palette[3], 168), width=max(1, round(SCALE * 0.55)))
            bow_x = x + 12.0
            draw.polygon(poly([(bow_x - 5.0, y + 5.6), (bow_x - 1.0, y + 7.3), (bow_x - 5.0, y + 9.3)]), fill=rgba(palette[1], 235), outline=rgba(palette[2], 138))
            draw.polygon(poly([(bow_x + 5.0, y + 5.6), (bow_x + 1.0, y + 7.3), (bow_x + 5.0, y + 9.3)]), fill=rgba(palette[1], 235), outline=rgba(palette[2], 138))
            draw.ellipse(rect(bow_x - 1.2, y + 6.3, bow_x + 1.2, y + 8.4), fill=rgba(palette[3], 232))
        else:
            draw.arc(rect(x + 3.0, y + 1.5, toe - 3.0, y + 14.0), 195, 345, fill=rgba((250, 243, 231), 112), width=max(1, round(SCALE * 0.45)))
            line(draw, [(x + 2.5, y + 7.0), (toe - 2.5, y + 7.0)], palette[3], 220, 1.0)
            draw.ellipse(rect(x + 10.0, y + 5.6, x + 14.1, y + 9.7), fill=rgba(palette[3], 242), outline=rgba((124, 93, 51), 140), width=max(1, round(SCALE * 0.35)))
            draw.polygon(poly([(x + 12.0, y + 6.6), (x + 10.6, y + 5.2), (x + 9.4, y + 6.8), (x + 12.0, y + 9.1), (x + 14.6, y + 6.8), (x + 13.4, y + 5.2)]), fill=rgba((37, 31, 40), 242))
    return downsample(image)


def room_path(kind: str, slug: str, part: str | None = None) -> Path:
    if kind == "hair":
        return ROOM_DIR / f"avatar_room_hair_{part}_female_{slug}_v2.png"
    if kind == "face":
        return ROOM_DIR / "avatar_room_face_female_soft_doll_foundation_v2.png"
    return ROOM_DIR / f"avatar_room_{kind}_female_{slug}_v2.png"


def motion_path(kind: str, slug: str, suffix: str, part: str | None = None) -> Path:
    if kind == "hair":
        return MOTION_DIR / f"room_avatar_hair_{part}_female_{slug}_v2_{suffix}.png"
    if kind == "face":
        return MOTION_DIR / f"room_avatar_face_female_soft_doll_foundation_v2_{suffix}.png"
    return MOTION_DIR / f"room_avatar_{kind}_female_{slug}_v2_{suffix}.png"


def profile_path(kind: str, slug: str) -> Path:
    return PROFILE_DIR / ("avatar_face_soft_doll_foundation.png" if kind == "face" else f"avatar_{kind}_{slug}.png")


def thumbnail_path(kind: str, slug: str) -> Path:
    return THUMB_DIR / ("avatar_v2_face_soft_doll_foundation.png" if kind == "face" else f"avatar_v2_{kind}_{slug}.png")


def composite(*layers: Image.Image) -> Image.Image:
    image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        image.alpha_composite(layer)
    return image


def thumbnail(layer: Image.Image, kind: str, slug: str) -> Image.Image:
    base = Image.open(ROOM_DIR / "avatar_room_base_female_v2.png").convert("RGBA")
    defaults = composite(face_foundation("static"), eyes_layer(EYES[0], "static"), nose_layer(NOSES[0], "static"), mouth_layer(MOUTHS[0], "static"))
    if kind == "hair":
        matching = next(style for style in HAIR if style.slug == slug)
        base = composite(hair_back(matching, "static"), base, defaults, hair_front(matching, "static"))
    elif kind == "shoes":
        base = composite(base, defaults, layer)
    elif kind == "face":
        base = composite(base, layer, eyes_layer(EYES[0], "static"), nose_layer(NOSES[0], "static"), mouth_layer(MOUTHS[0], "static"))
    else:
        base = composite(base, face_foundation("static"), layer)
    crop = base.crop((55, 82, 201, 350)).resize((220, 220), Image.Resampling.LANCZOS)
    return crop


def build_qa() -> None:
    base = Image.open(ROOM_DIR / "avatar_room_base_female_v2.png").convert("RGBA")
    background = (251, 242, 248, 255)
    static = Image.new("RGBA", (1800, 1540), background)
    draw = ImageDraw.Draw(static)
    entries: list[tuple[str, str, Image.Image]] = []
    for style in SHOES:
        entries.append(("Shoes", style.name, shoe_layer(style, "static")))
    for style in HAIR:
        entries.append(("Hair", style.name, composite(hair_back(style, "static"), hair_front(style, "static"))))
    entries.append(("Face", "Soft Doll Foundation", face_foundation("static")))
    for style in EYES:
        entries.append(("Eyes", style.name, eyes_layer(style, "static")))
    for style in NOSES:
        entries.append(("Nose", style.name, nose_layer(style, "static")))
    for style in MOUTHS:
        entries.append(("Mouth", style.name, mouth_layer(style, "static")))
    for index, (kind, name, layer) in enumerate(entries):
        column = index % 3
        row = index // 3
        x = 35 + column * 590
        y = 20 + row * 255
        draw.text((x, y), f"{kind}: {name}", fill=(73, 53, 71, 255))
        if kind == "Hair":
            hair = next(style for style in HAIR if style.name == name)
            render = composite(hair_back(hair, "static"), base, face_foundation("static"), eyes_layer(EYES[0], "static"), nose_layer(NOSES[0], "static"), mouth_layer(MOUTHS[0], "static"), hair_front(hair, "static"))
        elif kind == "Shoes":
            render = composite(base, face_foundation("static"), eyes_layer(EYES[0], "static"), nose_layer(NOSES[0], "static"), mouth_layer(MOUTHS[0], "static"), layer)
        elif kind == "Face":
            render = composite(base, layer, eyes_layer(EYES[0], "static"), nose_layer(NOSES[0], "static"), mouth_layer(MOUTHS[0], "static"))
        else:
            render = composite(base, face_foundation("static"), layer)
        static.alpha_composite(render.resize((192, 288), Image.Resampling.LANCZOS), (x + 190, y + 20))
    save(static, QA_DIR / "soft_doll_feature_static_contact_sheet.png")

    closeup = Image.new("RGBA", (900, 900), background)
    closeup_draw = ImageDraw.Draw(closeup)
    closeup_draw.text((36, 28), "Soft Doll V4 - cheek and face fit", fill=(73, 53, 71, 255))
    default_hair = HAIR[0]
    default_face = composite(
        hair_back(default_hair, "static"),
        base,
        face_foundation("static"),
        eyes_layer(EYES[0], "static"),
        nose_layer(NOSES[0], "static"),
        mouth_layer(MOUTHS[0], "static"),
        hair_front(default_hair, "static"),
    )
    face_crop = default_face.crop((68, 94, 188, 216)).resize((720, 732), Image.Resampling.LANCZOS)
    closeup.alpha_composite(face_crop, (90, 104))
    save(closeup, QA_DIR / "soft_doll_cheeky_face_closeup.png")

    default_top = Image.open(ROOM_DIR / "avatar_room_top_female_cream_basic_tee_v2.png").convert("RGBA")
    default_bottom = Image.open(ROOM_DIR / "avatar_room_bottom_female_denim_skort_shorts_v2.png").convert("RGBA")
    dressed = composite(
        hair_back(default_hair, "static"),
        base,
        face_foundation("static"),
        eyes_layer(EYES[0], "static"),
        nose_layer(NOSES[0], "static"),
        mouth_layer(MOUTHS[0], "static"),
        default_bottom,
        shoe_layer(SHOES[0], "static"),
        default_top,
        hair_front(default_hair, "static"),
    )
    dressed_sheet = Image.new("RGBA", (900, 1100), background)
    dressed_draw = ImageDraw.Draw(dressed_sheet)
    dressed_draw.text((36, 28), "Soft Doll V4 - dressed body fit", fill=(73, 53, 71, 255))
    dressed_sheet.alpha_composite(dressed.resize((704, 1056), Image.Resampling.LANCZOS), (98, 44))
    save(dressed_sheet, QA_DIR / "soft_doll_cheeky_dressed_fit.png")

    faces = Image.new("RGBA", (1620, 1188), background)
    face_draw = ImageDraw.Draw(faces)
    for eye_index, eye in enumerate(EYES):
        for nose_index, nose in enumerate(NOSES):
            for mouth_index, mouth in enumerate(MOUTHS):
                index = eye_index * 9 + nose_index * 3 + mouth_index
                x = 18 + (index % 9) * 178
                y = 18 + (index // 9) * 385
                face_draw.text((x, y), f"{eye_index + 1}-{nose_index + 1}-{mouth_index + 1}", fill=(73, 53, 71, 255))
                render = composite(base, face_foundation("static"), eyes_layer(eye, "static"), nose_layer(nose, "static"), mouth_layer(mouth, "static"))
                faces.alpha_composite(render.crop((68, 104, 188, 211)).resize((154, 268), Image.Resampling.LANCZOS), (x + 12, y + 30))
    save(faces, QA_DIR / "soft_doll_face_combination_contact_sheet.png")

    motion = Image.new("RGBA", (1500, 880), background)
    motion_draw = ImageDraw.Draw(motion)
    for row, style in enumerate((HAIR[0],)):
        for column, suffix in enumerate(("static",) + MOTION_SUFFIXES):
            x = 28 + column * 242
            y = 36 + row * 400
            motion_draw.text((x, y), suffix.replace("walking_front_", "walk ").replace("sitting_front_", "sit "), fill=(73, 53, 71, 255))
            render = composite(hair_back(style, suffix), base, face_foundation(suffix), eyes_layer(EYES[0], suffix), nose_layer(NOSES[0], suffix), mouth_layer(MOUTHS[0], suffix), hair_front(style, suffix), shoe_layer(SHOES[0], suffix))
            motion.alpha_composite(render.resize((192, 288), Image.Resampling.LANCZOS), (x + 16, y + 24))
    save(motion, QA_DIR / "soft_doll_feature_motion_contact_sheet.png")


def main() -> None:
    # Static layers and all five independently rendered motion layers.
    face_static = face_foundation("static")
    save(face_static, room_path("face", "soft_doll_foundation"))
    save(face_static.resize((512, 768), Image.Resampling.LANCZOS), profile_path("face", "soft_doll_foundation"))
    save(thumbnail(face_static, "face", "soft_doll_foundation"), thumbnail_path("face", "soft_doll_foundation"))
    for suffix in MOTION_SUFFIXES:
        save(face_foundation(suffix), motion_path("face", "soft_doll_foundation", suffix))

    for style in SHOES:
        layer = shoe_layer(style, "static")
        save(layer, room_path("shoes", style.slug))
        save(layer.resize((512, 768), Image.Resampling.LANCZOS), profile_path("shoes", style.slug))
        save(thumbnail(layer, "shoes", style.slug), thumbnail_path("shoes", style.slug))
        for suffix in MOTION_SUFFIXES:
            save(shoe_layer(style, suffix), motion_path("shoes", style.slug, suffix))

    for style in HAIR:
        back = hair_back(style, "static")
        front = hair_front(style, "static")
        save(back, room_path("hair", style.slug, "back"))
        save(front, room_path("hair", style.slug, "front"))
        save(composite(back, front).resize((512, 768), Image.Resampling.LANCZOS), profile_path("hair", style.slug))
        save(thumbnail(front, "hair", style.slug), thumbnail_path("hair", style.slug))
        for suffix in MOTION_SUFFIXES:
            save(hair_back(style, suffix), motion_path("hair", style.slug, suffix, "back"))
            save(hair_front(style, suffix), motion_path("hair", style.slug, suffix, "front"))

    for kind, styles, renderer in (("eyes", EYES, eyes_layer), ("nose", NOSES, nose_layer), ("mouth", MOUTHS, mouth_layer)):
        for style in styles:
            layer = renderer(style, "static")
            save(layer, room_path(kind, style.slug))
            save(layer.resize((512, 768), Image.Resampling.LANCZOS), profile_path(kind, style.slug))
            save(thumbnail(layer, kind, style.slug), thumbnail_path(kind, style.slug))
            for suffix in MOTION_SUFFIXES:
                save(renderer(style, suffix), motion_path(kind, style.slug, suffix))
    build_qa()


if __name__ == "__main__":
    main()
