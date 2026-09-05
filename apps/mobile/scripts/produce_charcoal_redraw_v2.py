#!/usr/bin/env python3
"""Build the charcoal tapered chinos from the approved male geometry.

The waistband and each leg are authored as separate 4x construction panels;
the rejected runtime garment is never used as a texture source.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT = REPO / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-26/charcoal-redraw-v2"
GEOMETRY = OUTPUT / "geometry.json"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
AI_UNDERPAINT = OUTPUT / "step-2-ai-underpaint-v3-alpha.png"
BODY_CONTEXT_PAINT = OUTPUT / "step-2-direct-body-paint-reference.png"
QUALITY_REFERENCE = OUTPUT / "step-5-quality-art-reference.png"
QUALITY_BEFORE_PREVIEW = OUTPUT / "step-5-quality-before-preview.png"
SHOE_CONTACT_BEFORE_PREVIEW = OUTPUT / "step-6-shoe-contact-before-preview.png"
SCALE = 4
CANVAS = (256, 384)
MASTER_CANVAS = (CANVAS[0] * SCALE, CANVAS[1] * SCALE)
HEM_EXCLUSIVE_Y = 329


def _geometry() -> dict:
    return json.loads(GEOMETRY.read_text())


def _native_mask() -> Image.Image:
    geometry = _geometry()
    left_outer = [tuple(point) for point in geometry["leftLeg"]["outerContour"]]
    left_inner = [tuple(point) for point in geometry["leftLeg"]["innerContour"]]
    left_hem = [tuple(point) for point in geometry["leftLeg"]["hemContour"]]
    right_outer = [tuple(point) for point in geometry["rightLeg"]["outerContour"]]
    right_inner = [tuple(point) for point in geometry["rightLeg"]["innerContour"]]
    right_hem = [tuple(point) for point in geometry["rightLeg"]["hemContour"]]
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [(127, 286), *left_outer, *left_hem[1:], *reversed(left_inner)],
        fill=255,
    )
    draw.polygon(
        [(128, 286), *right_outer, *right_hem[1:], *reversed(right_inner)],
        fill=255,
    )
    return mask


def _master_mask() -> Image.Image:
    """Draw continuous garment contours at 4x instead of scaling pixel stairs."""

    geometry = _geometry()
    left_outer = [tuple(point) for point in geometry["leftLeg"]["outerContour"]]
    left_inner = [tuple(point) for point in geometry["leftLeg"]["innerContour"]]
    left_hem = [tuple(point) for point in geometry["leftLeg"]["hemContour"]]
    right_outer = [tuple(point) for point in geometry["rightLeg"]["outerContour"]]
    right_inner = [tuple(point) for point in geometry["rightLeg"]["innerContour"]]
    right_hem = [tuple(point) for point in geometry["rightLeg"]["hemContour"]]
    hem_bottom = geometry["anchors"]["hemExclusiveY"] * SCALE - 1
    waist_top = geometry["anchors"]["waistTopY"] * SCALE

    left_outer_edge = [(x * SCALE, y * SCALE) for x, y in left_outer]
    left_inner_edge = [((x + 1) * SCALE - 1, y * SCALE) for x, y in left_inner]
    left_hem_edge = [(int(round(x * SCALE)), int(round(y * SCALE))) for x, y in left_hem]
    right_outer_edge = [((x + 1) * SCALE - 1, y * SCALE) for x, y in right_outer]
    right_inner_edge = [(x * SCALE, y * SCALE) for x, y in right_inner]
    right_hem_edge = [(int(round(x * SCALE)), int(round(y * SCALE))) for x, y in right_hem]

    mask = Image.new("L", MASTER_CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [
            (128 * SCALE - 1, waist_top),
            *left_outer_edge,
            *left_hem_edge[1:-1],
            ((left_inner[-1][0] + 1) * SCALE - 1, hem_bottom),
            *reversed(left_inner_edge),
        ],
        fill=255,
    )
    draw.polygon(
        [
            (128 * SCALE, waist_top),
            *right_outer_edge,
            *right_hem_edge[1:-1],
            (right_inner[-1][0] * SCALE, hem_bottom),
            *reversed(right_inner_edge),
        ],
        fill=255,
    )
    return mask


def _fabric_field() -> Image.Image:
    width, height = MASTER_CANVAS
    yy, xx = np.mgrid[0:height, 0:width]
    left_light = np.exp(-((xx - 452) / 74) ** 2)
    right_light = np.exp(-((xx - 572) / 74) ** 2)
    center_shadow = np.exp(-((xx - 512) / 38) ** 2) * np.exp(-((yy - 1212) / 76) ** 2)
    lower_shadow = np.clip((yy - 1160) / 210, 0, 1)
    vertical_drape = 2.2 * np.sin((yy - 1136) / 29) + 1.4 * np.sin((yy + xx) / 43)
    shade = 15 * (left_light + right_light) - 13 * center_shadow - 3 * lower_shadow + vertical_drape
    rng = np.random.default_rng(260726)
    grain = rng.normal(0, 1.25, (height, width))
    base = np.array([48, 46, 55], dtype=np.float32)
    rgb = np.clip(base + shade[..., None] + grain[..., None], 0, 255).astype(np.uint8)
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    return Image.fromarray(np.concatenate((rgb, alpha), axis=2)).filter(
        ImageFilter.GaussianBlur(0.45)
    )


def _masked_detail(mask: Image.Image) -> Image.Image:
    detail = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(detail, "RGBA")

    # Waistband and its restrained fabric roll.
    draw.rectangle((400, 1144, 623, 1173), fill=(34, 32, 39, 205))
    draw.line((404, 1171, 619, 1171), fill=(77, 73, 84, 135), width=3)
    draw.line((408, 1149, 615, 1149), fill=(88, 83, 94, 85), width=2)

    # Button and short fly construction, scaled for the chibi garment.
    draw.ellipse((503, 1149, 521, 1167), fill=(117, 81, 38, 255), outline=(43, 35, 33, 230), width=2)
    draw.ellipse((507, 1152, 517, 1162), fill=(194, 144, 70, 230))
    draw.line((512, 1172, 512, 1203, 508, 1212), fill=(25, 24, 29, 150), width=3)
    draw.line((516, 1174, 516, 1200), fill=(83, 79, 89, 90), width=2)

    # Model two legs with tonal volume while keeping the alpha front plane
    # closed. This is deliberately a broad soft shadow, never a black slit.
    leg_form = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    leg_draw = ImageDraw.Draw(leg_form, "RGBA")
    leg_draw.polygon(
        ((484, 1184), (540, 1184), (526, 1224), (516, 1260), (508, 1260), (498, 1224)),
        fill=(10, 11, 15, 82),
    )
    leg_draw.line(((512, 1200), (512, 1254)), fill=(9, 10, 14, 42), width=5)
    leg_draw.line(((492, 1192), (506, 1210)), fill=(113, 106, 120, 35), width=5)
    leg_draw.line(((532, 1192), (518, 1210)), fill=(113, 106, 120, 35), width=5)
    leg_form = leg_form.filter(ImageFilter.GaussianBlur(9))
    detail = Image.alpha_composite(detail, leg_form)

    # Pocket openings remain subtle and terminate before the leg plane.
    draw = ImageDraw.Draw(detail, "RGBA")
    draw.line((410, 1165, 438, 1194), fill=(27, 26, 31, 155), width=4)
    draw.line((614, 1165, 586, 1194), fill=(27, 26, 31, 155), width=4)
    draw.line((414, 1165, 440, 1191), fill=(83, 79, 89, 95), width=2)
    draw.line((610, 1165, 584, 1191), fill=(83, 79, 89, 95), width=2)

    # Painterly hip and knee folds: blurred tonal strokes, never alpha cuts.
    folds = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    fold_draw = ImageDraw.Draw(folds, "RGBA")
    for points in (
        ((416, 1189), (450, 1200), (475, 1218)),
        ((608, 1189), (574, 1200), (549, 1218)),
        ((422, 1234), (452, 1228), (480, 1235)),
        ((602, 1234), (572, 1228), (544, 1235)),
        ((432, 1262), (460, 1256), (484, 1264)),
        ((592, 1262), (564, 1256), (540, 1264)),
    ):
        fold_draw.line(points, fill=(13, 14, 18, 62), width=8, joint="curve")
        fold_draw.line(tuple((x, y - 4) for x, y in points), fill=(105, 99, 112, 32), width=5, joint="curve")
    folds = folds.filter(ImageFilter.GaussianBlur(5.5))
    detail = Image.alpha_composite(detail, folds)

    # Hem construction is soft and does not cover the shoe upper.
    draw = ImageDraw.Draw(detail, "RGBA")
    draw.line((416, 1305, 504, 1305), fill=(28, 27, 33, 105), width=3)
    draw.line((520, 1305, 608, 1305), fill=(28, 27, 33, 105), width=3)

    return Image.composite(detail, Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)), mask)


def build_geometry_underpaint() -> Image.Image:
    mask = _master_mask()
    fabric = Image.composite(_fabric_field(), Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)), mask)
    master = Image.alpha_composite(fabric, _masked_detail(mask))

    # A dark painterly rim defines the garment without detached fringe.
    eroded = mask.filter(ImageFilter.MinFilter(9))
    rim = ImageChops.subtract(mask, eroded)
    rim_layer = Image.new("RGBA", MASTER_CANVAS, (23, 22, 27, 155))
    master = Image.alpha_composite(master, Image.composite(rim_layer, Image.new("RGBA", MASTER_CANVAS), rim))
    master.putalpha(mask)

    pixels = np.asarray(master).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def build_master() -> Image.Image:
    """Apply a premium art pass without changing the approved alpha geometry."""

    for path in (AI_UNDERPAINT, BODY_CONTEXT_PAINT, QUALITY_REFERENCE):
        if not path.exists():
            raise FileNotFoundError(f"missing reviewed 4x charcoal paint source: {path}")
    mask = _master_mask()
    aligned = build_geometry_underpaint()

    # The generated reference contributes fabric and volume only. Its lower
    # trouser plane is remapped to the already approved short chibi geometry;
    # final alpha always comes from `geometry.json`.
    reference = Image.open(QUALITY_REFERENCE).convert("RGBA")
    reference_legs = reference.crop((412, 1168, 620, 1334)).resize(
        (224, 146), Image.Resampling.LANCZOS
    )
    reference_plane = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    reference_plane.paste(reference_legs, (400, 1170))
    leg_mask = Image.new("L", MASTER_CANVAS, 0)
    leg_mask.paste(mask.crop((0, 1170, 1024, 1316)), (0, 1170))
    aligned = Image.composite(reference_plane, aligned, leg_mask)

    # Neutral charcoal grade removes the former purple cast while retaining
    # all luminance detail from the painterly source.
    pixels = np.asarray(aligned).copy()
    opaque = pixels[..., 3] > 0
    source_rgb = pixels[..., :3].astype(np.float32)
    luma = source_rgb[..., 0] * 0.28 + source_rgb[..., 1] * 0.58 + source_rgb[..., 2] * 0.14
    graded = np.stack((luma * 0.99, luma, luma * 1.025), axis=-1)
    pixels[..., :3][opaque] = np.clip(graded[opaque], 0, 255).astype(np.uint8)
    aligned = Image.fromarray(pixels)

    # Clean chino construction details: compact waistband, restrained pockets,
    # short fly and a single soft hem seam. No center stripe or heavy cuff.
    finishing = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(finishing, "RGBA")
    draw.rectangle((400, 1144, 623, 1172), fill=(36, 36, 39, 64))
    draw.line((404, 1150, 619, 1150), fill=(94, 95, 99, 48), width=2)
    draw.line((404, 1171, 619, 1171), fill=(19, 20, 23, 72), width=2)
    draw.line((409, 1163, 438, 1192), fill=(20, 21, 24, 105), width=3)
    draw.line((615, 1163, 586, 1192), fill=(20, 21, 24, 105), width=3)
    draw.line((413, 1163, 440, 1190), fill=(96, 97, 101, 45), width=2)
    draw.line((611, 1163, 584, 1190), fill=(96, 97, 101, 45), width=2)
    draw.line((512, 1172, 512, 1203, 508, 1212), fill=(18, 19, 22, 82), width=2)
    draw.line((416, 1306, 504, 1306), fill=(18, 19, 22, 55), width=2)
    draw.line((520, 1306, 608, 1306), fill=(18, 19, 22, 55), width=2)
    draw.ellipse((503, 1149, 521, 1167), fill=(115, 78, 38, 255), outline=(38, 31, 27, 225), width=2)
    draw.ellipse((507, 1152, 517, 1162), fill=(183, 133, 66, 220))
    aligned = Image.alpha_composite(
        aligned,
        Image.composite(finishing, Image.new("RGBA", MASTER_CANVAS), mask),
    )
    aligned.putalpha(mask)

    pixels = np.asarray(aligned).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def downsample_preview(master: Image.Image) -> Image.Image:
    preview = master.resize(CANVAS, Image.Resampling.LANCZOS)
    smooth = np.asarray(_master_mask().resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    smooth[smooth < 8] = 0
    smooth[smooth > 247] = 255
    smooth[HEM_EXCLUSIVE_Y:, :] = 0
    preview.putalpha(Image.fromarray(smooth))
    pixels = np.asarray(preview).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(name: Path) -> Image.Image:
    return Image.open(name).convert("RGBA")


def composite_preview(preview: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (_load(BASE), _load(FACE), _load(SHOES), preview, _load(TOP), _load(HAIR)):
        result = Image.alpha_composite(result, layer)
    return result


def _checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    background = Image.new("RGBA", size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(background)
    colors = ((255, 253, 254, 255), (226, 222, 225, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return background


def render_quality_evidence(preview: Image.Image) -> None:
    """Write the same-state close-up and full-body evidence for user review."""

    before = Image.open(QUALITY_BEFORE_PREVIEW).convert("RGBA")
    crop = (88, 274, 168, 354)
    scale = 5
    tile_size = ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale)

    def zoom(layer: Image.Image, background: Image.Image) -> Image.Image:
        cut = layer.crop(crop).resize(tile_size, Image.Resampling.LANCZOS)
        result = background.copy()
        result.alpha_composite(cut)
        return result

    before_composite = composite_preview(before)
    after_composite = composite_preview(preview)
    panels = (
        ("BEFORE / CANONICAL BASE", zoom(before_composite, _checkerboard(tile_size))),
        ("QUALITY PASS / CHECKER", zoom(after_composite, _checkerboard(tile_size))),
        ("QUALITY PASS / BLACK", zoom(after_composite, Image.new("RGBA", tile_size, (0, 0, 0, 255)))),
    )
    header = 42
    sheet = Image.new("RGBA", (tile_size[0] * len(panels), tile_size[1] + header), (255, 248, 251, 255))
    sheet_draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        x = index * tile_size[0]
        sheet_draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        sheet.paste(panel, (x, header))
    sheet.save(OUTPUT / "step-5-quality-before-after-closeup.png")

    full_scale = 3
    full_size = (CANVAS[0] * full_scale, CANVAS[1] * full_scale)
    full_background = _checkerboard(full_size, cell=24)
    enlarged = after_composite.resize(full_size, Image.Resampling.LANCZOS)
    full_background.alpha_composite(enlarged)
    full_background.save(OUTPUT / "step-5-quality-after-fullbody.png")

    contact_crop = (96, 316, 160, 352)
    contact_scale = 8
    contact_size = (
        (contact_crop[2] - contact_crop[0]) * contact_scale,
        (contact_crop[3] - contact_crop[1]) * contact_scale,
    )

    def contact_panel(layer: Image.Image) -> Image.Image:
        composite = composite_preview(layer).crop(contact_crop).resize(
            contact_size,
            Image.Resampling.LANCZOS,
        )
        background = _checkerboard(contact_size, cell=16)
        background.alpha_composite(composite)
        return background

    before_contact = contact_panel(
        Image.open(SHOE_CONTACT_BEFORE_PREVIEW).convert("RGBA")
    )
    after_contact = contact_panel(preview)
    contact_header = 42
    contact_sheet = Image.new(
        "RGBA",
        (contact_size[0] * 2, contact_size[1] + contact_header),
        (255, 248, 251, 255),
    )
    contact_draw = ImageDraw.Draw(contact_sheet)
    contact_draw.text(
        (12, 14),
        "BEFORE / FLAT NO-CONTACT HEM",
        fill=(69, 43, 57, 255),
    )
    contact_draw.text(
        (contact_size[0] + 12, 14),
        "CURRENT / NARROW SHOE-AWARE BREAK",
        fill=(69, 43, 57, 255),
    )
    contact_sheet.paste(before_contact, (0, contact_header))
    contact_sheet.paste(after_contact, (contact_size[0], contact_header))
    contact_sheet.save(OUTPUT / "step-6-charcoal-shoe-contact-closeup.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    previous_preview = OUTPUT / "step-2-charcoal-tapered-chinos-preview-layer.png"
    if previous_preview.exists() and not SHOE_CONTACT_BEFORE_PREVIEW.exists():
        Image.open(previous_preview).convert("RGBA").save(
            SHOE_CONTACT_BEFORE_PREVIEW
        )
    master = build_master()
    preview = downsample_preview(master)
    master.save(OUTPUT / "step-2-charcoal-tapered-chinos-master-4x.png")
    preview.save(OUTPUT / "step-2-charcoal-tapered-chinos-preview-layer.png")
    composite_preview(preview).save(OUTPUT / "step-2-charcoal-tapered-chinos-composite.png")
    render_quality_evidence(preview)


if __name__ == "__main__":
    main()
