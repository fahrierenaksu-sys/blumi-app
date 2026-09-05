#!/usr/bin/env python3
"""Generate Blumi bottom reference wardrobe layers and QA sheets."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
ASSET_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ASSET_DIR / "motion"
THUMB_DIR = ASSET_DIR.parent / "shop-thumbnails"
QA_DIR = ROOT / "docs/avatar-motion-pipeline/bottom-reference-set-qa"
RENDER_SOURCE_DIR = ROOT / "docs/avatar-motion-pipeline/render-sources"
CONTACT_SOURCE_PATH = RENDER_SOURCE_DIR / "bottom_render_sources_contact.png"
FIT_MANIFEST_PATH = ROOT / "docs/avatar-motion-pipeline/female-fit-zones.json"
CANVAS = (256, 384)
SCALE = 8
# Keep the authored trouser hem above the shoe upper; the renderer applies the
# remaining per-item occlusion at runtime. The manifest is the single source
# of truth so a fit-zone update cannot leave this producer stale.
FEMALE_TROUSER_HEM_Y = int(json.loads(FIT_MANIFEST_PATH.read_text())["zones"]["bottomHem"]["trousers"][1])
FEMALE_DEFAULT_SHOE_ASSET = "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png"
FEMALE_DEFAULT_SHOE_MOTION_PREFIX = "room_avatar_shoes_female_milk_tea_court_sneakers_v2"
WAIST_CURVE_POINTS = (
    (98.2, 282.2),
    (106.5, 281.35),
    (117.8, 281.15),
    (128, 281.35),
    (138.2, 281.15),
    (149.5, 281.35),
    (157.8, 282.2),
)
WAIST_PANEL_POINTS = (
    *WAIST_CURVE_POINTS,
    (156, 290.5),
    (100, 290.5),
)


@dataclass(frozen=True)
class BottomProfile:
    slug: str
    name: str
    kind: str


@dataclass(frozen=True)
class TailoredRenderSourceSpec:
    target_box: tuple[int, int, int, int]
    mask_polygons: tuple[tuple[tuple[float, float], ...], ...]
    outline: tuple[int, int, int]
    waist_color: tuple[int, int, int]
    waist_alpha: int = 168
    waist_style: str = "cap"


PROFILES = [
    BottomProfile("striped_crochet_shorts", "Striped Crochet Shorts", "shorts"),
    BottomProfile("layered_lace_ruffle_mini_skirt", "Layered Lace Ruffle Mini Skirt", "layered_skirt"),
    BottomProfile("black_palm_embellished_pants", "Black Palm Pants", "black_pants"),
    BottomProfile("coral_embellished_laceup_pants", "Coral Lace-Up Pants", "coral_pants"),
    BottomProfile("smoky_floral_mesh_pants", "Smoky Floral Mesh Pants", "mesh_pants"),
    BottomProfile("yellow_bow_lace_ruffle_skirt", "Yellow Bow Lace Ruffle Skirt", "yellow_skirt"),
]

CONTACT_PANEL_BOXES: dict[str, tuple[int, int, int, int]] = {
    "layered_lace_ruffle_mini_skirt": (310, 44, 590, 274),
    "yellow_bow_lace_ruffle_skirt": (1510, 44, 1790, 274),
}

TAILORED_RENDER_SOURCE_SPECS: dict[str, TailoredRenderSourceSpec] = {
    # Keep long hems inside the female fit profile. Shoe upper exposure is
    # controlled by the catalog's per-item occlusion role, not a global crop.
    "striped_crochet_shorts": TailoredRenderSourceSpec(
        target_box=(94, 278, 162, 308),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (156, 291.5), (100, 291.5)),
            ((100, 288.5), (127, 288.5), (124, 306.5), (106, 306.5), (98, 302.5)),
            ((129, 288.5), (156, 288.5), (158, 302.5), (150, 306.5), (132, 306.5)),
        ),
        outline=(58, 35, 62),
        waist_color=(232, 218, 176),
        waist_alpha=134,
        waist_style="crochet",
    ),
    "layered_lace_ruffle_mini_skirt": TailoredRenderSourceSpec(
        target_box=(78, 276, 178, 325),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (160, 292.5), (96, 292.5)),
            ((96, 289), (160, 289), (178, 316), (166, 324), (144, 322), (128, 327), (112, 322), (90, 324), (78, 316)),
        ),
        outline=(147, 54, 45),
        waist_color=(215, 128, 74),
        waist_alpha=144,
    ),
    "black_palm_embellished_pants": TailoredRenderSourceSpec(
        target_box=(90, 276, 166, FEMALE_TROUSER_HEM_Y),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (158, 292.5), (98, 292.5)),
            ((98, 289), (127, 289), (123, FEMALE_TROUSER_HEM_Y), (101, FEMALE_TROUSER_HEM_Y), (94, 314)),
            ((129, 289), (158, 289), (162, 314), (155, FEMALE_TROUSER_HEM_Y), (133, FEMALE_TROUSER_HEM_Y)),
        ),
        outline=(23, 18, 19),
        waist_color=(31, 25, 26),
        waist_alpha=132,
    ),
    "coral_embellished_laceup_pants": TailoredRenderSourceSpec(
        target_box=(89, 276, 167, FEMALE_TROUSER_HEM_Y),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (158, 292.5), (98, 292.5)),
            ((98, 289), (127, 289), (123, FEMALE_TROUSER_HEM_Y), (100, FEMALE_TROUSER_HEM_Y), (94, 312)),
            ((129, 289), (158, 289), (162, 312), (157, FEMALE_TROUSER_HEM_Y), (133, FEMALE_TROUSER_HEM_Y)),
        ),
        outline=(145, 82, 72),
        waist_color=(214, 126, 105),
        waist_alpha=118,
        waist_style="coral",
    ),
    "smoky_floral_mesh_pants": TailoredRenderSourceSpec(
        target_box=(89, 276, 167, FEMALE_TROUSER_HEM_Y),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (158, 292.5), (98, 292.5)),
            ((97, 289), (127, 289), (123, FEMALE_TROUSER_HEM_Y), (100, FEMALE_TROUSER_HEM_Y), (92, 313)),
            ((129, 289), (159, 289), (163, 313), (156, FEMALE_TROUSER_HEM_Y), (133, FEMALE_TROUSER_HEM_Y)),
        ),
        outline=(50, 48, 45),
        waist_color=(87, 86, 80),
        waist_alpha=104,
    ),
    "yellow_bow_lace_ruffle_skirt": TailoredRenderSourceSpec(
        target_box=(78, 276, 178, 323),
        mask_polygons=(
            (*WAIST_CURVE_POINTS, (160, 292.5), (96, 292.5)),
            ((96, 289), (160, 289), (176, 314), (164, 322), (142, 320), (128, 325), (114, 320), (92, 322), (80, 314)),
        ),
        outline=(165, 126, 54),
        waist_color=(243, 200, 97),
        waist_alpha=150,
    ),
}

RENDER_SOURCE_OVERRIDES: dict[str, Path] = {
    profile.slug: RENDER_SOURCE_DIR / f"generated/{profile.slug}_imagegen_alpha.png"
    for profile in PROFILES
}


def layer_path(slug: str) -> Path:
    return ASSET_DIR / f"avatar_room_bottom_female_{slug}_v2.png"


def thumbnail_path(slug: str) -> Path:
    return THUMB_DIR / f"avatar_v2_bottom_{slug}.png"


def motion_path(slug: str, suffix: str) -> Path:
    return MOTION_DIR / f"room_avatar_bottom_female_{slug}_v2_{suffix}.png"


def base_motion_path(suffix: str) -> Path:
    return MOTION_DIR / f"room_avatar_base_female_v2_{suffix}.png"


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode == "RGBA":
        red, green, blue, alpha = image.split()
        transparent = alpha.point(lambda value: 255 if value == 0 else 0)
        zero = Image.new("L", image.size, 0)
        image = Image.merge(
            "RGBA",
            (
                Image.composite(zero, red, transparent),
                Image.composite(zero, green, transparent),
                Image.composite(zero, blue, transparent),
                alpha,
            ),
        )
    image.save(path, optimize=True)


def rgba(color: tuple[int, int, int], alpha: int = 255) -> tuple[int, int, int, int]:
    return (*color, alpha)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def downsample(image: Image.Image) -> Image.Image:
    return image.resize(CANVAS, Image.Resampling.LANCZOS)


def fit_source_image_to_layer(
    source: Image.Image,
    target_box: tuple[int, int, int, int],
    exact: bool = False,
) -> Image.Image:
    bbox = alpha_bbox(source)
    crop = source.crop(bbox)
    target_w = target_box[2] - target_box[0]
    target_h = target_box[3] - target_box[1]
    if exact:
        size = (target_w, target_h)
    else:
        scale = min(target_w / crop.width, target_h / crop.height)
        size = (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        )
    resized = crop.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = target_box[0] + round((target_w - size[0]) / 2)
    y = target_box[1] + round((target_h - size[1]) / 2)
    out.alpha_composite(resized, (x, y))
    return out


def fit_render_source_to_layer(
    path: Path,
    target_box: tuple[int, int, int, int],
    exact: bool = False,
) -> Image.Image:
    return fit_source_image_to_layer(load(path), target_box, exact)


def extract_contact_panel_source(slug: str) -> Image.Image | None:
    panel_box = CONTACT_PANEL_BOXES.get(slug)
    if panel_box is None or not CONTACT_SOURCE_PATH.exists():
        return None
    crop = load(CONTACT_SOURCE_PATH).crop(panel_box)
    red, green, blue, alpha = crop.split()
    alpha_pixels = alpha.load()
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, a = pixels[x, y]
            is_green_screen = g > 185 and r < 95 and b < 110
            is_contact_background = r > 240 and 230 <= g <= 242 and b > 235
            if is_green_screen or is_contact_background:
                alpha_pixels[x, y] = 0
            elif a > 0:
                alpha_pixels[x, y] = 255
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    crop.putalpha(alpha)
    bbox = crop.getchannel("A").getbbox()
    if bbox is None:
        return None
    return crop.crop(bbox)


def source_for_profile(profile: BottomProfile) -> Image.Image | None:
    render_source = RENDER_SOURCE_OVERRIDES.get(
        profile.slug,
        RENDER_SOURCE_DIR / f"{profile.slug}_render_alpha.png",
    )
    if render_source.exists():
        return load(render_source)
    return extract_contact_panel_source(profile.slug)


def mask_from_tailored_polygons(
    polygons: tuple[tuple[tuple[float, float], ...], ...]
) -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(poly(list(polygon)), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(max(0.25, SCALE * 0.035))).resize(CANVAS, Image.Resampling.LANCZOS)


def average_masked_rgb(image: Image.Image, mask: Image.Image) -> tuple[int, int, int]:
    pixels = image.convert("RGBA").load()
    mask_pixels = mask.load()
    samples: list[tuple[int, int, int, float]] = []
    for y in range(280, 294):
        for x in range(94, 163):
            alpha = mask_pixels[x, y]
            if alpha < 80:
                continue
            source_alpha = pixels[x, y][3]
            if source_alpha < 30:
                continue
            red, green, blue = pixels[x, y][:3]
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            samples.append((red, green, blue, luminance))
    if not samples:
        return (180, 132, 92)
    ordered = sorted(samples, key=lambda sample: sample[3])
    if ordered[round(len(ordered) * 0.75)][3] > 120:
        ordered = ordered[round(len(ordered) * 0.42):]
    red = sum(sample[0] for sample in ordered)
    green = sum(sample[1] for sample in ordered)
    blue = sum(sample[2] for sample in ordered)
    count = len(ordered)
    return (round(red / count), round(green / count), round(blue / count))


def fit_source_to_tailored_layer(source: Image.Image, spec: TailoredRenderSourceSpec) -> Image.Image:
    fitted = fit_source_image_to_layer(source, spec.target_box, True)
    mask = mask_from_tailored_polygons(spec.mask_polygons)
    fitted.putalpha(ImageChops.multiply(fitted.getchannel("A"), mask))

    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    if spec.waist_style == "cap":
        out.alpha_composite(build_waist_wrap_cap(fitted, spec))
    out.alpha_composite(fitted)
    if spec.waist_style == "source":
        waist_detail = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    elif spec.waist_style == "crochet":
        waist_detail = draw_crochet_waistband()
    elif spec.waist_style == "coral":
        waist_detail = draw_coral_waistband()
    else:
        waist_detail = draw_waist_grip_detail(spec)
        waist_detail.putalpha(ImageChops.multiply(waist_detail.getchannel("A"), out.getchannel("A")))
    out.alpha_composite(waist_detail)

    details = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(details)
    if len(spec.mask_polygons) > 2:
        draw.line([(128, 291), (128, 326)], fill=rgba(spec.outline, 32), width=1)
    details.putalpha(ImageChops.multiply(details.getchannel("A"), mask))
    out.alpha_composite(details)
    return out


def waist_wrap_mask() -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        poly(
            [
                (97.2, 282.4),
                (105.8, 281.25),
                (117.2, 281.15),
                (128.0, 281.35),
                (138.8, 281.15),
                (150.2, 281.25),
                (158.8, 282.4),
                (158.2, 293.0),
                (97.8, 293.0),
            ]
        ),
        fill=255,
    )
    return mask.filter(ImageFilter.GaussianBlur(max(0.25, SCALE * 0.04))).resize(CANVAS, Image.Resampling.LANCZOS)


def build_waist_wrap_cap(fitted: Image.Image, spec: TailoredRenderSourceSpec) -> Image.Image:
    cap = ImageChops.offset(fitted, 0, -5)
    cap_alpha = ImageChops.multiply(cap.getchannel("A"), waist_wrap_mask())
    cap_alpha = cap_alpha.point(lambda value: min(value, spec.waist_alpha))
    cap.putalpha(cap_alpha)
    return cap


def draw_crochet_waistband() -> Image.Image:
    detail, draw = canvas()
    outline = (56, 38, 50)
    panel = [
        (96.8, 280.8),
        (106.0, 279.75),
        (118.0, 279.65),
        (128.0, 280.0),
        (138.0, 279.65),
        (150.0, 279.75),
        (159.2, 280.8),
        (158.0, 291.8),
        (98.0, 291.8),
    ]
    draw.polygon(poly(panel), fill=rgba((238, 221, 178), 252))
    draw.line(poly(panel[:7]), fill=rgba((255, 244, 204), 170), width=max(1, round(0.6 * SCALE)), joint="curve")
    draw.line([pt(97.5, 291.0), pt(158.5, 291.0)], fill=rgba(outline, 185), width=max(1, round(0.8 * SCALE)))
    draw_crochet_texture(draw, 99.0, 281.1, 157.0, 289.9, (111, 82, 61))
    draw_crochet_texture(draw, 99.8, 281.5, 156.2, 290.2, (255, 246, 211))
    for x in (121.5, 125.0, 131.0, 134.5):
        draw.ellipse(box(x - 0.8, 286.8, x + 0.8, 288.4), fill=rgba((238, 226, 198), 230), outline=rgba(outline, 100))
    draw.line([pt(122.0, 287.5), pt(134.0, 299.7)], fill=rgba((30, 24, 31), 235), width=round(1.15 * SCALE))
    draw.line([pt(134.0, 287.5), pt(122.0, 299.7)], fill=rgba((30, 24, 31), 235), width=round(1.15 * SCALE))
    draw.line([pt(128.0, 290.0), pt(128.0, 312.0)], fill=rgba((30, 24, 31), 238), width=round(1.05 * SCALE))
    draw.arc(box(117.6, 284.4, 128.2, 294.0), 188, 356, fill=rgba((30, 24, 31), 238), width=round(1.05 * SCALE))
    draw.arc(box(127.8, 284.4, 138.4, 294.0), 184, 352, fill=rgba((30, 24, 31), 238), width=round(1.05 * SCALE))
    draw.line([pt(98.0, 280.9), pt(98.0, 291.0)], fill=rgba(outline, 80), width=max(1, round(0.35 * SCALE)))
    draw.line([pt(158.0, 280.9), pt(158.0, 291.0)], fill=rgba(outline, 80), width=max(1, round(0.35 * SCALE)))
    return downsample(detail)


def draw_coral_waistband() -> Image.Image:
    detail, draw = canvas()
    outline = (147, 83, 73)
    top_curve = [
        (97.8, 281.65),
        (107.0, 280.65),
        (118.2, 280.55),
        (128.0, 280.85),
        (137.8, 280.55),
        (149.0, 280.65),
        (158.2, 281.65),
    ]
    bottom_curve = [
        (98.2, 290.4),
        (108.0, 291.1),
        (119.0, 290.55),
        (128.0, 291.0),
        (137.0, 290.55),
        (148.0, 291.1),
        (157.8, 290.4),
    ]
    draw.line(poly(top_curve), fill=rgba((247, 178, 151), 138), width=max(1, round(0.52 * SCALE)), joint="curve")
    draw.line(poly(bottom_curve), fill=rgba(outline, 110), width=max(1, round(0.48 * SCALE)), joint="curve")
    for y, alpha in ((284.0, 32), (287.0, 28)):
        draw.line([pt(101.5, y), pt(154.5, y + 0.35)], fill=rgba((255, 201, 172), alpha), width=max(1, round(0.35 * SCALE)))
    for x in (122.5, 126.0, 130.0, 133.5):
        draw.ellipse(box(x - 0.55, 283.9, x + 0.55, 285.0), fill=rgba((245, 220, 190), 205), outline=rgba(outline, 80))
    for x0, x1 in ((122.5, 133.0), (133.5, 122.8)):
        draw.line([pt(x0, 284.8), pt(128.0, 290.6), pt(x1, 305.2)], fill=rgba((247, 207, 184), 190), width=max(1, round(0.58 * SCALE)))
        draw.line([pt(x0, 284.8), pt(128.0, 290.6), pt(x1, 305.2)], fill=rgba(outline, 58), width=max(1, round(0.22 * SCALE)))
    draw.line([pt(127.0, 284.2), pt(127.0, 312.6)], fill=rgba((247, 207, 184), 195), width=max(1, round(0.58 * SCALE)))
    draw.line([pt(131.0, 284.2), pt(131.0, 312.6)], fill=rgba((247, 207, 184), 195), width=max(1, round(0.58 * SCALE)))
    for x in (127.0, 131.0):
        draw.rectangle(box(x - 0.65, 312.2, x + 0.65, 315.0), fill=rgba((232, 222, 205), 210), outline=rgba((117, 93, 82), 100))
    draw.line([pt(98.2, 281.4), pt(98.2, 290.4)], fill=rgba(outline, 46), width=max(1, round(0.28 * SCALE)))
    draw.line([pt(157.8, 281.4), pt(157.8, 290.4)], fill=rgba(outline, 46), width=max(1, round(0.28 * SCALE)))
    return downsample(detail)


def draw_waist_grip_detail(spec: TailoredRenderSourceSpec) -> Image.Image:
    detail, draw = canvas()
    top_curve = [
        (97.8, 282.15),
        (106.5, 281.3),
        (118.0, 281.15),
        (128.0, 281.35),
        (138.0, 281.15),
        (149.5, 281.3),
        (158.2, 282.15),
    ]
    bottom_curve = [
        (158.2, 291.35),
        (148.5, 292.1),
        (136.5, 291.25),
        (128.0, 292.35),
        (119.5, 291.25),
        (107.5, 292.1),
        (97.8, 291.35),
    ]
    draw.line(
        poly(top_curve),
        fill=rgba(spec.outline, 42),
        width=max(1, round(0.38 * SCALE)),
        joint="curve",
    )
    draw.line(
        poly(bottom_curve),
        fill=rgba(spec.outline, 138),
        width=max(1, round(0.58 * SCALE)),
        joint="curve",
    )
    for x in (98.2, 157.8):
        draw.line(
            [pt(x, 282.8), pt(x, 291.0)],
            fill=rgba(spec.outline, 54),
            width=max(1, round(0.35 * SCALE)),
        )

    return downsample(detail)


def pt(x: float, y: float) -> tuple[int, int]:
    return (round(x * SCALE), round(y * SCALE))


def box(x0: float, y0: float, x1: float, y1: float) -> tuple[int, int, int, int]:
    return (*pt(x0, y0), *pt(x1, y1))


def poly(points: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [pt(x, y) for x, y in points]


def draw_soft_shadow(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]]) -> None:
    draw.polygon(poly([(x + 1.2, y + 1.5) for x, y in points]), fill=rgba((83, 54, 62), 46))


def polygon_mask(points: list[tuple[float, float]]) -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    ImageDraw.Draw(mask).polygon(poly(points), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(max(0.25, SCALE * 0.06)))


def merge_masks(*masks: Image.Image) -> Image.Image:
    out = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    for mask in masks:
        out = ImageChops.lighter(out, mask)
    return out


def masked_gradient(
    image: Image.Image,
    mask: Image.Image,
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
    alpha: int = 245,
) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    height = image.size[1]
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line((0, y, image.size[0], y), fill=rgba(color, alpha))
    layer.putalpha(Image.composite(mask, Image.new("L", image.size, 0), mask))
    image.alpha_composite(layer)


def source_texture_fill(
    image: Image.Image,
    source_path: Path,
    mask: Image.Image,
    target_box: tuple[float, float, float, float],
    opacity: int = 150,
) -> None:
    if not source_path.exists():
        return
    source = load(source_path)
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        return
    crop = source.crop(bbox)
    x0, y0, x1, y1 = box(*target_box)
    resized = crop.resize((max(1, x1 - x0), max(1, y1 - y0)), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    layer.alpha_composite(resized, (x0, y0))
    layer_alpha = ImageChops.multiply(layer.getchannel("A"), mask)
    layer.putalpha(layer_alpha.point(lambda value: round(value * opacity / 255)))
    image.alpha_composite(layer)


def add_fabric_grain(
    image: Image.Image,
    mask: Image.Image,
    seed: int,
    color: tuple[int, int, int],
    density: int,
    alpha: int,
) -> None:
    rng = random.Random(seed)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    bbox = mask.getbbox()
    if bbox is None:
        return
    for _ in range(density):
        x = rng.randint(bbox[0], bbox[2] - 1)
        y = rng.randint(bbox[1], bbox[3] - 1)
        if mask.getpixel((x, y)) < 80:
            continue
        radius = rng.choice([1, 1, 2])
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=rgba(color, rng.randint(max(18, alpha - 18), alpha)))
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    image.alpha_composite(layer)


def draw_mask_outline(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], color: tuple[int, int, int], alpha: int = 130) -> None:
    closed = points + [points[0]]
    draw.line(poly(closed), fill=rgba(color, alpha), width=max(1, round(0.7 * SCALE)), joint="curve")


def draw_vertical_folds(
    draw: ImageDraw.ImageDraw,
    x_values: list[float],
    y0: float,
    y1: float,
    color: tuple[int, int, int],
    alpha: int = 70,
) -> None:
    for index, x in enumerate(x_values):
        drift = -1.2 if index % 2 else 1.1
        draw.line(
            [pt(x, y0), pt(x + drift, (y0 + y1) / 2), pt(x - drift * 0.5, y1)],
            fill=rgba(color, alpha),
            width=max(1, round(0.55 * SCALE)),
        )


def draw_highlight(draw: ImageDraw.ImageDraw, x: float, y0: float, y1: float, color: tuple[int, int, int]) -> None:
    draw.line([pt(x, y0), pt(x + 1.8, (y0 + y1) / 2), pt(x, y1)], fill=rgba(color, 70), width=round(1.2 * SCALE))


def draw_stitch_line(draw: ImageDraw.ImageDraw, y: float, x0: float, x1: float, color: tuple[int, int, int], step: float = 4) -> None:
    x = x0
    while x < x1:
        draw.line([pt(x, y), pt(min(x + 1.5, x1), y + 0.3)], fill=rgba(color, 170), width=max(1, SCALE))
        x += step


def draw_crochet_texture(draw: ImageDraw.ImageDraw, x0: float, y0: float, x1: float, y1: float, color: tuple[int, int, int]) -> None:
    y = y0 + 1.5
    while y < y1:
        x = x0 + 1
        while x < x1:
            draw.arc(box(x - 1.3, y - 1.1, x + 2.4, y + 2.6), 190, 350, fill=rgba(color, 95), width=max(1, SCALE))
            x += 4.1
        y += 3.8


def render_striped_crochet_shorts() -> Image.Image:
    image, draw = canvas()
    outline = (58, 35, 62)
    left = [(98, 282), (126, 282), (124, 312), (104, 312), (96, 306), (96, 292)]
    right = [(130, 282), (158, 282), (160, 306), (152, 312), (132, 312), (128, 292)]
    for points in (left, right):
        draw_soft_shadow(draw, points)
        draw.polygon(poly(points), fill=rgba((220, 45, 52), 255))
    stripes = [
        ((238, 222, 168), 282, 288),
        ((46, 34, 46), 288, 293),
        ((111, 69, 180), 293, 298),
        ((210, 31, 45), 298, 305),
        ((51, 155, 83), 305, 310),
        ((236, 220, 142), 310, 314),
        ((48, 36, 48), 314, 318),
        ((204, 31, 44), 309, 312),
        ((50, 150, 78), 312, 314),
    ]
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    for points in (left, right):
        mask_draw.polygon(poly(points), fill=255)
    stripe_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    stripe_draw = ImageDraw.Draw(stripe_layer)
    for color, y0, y1 in stripes:
        stripe_draw.rectangle(box(91, y0, 164, y1), fill=rgba(color))
        draw_crochet_texture(stripe_draw, 94, y0, 162, y1, (255, 255, 235))
    image.alpha_composite(Image.composite(stripe_layer, Image.new("RGBA", image.size, (0, 0, 0, 0)), mask))
    add_fabric_grain(image, mask, 101, (255, 245, 218), 520, 52)
    draw.rounded_rectangle(box(94, 280, 162, 291), radius=round(4 * SCALE), fill=rgba((239, 227, 186)), outline=rgba(outline, 160), width=SCALE)
    draw.line([pt(128, 284), pt(128, 312)], fill=rgba(outline, 150), width=SCALE)
    draw.line([pt(108, 282), pt(123, 312)], fill=rgba((35, 28, 39), 70), width=SCALE)
    draw.line([pt(148, 282), pt(133, 312)], fill=rgba((35, 28, 39), 70), width=SCALE)
    draw_vertical_folds(draw, [102, 113, 121, 136, 145, 154], 292, 311, (255, 255, 238), 54)
    for x in (122, 126, 130, 134):
        draw.ellipse(box(x - 0.7, 287, x + 0.7, 288.4), fill=rgba((236, 230, 214), 210))
    draw.line([pt(121, 287), pt(134, 304)], fill=rgba((38, 28, 43), 210), width=round(1.2 * SCALE))
    draw.line([pt(135, 287), pt(122, 304)], fill=rgba((38, 28, 43), 210), width=round(1.2 * SCALE))
    draw.line([pt(128, 291), pt(128, 314)], fill=rgba((38, 28, 43), 235), width=round(1.2 * SCALE))
    for y in (304, 309, 313):
        draw_stitch_line(draw, y, 96, 160, (250, 231, 148), 3.4)
    for x in range(99, 157, 7):
        draw.arc(box(x, 309, x + 8, 316), 0, 180, fill=rgba((246, 226, 132), 185), width=max(1, SCALE))
    return downsample(image)


def draw_ruffle_band(draw: ImageDraw.ImageDraw, y: float, fill: tuple[int, int, int], edge: tuple[int, int, int], lace: bool = False) -> None:
    points = [(94, y), (162, y + 0.5), (160, y + 11), (147, y + 16), (132, y + 13), (119, y + 16), (106, y + 13), (96, y + 11)]
    draw_soft_shadow(draw, points)
    draw.polygon(poly(points), fill=rgba(fill, 202 if lace else 224), outline=rgba(edge, 140))
    for x in range(98, 159, 8):
        draw.arc(box(x, y + 6, x + 10, y + 18), 190, 350, fill=rgba(edge, 125), width=max(1, round(0.7 * SCALE)))
        if lace:
            draw.line([pt(x + 2, y + 3), pt(x + 8, y + 15)], fill=rgba((255, 242, 205), 82), width=max(1, round(0.6 * SCALE)))
            draw.line([pt(x + 8, y + 3), pt(x + 2, y + 15)], fill=rgba((255, 242, 205), 68), width=max(1, round(0.6 * SCALE)))


def draw_lace_scallop(draw: ImageDraw.ImageDraw, y: float, x0: float, x1: float, color: tuple[int, int, int], alpha: int = 205) -> None:
    x = x0
    while x < x1:
        draw.arc(box(x, y - 2, x + 7, y + 5), 0, 180, fill=rgba(color, alpha), width=max(1, round(0.7 * SCALE)))
        draw.ellipse(box(x + 2.6, y + 1.8, x + 3.8, y + 3.0), fill=rgba(color, round(alpha * 0.75)))
        x += 5.6


def draw_butterfly_mark(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float, fill: tuple[int, int, int], line: tuple[int, int, int]) -> None:
    draw.ellipse(box(x - 3.2 * scale, y - 2.3 * scale, x - 0.4 * scale, y + 1.2 * scale), fill=rgba(fill, 128), outline=rgba(line, 78))
    draw.ellipse(box(x + 0.4 * scale, y - 2.3 * scale, x + 3.2 * scale, y + 1.2 * scale), fill=rgba(fill, 128), outline=rgba(line, 78))
    draw.line([pt(x, y - 2.1 * scale), pt(x, y + 2.0 * scale)], fill=rgba(line, 110), width=max(1, round(0.45 * SCALE)))


def draw_curved_chain(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], color: tuple[int, int, int], alpha: int = 140) -> None:
    draw.line([pt(*point) for point in points], fill=rgba(color, alpha), width=max(1, round(0.7 * SCALE)), joint="curve")
    for x, y in points[1:-1]:
        draw.ellipse(box(x - 0.9, y - 0.9, x + 0.9, y + 0.9), fill=rgba((248, 231, 188), min(235, alpha + 70)), outline=rgba(color, 90))


def pants_mask(points_left: list[tuple[float, float]], points_right: list[tuple[float, float]]) -> Image.Image:
    mask = Image.new("L", (CANVAS[0] * SCALE, CANVAS[1] * SCALE), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(poly(points_left), fill=255)
    draw.polygon(poly(points_right), fill=255)
    return mask


def render_pants_base(
    left: list[tuple[float, float]],
    right: list[tuple[float, float]],
    fill: tuple[int, int, int],
    outline: tuple[int, int, int],
    alpha: int = 244,
) -> tuple[Image.Image, ImageDraw.ImageDraw, Image.Image]:
    image, draw = canvas()
    left_mask = polygon_mask(left)
    right_mask = polygon_mask(right)
    mask = merge_masks(left_mask, right_mask)

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_alpha = ImageChops.offset(mask, round(1.2 * SCALE), round(1.4 * SCALE)).filter(
        ImageFilter.GaussianBlur(round(0.8 * SCALE))
    )
    shadow.putalpha(shadow_alpha.point(lambda value: min(54, value // 4)))
    image.alpha_composite(shadow)

    top = tuple(min(255, c + 18) for c in fill)
    bottom = tuple(max(0, c - 16) for c in fill)
    masked_gradient(image, mask, top, bottom, alpha)
    add_fabric_grain(image, mask, sum(fill), (255, 244, 226), 800, 42)

    for points in (left, right):
        draw_mask_outline(draw, points, outline, 145)
    draw.rounded_rectangle(
        box(97, 280.5, 159, 291.5),
        radius=round(3.5 * SCALE),
        fill=rgba(tuple(min(255, c + 22) for c in fill), min(255, alpha + 10)),
        outline=rgba(outline, 168),
        width=max(1, round(0.8 * SCALE)),
    )
    draw.line([pt(128, 288), pt(128, 340)], fill=rgba(outline, 108), width=max(1, round(0.6 * SCALE)))
    draw_vertical_folds(draw, [104, 113, 121, 136, 145, 153], 292, 339, (255, 247, 232), 48)
    draw_highlight(draw, 106, 292, 337, (255, 255, 255))
    draw_highlight(draw, 149, 292, 337, (255, 255, 255))
    return image, draw, mask


def draw_palm(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float, color: tuple[int, int, int]) -> None:
    draw.line([pt(x, y + 7 * scale), pt(x + 2 * scale, y - 2 * scale)], fill=rgba(color, 210), width=max(1, round(0.8 * SCALE)))
    for angle in (-7, -4, -1, 2, 5):
        draw.line([pt(x + 1 * scale, y), pt(x + angle * scale, y - 7 * scale)], fill=rgba(color, 205), width=max(1, round(0.75 * SCALE)))
    for angle in (-5, -2, 2, 5):
        draw.line([pt(x + 1.2 * scale, y + 2), pt(x + angle * scale, y + 7 * scale)], fill=rgba(color, 195), width=max(1, round(0.7 * SCALE)))


def render_black_palm_embellished_pants() -> Image.Image:
    left = [(98, 282), (127, 282), (124, 342), (98, 342), (94, 314)]
    right = [(129, 282), (158, 282), (162, 314), (158, 342), (132, 342)]
    image, draw, _ = render_pants_base(left, right, (38, 29, 30), (23, 18, 19), 248)
    draw.ellipse(box(124, 284, 132, 291), outline=rgba((205, 164, 81), 230), width=round(1.2 * SCALE))
    draw.ellipse(box(126, 286, 130, 289), fill=rgba((55, 37, 30), 210))
    draw.line([pt(101, 291), pt(156, 291)], fill=rgba((15, 13, 14), 180), width=SCALE)
    for x, y, s in [(111, 304, 1.12), (148, 302, 1.0), (116, 328, 0.84), (141, 329, 0.8)]:
        draw_palm(draw, x, y, s, (223, 217, 170))
    for x in range(101, 158, 9):
        for y in range(295, 339, 10):
            draw.ellipse(box(x - 0.6, y - 0.6, x + 0.6, y + 0.6), fill=rgba((225, 215, 183), 170))
    return downsample(image)


def draw_beaded_swirl(draw: ImageDraw.ImageDraw, x: float, y: float, mirror: int = 1) -> None:
    color = (221, 205, 175)
    pts = [(x, y), (x + mirror * 5, y + 4), (x + mirror * 1, y + 9), (x + mirror * 7, y + 14)]
    for px, py in pts:
        draw.ellipse(box(px - 0.7, py - 0.7, px + 0.7, py + 0.7), fill=rgba(color, 210))
    draw.line([pt(*p) for p in pts], fill=rgba(color, 95), width=max(1, SCALE))
    for px, py in [(x + mirror * 3, y + 3), (x + mirror * 4, y + 10), (x + mirror * 6, y + 15)]:
        draw.line([pt(px, py), pt(px + mirror * 3, py - 2)], fill=rgba((117, 78, 66), 145), width=max(1, SCALE))


def render_coral_embellished_laceup_pants() -> Image.Image:
    left = [(98, 281), (127, 281), (123, 342), (96, 342), (94, 310)]
    right = [(129, 281), (158, 281), (162, 310), (160, 342), (133, 342)]
    image, draw, _ = render_pants_base(left, right, (218, 132, 111), (145, 82, 72), 240)
    draw.rounded_rectangle(box(97, 280, 159, 289), radius=round(3 * SCALE), fill=rgba((224, 143, 122), 250), outline=rgba((145, 82, 72), 165), width=SCALE)
    for y in (291, 297, 303, 309):
        draw.line([pt(123, y), pt(133, y + 4)], fill=rgba((120, 75, 68), 180), width=max(1, SCALE))
        draw.line([pt(133, y), pt(123, y + 4)], fill=rgba((120, 75, 68), 180), width=max(1, SCALE))
    draw.line([pt(125, 282), pt(120, 333)], fill=rgba((130, 77, 70), 190), width=max(1, SCALE))
    draw.line([pt(131, 282), pt(136, 333)], fill=rgba((130, 77, 70), 190), width=max(1, SCALE))
    for x, y in [(108, 295), (112, 318), (146, 296), (141, 319), (110, 333), (146, 334)]:
        draw_beaded_swirl(draw, x, y, 1 if x < 128 else -1)
    for x, y in [(116, 301), (111, 329), (145, 304), (150, 330)]:
        draw.ellipse(box(x - 0.9, y - 0.9, x + 0.9, y + 0.9), fill=rgba((244, 223, 192), 185))
    for x in (121, 135):
        draw.ellipse(box(x - 1.2, 335, x + 1.2, 337.5), fill=rgba((221, 205, 180), 220), outline=rgba((86, 67, 63), 120))
    return downsample(image)


def draw_flower(draw: ImageDraw.ImageDraw, x: float, y: float, color: tuple[int, int, int], scale: float = 1.0) -> None:
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2)]:
        draw.ellipse(box(x + dx * scale - 1.5, y + dy * scale - 1.5, x + dx * scale + 1.5, y + dy * scale + 1.5), fill=rgba(color, 165))
    draw.ellipse(box(x - 1, y - 1, x + 1, y + 1), fill=rgba((204, 142, 74), 210))


def draw_tiny_butterfly(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float = 1.0) -> None:
    wing = (255, 229, 134)
    trim = (111, 62, 43)
    draw.ellipse(
        box(x - 3.5 * scale, y - 2.2 * scale, x - 0.5 * scale, y + 1.2 * scale),
        fill=rgba(wing, 115),
        outline=rgba(trim, 60),
    )
    draw.ellipse(
        box(x + 0.5 * scale, y - 2.2 * scale, x + 3.5 * scale, y + 1.2 * scale),
        fill=rgba(wing, 115),
        outline=rgba(trim, 60),
    )
    draw.line([pt(x, y - 2.0 * scale), pt(x, y + 2.0 * scale)], fill=rgba(trim, 94), width=max(1, round(0.45 * SCALE)))


def render_smoky_floral_mesh_pants() -> Image.Image:
    left = [(96, 282), (127, 282), (123, 342), (94, 342), (91, 309)]
    right = [(129, 282), (160, 282), (165, 309), (162, 342), (133, 342)]
    image, draw, _ = render_pants_base(left, right, (86, 91, 88), (50, 48, 45), 178)
    for x in range(96, 160, 6):
        draw.line([pt(x, 284), pt(x + 16, 341)], fill=rgba((220, 220, 210), 18), width=max(1, round(0.7 * SCALE)))
    for x in range(102, 162, 12):
        draw.line([pt(x, 284), pt(x - 12, 341)], fill=rgba((45, 42, 40), 22), width=max(1, round(0.7 * SCALE)))
    for x, y, c in [
        (108, 299, (201, 202, 190)),
        (147, 299, (178, 151, 121)),
        (113, 320, (135, 150, 160)),
        (143, 324, (214, 214, 196)),
        (104, 335, (190, 190, 178)),
        (151, 336, (120, 122, 112)),
    ]:
        draw_flower(draw, x, y, c, 0.95)
    draw.line([pt(124, 283), pt(124, 337)], fill=rgba((235, 235, 225), 118), width=max(1, round(0.75 * SCALE)))
    draw.line([pt(132, 283), pt(132, 337)], fill=rgba((235, 235, 225), 118), width=max(1, round(0.75 * SCALE)))
    draw.line([pt(124, 286), pt(113, 294)], fill=rgba((235, 235, 225), 105), width=max(1, round(0.7 * SCALE)))
    draw.line([pt(132, 286), pt(143, 294)], fill=rgba((235, 235, 225), 105), width=max(1, round(0.7 * SCALE)))
    return downsample(image)


def tint_yellow_skirt_to_set(layer: Image.Image) -> Image.Image:
    tinted = layer.copy()
    alpha = tinted.getchannel("A")
    wash = Image.new("RGBA", CANVAS, rgba((243, 200, 97), 52))
    wash.putalpha(alpha.point(lambda value: min(60, round(value * 0.24))))
    tinted.alpha_composite(wash)
    return tinted


def clean_skirt_artifacts(layer: Image.Image, slug: str) -> Image.Image:
    cleaned = layer.copy()
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            is_contact_background = r > 240 and 230 <= g <= 242 and b > 235
            is_low_shadow_tail = slug.endswith("skirt") and y >= 322
            if is_contact_background or is_low_shadow_tail:
                pixels[x, y] = (0, 0, 0, 0)
    return cleaned


def render_layered_lace_ruffle_mini_skirt() -> Image.Image:
    image, draw = canvas()
    outline = (145, 54, 45)
    draw_ruffle_band(draw, 288, (220, 78, 48), outline)
    draw_ruffle_band(draw, 299, (220, 184, 128), (158, 124, 72), True)
    draw_ruffle_band(draw, 309, (216, 76, 48), outline)
    draw_lace_scallop(draw, 322, 91, 166, (245, 220, 170), 185)
    draw.rounded_rectangle(
        box(96, 280.5, 160, 291.5),
        radius=round(3.6 * SCALE),
        fill=rgba((206, 95, 52), 235),
        outline=rgba(outline, 150),
        width=max(1, round(0.75 * SCALE)),
    )
    for x in (123, 128, 133):
        draw.line([pt(x, 282), pt(128, 289), pt(x, 316)], fill=rgba((144, 59, 45), 130), width=max(1, round(0.6 * SCALE)))
    return downsample(image)


def render_yellow_bow_lace_ruffle_skirt() -> Image.Image:
    image, draw = canvas()
    outline = (165, 126, 54)
    draw_ruffle_band(draw, 289, (243, 200, 97), outline)
    draw_ruffle_band(draw, 301, (235, 188, 84), outline)
    draw_ruffle_band(draw, 311, (252, 224, 139), (188, 144, 62), True)
    draw_lace_scallop(draw, 321, 92, 166, (255, 248, 218), 205)
    draw.rounded_rectangle(
        box(96, 280.5, 160, 291.5),
        radius=round(3.6 * SCALE),
        fill=rgba((243, 200, 97), 240),
        outline=rgba(outline, 150),
        width=max(1, round(0.75 * SCALE)),
    )
    for x, y, scale in [(115, 300, 0.72), (141, 298, 0.68), (128, 287, 0.82)]:
        draw_tiny_butterfly(draw, x, y, scale)
    draw.line([pt(121, 285), pt(128, 291), pt(135, 285)], fill=rgba((129, 92, 42), 125), width=max(1, round(0.7 * SCALE)))
    return downsample(image)


def render_bottom(profile: BottomProfile) -> Image.Image:
    tailored_spec = TAILORED_RENDER_SOURCE_SPECS.get(profile.slug)
    source = source_for_profile(profile)
    if tailored_spec and source is not None:
        layer = fit_source_to_tailored_layer(source, tailored_spec)
        if profile.kind in {"layered_skirt", "yellow_skirt"}:
            layer = clean_skirt_artifacts(layer, profile.slug)
        if profile.kind == "yellow_skirt":
            layer = tint_yellow_skirt_to_set(layer)
        return layer
    if profile.kind == "shorts":
        return render_striped_crochet_shorts()
    if profile.kind == "layered_skirt":
        return render_layered_lace_ruffle_mini_skirt()
    if profile.kind == "black_pants":
        return render_black_palm_embellished_pants()
    if profile.kind == "coral_pants":
        return render_coral_embellished_laceup_pants()
    if profile.kind == "mesh_pants":
        return render_smoky_floral_mesh_pants()
    if profile.kind == "yellow_skirt":
        return render_yellow_bow_lace_ruffle_skirt()
    raise ValueError(profile.kind)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("blank layer")
    return bbox


def scale_about_bbox(image: Image.Image, dx: int, dy: int, sx: float, sy: float) -> Image.Image:
    if dx == 0 and dy == 0 and sx == 1.0 and sy == 1.0:
        return image.copy()
    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    size = (max(1, round(crop.width * sx)), max(1, round(crop.height * sy)))
    resized = crop.resize(size, Image.Resampling.LANCZOS)
    center_x = (bbox[0] + bbox[2]) / 2 + dx
    center_y = (bbox[1] + bbox[3]) / 2 + dy
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(resized, (round(center_x - size[0] / 2), round(center_y - size[1] / 2)))
    return out


def build_walking_frames(image: Image.Image) -> list[Image.Image]:
    frames = [
        image.copy(),
        scale_about_bbox(image, -2, 1, 1.02, 1.0),
        scale_about_bbox(image, 1, 0, 0.99, 0.99),
        scale_about_bbox(image, 2, 1, 1.02, 1.0),
    ]
    return frames


def build_sitting_frame(image: Image.Image, profile: BottomProfile) -> Image.Image:
    if "pants" in profile.kind:
        return scale_about_bbox(image, 0, 1, 1.12, 0.82)
    return scale_about_bbox(image, 0, 3, 1.18, 0.78)


def build_thumbnail(image: Image.Image) -> Image.Image:
    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    scale = min(172 / crop.width, 154 / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    resized = crop.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    out.alpha_composite(resized, (round((220 - size[0]) / 2), round((220 - size[1]) / 2)))
    return out


def composite(base: Image.Image, bottom: Image.Image) -> Image.Image:
    out = Image.new("RGBA", CANVAS, (247, 237, 244, 255))
    out.alpha_composite(base)
    out.alpha_composite(bottom)
    return out


def composite_with_shoes(base: Image.Image, bottom: Image.Image) -> Image.Image:
    out = composite(base, bottom)
    out.alpha_composite(load(ASSET_DIR / FEMALE_DEFAULT_SHOE_ASSET))
    return out


def render_static_qa(profiles: list[BottomProfile]) -> None:
    cell_w, cell_h = (256, 424)
    sheet = Image.new("RGBA", (cell_w * len(profiles), cell_h), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    for index, profile in enumerate(profiles):
        preview = composite(base, load(layer_path(profile.slug)))
        save(preview, QA_DIR / f"{profile.slug}_static_fit_qa.png")
        x = index * cell_w
        draw.text((x + 8, 8), profile.name, fill=(73, 55, 67, 255))
        sheet.alpha_composite(preview, (x, 38))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_static_fit_contact_sheet.png")


def render_motion_qa(profiles: list[BottomProfile]) -> None:
    columns = ["Static", "Walk f01", "Walk f02", "Walk f03", "Walk f04", "Sitting"]
    cell_w, cell_h = (192, 248)
    sheet = Image.new("RGBA", (cell_w * len(columns), cell_h * len(profiles)), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    static_base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    for row, profile in enumerate(profiles):
        y = row * cell_h
        draw.text((8, y + 8), profile.name, fill=(73, 55, 67, 255))
        frames = [composite(static_base, load(layer_path(profile.slug)))]
        for index in range(1, 5):
            suffix = f"walking_front_f0{index}"
            frames.append(composite(load(base_motion_path(suffix)), load(motion_path(profile.slug, suffix))))
        frames.append(composite(load(base_motion_path("sitting_front_f01")), load(motion_path(profile.slug, "sitting_front_f01"))))
        for col, preview in enumerate(frames):
            x = col * cell_w
            if row == 0:
                draw.text((x + 8, 30), columns[col], fill=(73, 55, 67, 255))
            sheet.alpha_composite(preview.resize((128, 192), Image.Resampling.LANCZOS), (x + 32, y + 46))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_motion_fit_contact_sheet.png")


def render_motion_shoe_clearance_qa(profiles: list[BottomProfile]) -> None:
    columns = ["Static", "Walk f01", "Walk f02", "Walk f03", "Walk f04", "Sitting"]
    cell_w, cell_h = (192, 248)
    sheet = Image.new("RGBA", (cell_w * len(columns), cell_h * len(profiles)), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    static_base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    static_shoes = load(ASSET_DIR / FEMALE_DEFAULT_SHOE_ASSET)
    for row, profile in enumerate(profiles):
        y = row * cell_h
        draw.text((8, y + 8), profile.name, fill=(73, 55, 67, 255))
        frames = [composite(static_base, load(layer_path(profile.slug)))]
        frames[0].alpha_composite(static_shoes)
        for index in range(1, 5):
            suffix = f"walking_front_f0{index}"
            frame = composite(load(base_motion_path(suffix)), load(motion_path(profile.slug, suffix)))
            frame.alpha_composite(load(MOTION_DIR / f"{FEMALE_DEFAULT_SHOE_MOTION_PREFIX}_{suffix}.png"))
            frames.append(frame)
        sitting = composite(load(base_motion_path("sitting_front_f01")), load(motion_path(profile.slug, "sitting_front_f01")))
        sitting.alpha_composite(load(MOTION_DIR / f"{FEMALE_DEFAULT_SHOE_MOTION_PREFIX}_sitting_front_f01.png"))
        frames.append(sitting)
        for col, preview in enumerate(frames):
            x = col * cell_w
            if row == 0:
                draw.text((x + 8, 30), columns[col], fill=(73, 55, 67, 255))
            sheet.alpha_composite(preview.resize((128, 192), Image.Resampling.LANCZOS), (x + 32, y + 46))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_motion_shoe_clearance_contact_sheet.png")


def render_zoom_qa(profiles: list[BottomProfile]) -> None:
    cell_w, cell_h = (320, 360)
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 2), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    crop_box = (82, 260, 174, 344)
    for index, profile in enumerate(profiles):
        preview = composite(base, load(layer_path(profile.slug))).crop(crop_box).resize((276, 252), Image.Resampling.LANCZOS)
        x = (index % 3) * cell_w
        y = (index // 3) * cell_h
        draw.text((x + 8, y + 8), profile.name, fill=(73, 55, 67, 255))
        sheet.alpha_composite(preview, (x + 22, y + 48))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_fit_zoom_contact_sheet.png")


def render_waist_fit_qa(profiles: list[BottomProfile]) -> None:
    cell_w, cell_h = (300, 230)
    sheet = Image.new("RGBA", (cell_w * len(profiles), cell_h), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    crop_box = (88, 272, 168, 306)
    for index, profile in enumerate(profiles):
        preview = composite(base, load(layer_path(profile.slug))).crop(crop_box).resize((240, 102), Image.Resampling.LANCZOS)
        x = index * cell_w
        draw.text((x + 8, 8), profile.name, fill=(73, 55, 67, 255))
        sheet.alpha_composite(preview, (x + 30, 70))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_waist_fit_contact_sheet.png")


def render_shoe_clearance_qa(profiles: list[BottomProfile]) -> None:
    cell_w, cell_h = (320, 360)
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 2), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    crop_box = (82, 270, 174, 348)
    for index, profile in enumerate(profiles):
        preview = composite_with_shoes(base, load(layer_path(profile.slug))).crop(crop_box).resize((276, 234), Image.Resampling.LANCZOS)
        x = (index % 3) * cell_w
        y = (index // 3) * cell_h
        draw.text((x + 8, y + 8), profile.name, fill=(73, 55, 67, 255))
        draw.text((x + 8, y + 26), "shoe clearance", fill=(124, 93, 111, 255))
        sheet.alpha_composite(preview, (x + 22, y + 74))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_shoe_clearance_contact_sheet.png")


def render_shop_thumbnail_qa(profiles: list[BottomProfile]) -> None:
    cell_w, cell_h = (220, 260)
    sheet = Image.new("RGBA", (cell_w * len(profiles), cell_h), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    for index, profile in enumerate(profiles):
        x = index * cell_w
        draw.text((x + 8, 8), profile.name, fill=(73, 55, 67, 255))
        sheet.alpha_composite(load(thumbnail_path(profile.slug)), (x, 36))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_shop_thumbnail_contact_sheet.png")


def render_yellow_set_pairing_qa() -> None:
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    # The former soft-yellow pairing asset was retired from the live catalog;
    # keep this QA sheet grounded in a promoted non-dress top instead of
    # silently depending on a deleted file.
    top = load(ASSET_DIR / "avatar_room_top_female_cream_basic_tee_v2.png")
    bottom = load(layer_path("yellow_bow_lace_ruffle_skirt"))
    shoes = load(ASSET_DIR / FEMALE_DEFAULT_SHOE_ASSET)
    preview = Image.new("RGBA", CANVAS, (247, 237, 244, 255))
    preview.alpha_composite(base)
    preview.alpha_composite(bottom)
    preview.alpha_composite(top)
    preview.alpha_composite(shoes)
    crop = preview.crop((58, 205, 198, 350)).resize((420, 435), Image.Resampling.LANCZOS)
    sheet = Image.new("RGBA", (480, 500), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 14), "Cream Basic Tee + Yellow Bow Lace Ruffle Skirt", fill=(73, 55, 67, 255))
    sheet.alpha_composite(crop, (30, 50))
    save(sheet.convert("RGB"), QA_DIR / "bottom_reference_set_yellow_pairing_qa.png")


def main() -> None:
    for profile in PROFILES:
        layer = render_bottom(profile)
        save(layer, layer_path(profile.slug))
        for index, frame in enumerate(build_walking_frames(layer), start=1):
            save(frame, motion_path(profile.slug, f"walking_front_f0{index}"))
        save(build_sitting_frame(layer, profile), motion_path(profile.slug, "sitting_front_f01"))
        save(build_thumbnail(layer), thumbnail_path(profile.slug))
    render_static_qa(PROFILES)
    render_zoom_qa(PROFILES)
    render_waist_fit_qa(PROFILES)
    render_shoe_clearance_qa(PROFILES)
    render_motion_qa(PROFILES)
    render_motion_shoe_clearance_qa(PROFILES)
    render_shop_thumbnail_qa(PROFILES)
    render_yellow_set_pairing_qa()


if __name__ == "__main__":
    main()
