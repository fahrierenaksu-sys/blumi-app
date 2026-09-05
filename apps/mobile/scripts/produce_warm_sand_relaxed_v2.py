#!/usr/bin/env python3
"""Produce the static warm-sand relaxed-baggy male trouser approval pilot.

The generated art reference contributes only fabric volume and drape. Final
geometry, alpha, waist contact and shoe occlusion are rebuilt on the canonical
male rig before any runtime promotion.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT = REPO / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-27/warm-sand-relaxed-v2"
GEOMETRY = OUTPUT / "geometry.json"
REFERENCE = OUTPUT / "step-0-relaxed-baggy-art-reference.png"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
SCALE = 4
CANVAS = (256, 384)
MASTER_CANVAS = (CANVAS[0] * SCALE, CANVAS[1] * SCALE)
HEM_EXCLUSIVE_Y = 339


def _geometry() -> dict:
    return json.loads(GEOMETRY.read_text())


def _verify_reference() -> None:
    expected = _geometry()["artDirectionReferenceSha256"]
    actual = hashlib.sha256(REFERENCE.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"relaxed-baggy art reference drift: {actual}")


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
    draw.polygon([(127, 286), *left_outer, *left_hem[1:], *reversed(left_inner)], fill=255)
    draw.polygon([(128, 286), *right_outer, *right_hem[1:], *reversed(right_inner)], fill=255)
    return mask


def _master_mask() -> Image.Image:
    """Author both leg contours continuously at 4x, never from native stairs."""

    geometry = _geometry()
    anchors = geometry["anchors"]
    hem_bottom = anchors["hemExclusiveY"] * SCALE - 1
    waist_top = anchors["waistTopY"] * SCALE
    left_outer = [tuple(point) for point in geometry["leftLeg"]["outerContour"]]
    left_inner = [tuple(point) for point in geometry["leftLeg"]["innerContour"]]
    left_hem = [tuple(point) for point in geometry["leftLeg"]["hemContour"]]
    right_outer = [tuple(point) for point in geometry["rightLeg"]["outerContour"]]
    right_inner = [tuple(point) for point in geometry["rightLeg"]["innerContour"]]
    right_hem = [tuple(point) for point in geometry["rightLeg"]["hemContour"]]

    def edge(points: list[tuple[float, float]], offset: float = 0.0) -> list[tuple[int, int]]:
        return [
            (int(round((x + offset) * SCALE)), int(round(y * SCALE)))
            for x, y in points
        ]

    left_outer_edge = edge(left_outer)
    left_inner_edge = edge(left_inner, 1.0)
    left_hem_edge = edge(left_hem)
    right_outer_edge = edge(right_outer, 1.0)
    right_inner_edge = edge(right_inner)
    right_hem_edge = edge(right_hem)

    mask = Image.new("L", MASTER_CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [
            (128 * SCALE - 1, waist_top),
            *left_outer_edge,
            *left_hem_edge[1:-1],
            (int((left_inner[-1][0] + 1) * SCALE) - 1, hem_bottom),
            *reversed([(x - 1, y) for x, y in left_inner_edge]),
        ],
        fill=255,
    )
    draw.polygon(
        [
            (128 * SCALE, waist_top),
            *right_outer_edge,
            *right_hem_edge[1:-1],
            (int(right_inner[-1][0] * SCALE), hem_bottom),
            *reversed(right_inner_edge),
        ],
        fill=255,
    )
    return mask


def _warm_fabric_field() -> Image.Image:
    height, width = MASTER_CANVAS[1], MASTER_CANVAS[0]
    yy, xx = np.mgrid[0:height, 0:width]
    left_volume = np.exp(-((xx - 448) / 86) ** 2)
    right_volume = np.exp(-((xx - 576) / 86) ** 2)
    center_fold = np.exp(-((xx - 512) / 34) ** 2) * np.exp(-((yy - 1220) / 95) ** 2)
    knee_roll = np.exp(-((yy - 1262) / 36) ** 2) * (
        np.exp(-((xx - 448) / 66) ** 2) + np.exp(-((xx - 576) / 66) ** 2)
    )
    shade = 15 * (left_volume + right_volume) - 12 * center_fold - 8 * knee_roll
    shade += 2.0 * np.sin((yy + xx * 0.35) / 31)
    rng = np.random.default_rng(270727)
    grain = rng.normal(0, 1.2, (height, width))
    base = np.array([229, 190, 144], dtype=np.float32)
    rgb = np.clip(base + shade[..., None] + grain[..., None], 0, 255).astype(np.uint8)
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    return Image.fromarray(np.concatenate((rgb, alpha), axis=2)).filter(
        ImageFilter.GaussianBlur(0.38)
    )


def _reference_fabric_plane() -> Image.Image:
    """Remap the approved drape to the short canonical garment envelope."""

    _verify_reference()
    reference = Image.open(REFERENCE).convert("RGB")
    # Waistband through pre-shoe hem. The black background and the original
    # avatar are excluded by a validity mask; only luminance/fold language is
    # retained and re-graded to the warm-sand palette.
    crop = reference.crop((393, 858, 634, 1268)).resize(
        (256, 160), Image.Resampling.LANCZOS
    )
    source = np.asarray(crop).astype(np.float32)
    luma = source[..., 0] * 0.28 + source[..., 1] * 0.60 + source[..., 2] * 0.12
    delta = luma - 201.0
    graded = np.stack(
        (
            236.0 + delta * 0.74,
            195.0 + delta * 0.72,
            149.0 + delta * 0.68,
        ),
        axis=-1,
    )
    rgba = np.concatenate(
        (np.clip(graded, 0, 255).astype(np.uint8), np.full((*luma.shape, 1), 255, dtype=np.uint8)),
        axis=2,
    )
    plane = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    plane.paste(Image.fromarray(rgba), (384, 1144))

    valid = Image.fromarray(np.where(luma > 42, 255, 0).astype(np.uint8))
    valid = valid.filter(ImageFilter.GaussianBlur(2.2))
    validity = Image.new("L", MASTER_CANVAS, 0)
    validity.paste(valid, (384, 1144))
    return Image.composite(plane, _warm_fabric_field(), validity)


def _construction_details(mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    # Waistband follows the canonical tee contact line without a doubled edge.
    draw.rounded_rectangle((398, 1144, 625, 1174), radius=5, fill=(166, 127, 78, 58))
    draw.line((402, 1151, 621, 1151), fill=(245, 222, 174, 86), width=2)
    draw.line((402, 1172, 621, 1172), fill=(120, 86, 51, 92), width=3)
    for x in (430, 482, 540, 592):
        draw.rounded_rectangle((x, 1143, x + 13, 1177), radius=3, fill=(191, 151, 96, 128))
        draw.line((x + 3, 1147, x + 3, 1173), fill=(244, 217, 166, 88), width=2)

    draw.ellipse((503, 1148, 521, 1166), fill=(156, 104, 49, 255), outline=(103, 70, 42, 220), width=2)
    draw.ellipse((508, 1152, 516, 1160), fill=(230, 179, 94, 228))
    draw.line((512, 1172, 512, 1205, 506, 1218), fill=(130, 91, 56, 120), width=3)
    draw.line((516, 1175, 516, 1201), fill=(242, 214, 169, 72), width=2)

    # Restrained front pockets and long vertical drape preserve the reference's
    # tailored top while preventing the short canonical leg from reading as a
    # bunched short.
    draw.line((405, 1164, 448, 1203), fill=(128, 90, 55, 118), width=4)
    draw.line((619, 1164, 576, 1203), fill=(128, 90, 55, 118), width=4)
    draw.line((410, 1163, 451, 1199), fill=(243, 216, 170, 70), width=2)
    draw.line((614, 1163, 573, 1199), fill=(243, 216, 170, 70), width=2)

    folds = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    fold_draw = ImageDraw.Draw(folds, "RGBA")
    for points in (
        ((425, 1200), (435, 1240), (431, 1282), (438, 1332)),
        ((474, 1203), (462, 1244), (468, 1286), (458, 1334)),
        ((599, 1200), (589, 1240), (593, 1282), (586, 1332)),
        ((550, 1203), (562, 1244), (556, 1286), (566, 1334)),
    ):
        fold_draw.line(points, fill=(129, 92, 58, 54), width=7, joint="curve")
        fold_draw.line(
            tuple((x + 5, y) for x, y in points),
            fill=(251, 228, 186, 46),
            width=5,
            joint="curve",
        )
    folds = folds.filter(ImageFilter.GaussianBlur(6.2))
    layer = Image.alpha_composite(layer, folds)
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line((408, 1299, 432, 1298, 448, 1294, 472, 1294, 496, 1299), fill=(132, 94, 58, 68), width=3)
    draw.line((528, 1299, 552, 1294, 576, 1294, 592, 1298, 616, 1299), fill=(132, 94, 58, 68), width=3)
    draw.line((410, 1296, 433, 1295, 449, 1291, 471, 1291, 494, 1296), fill=(249, 224, 180, 42), width=2)
    draw.line((530, 1296, 553, 1291, 575, 1291, 591, 1295, 614, 1296), fill=(249, 224, 180, 42), width=2)
    return Image.composite(layer, Image.new("RGBA", MASTER_CANVAS), mask)


def build_master() -> Image.Image:
    mask = _master_mask()
    fabric = Image.composite(
        _reference_fabric_plane(), Image.new("RGBA", MASTER_CANVAS), mask
    )
    master = Image.alpha_composite(fabric, _construction_details(mask))

    eroded = mask.filter(ImageFilter.MinFilter(7))
    rim = ImageChops.subtract(mask, eroded)
    rim_layer = Image.new("RGBA", MASTER_CANVAS, (137, 99, 65, 82))
    master = Image.alpha_composite(
        master, Image.composite(rim_layer, Image.new("RGBA", MASTER_CANVAS), rim)
    )
    master.putalpha(mask)
    pixels = np.asarray(master).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def downsample_preview(master: Image.Image) -> Image.Image:
    preview = master.resize(CANVAS, Image.Resampling.LANCZOS)
    alpha = np.asarray(_master_mask().resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    alpha[HEM_EXCLUSIVE_Y:, :] = 0
    preview.putalpha(Image.fromarray(alpha))
    pixels = np.asarray(preview).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def composite_preview(preview: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    # One shoe-aware trouser contour falls around the upper; the shoe is never
    # re-rendered above it. This preserves a small real drape without the flat
    # stacked rectangle or pasted double-image effect rejected in review.
    for layer in (
        _load(BASE),
        _load(FACE),
        _load(SHOES),
        preview,
        _load(TOP),
        _load(HAIR),
    ):
        result = Image.alpha_composite(result, layer)
    return result


def _checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(result)
    colors = ((255, 253, 254, 255), (228, 224, 227, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return result


def _zoom(image: Image.Image, crop: tuple[int, int, int, int], scale: int) -> Image.Image:
    return image.crop(crop).resize(
        ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale),
        Image.Resampling.LANCZOS,
    )


def render_evidence(preview: Image.Image) -> None:
    composite = composite_preview(preview)
    full_size = (CANVAS[0] * 3, CANVAS[1] * 3)
    full = _checkerboard(full_size, 24)
    full.alpha_composite(composite.resize(full_size, Image.Resampling.LANCZOS))
    full.save(OUTPUT / "step-4-relaxed-baggy-fullbody.png")

    waist = _zoom(composite, (90, 276, 166, 312), 7)
    shoe = _zoom(composite, (92, 314, 164, 354), 7)
    waist_bg = _checkerboard(waist.size, 14)
    shoe_bg = _checkerboard(shoe.size, 14)
    waist_bg.alpha_composite(waist)
    shoe_bg.alpha_composite(shoe)
    waist_bg.save(OUTPUT / "step-4-relaxed-baggy-waist-closeup.png")
    shoe_bg.save(OUTPUT / "step-4-relaxed-baggy-shoe-closeup.png")

    isolated = _zoom(preview, (88, 278, 168, 342), 6)
    combined = _zoom(composite, (88, 278, 168, 354), 6)
    tile_size = combined.size
    panels: list[tuple[str, Image.Image]] = []
    for label, background in (
        ("LAYER / CHECKER", _checkerboard(isolated.size, 12)),
        ("LAYER / BLACK", Image.new("RGBA", isolated.size, (0, 0, 0, 255))),
    ):
        background.alpha_composite(isolated)
        padded = Image.new("RGBA", tile_size, (255, 248, 251, 255))
        padded.paste(background, (0, (tile_size[1] - isolated.size[1]) // 2))
        panels.append((label, padded))
    combo_bg = _checkerboard(tile_size, 12)
    combo_bg.alpha_composite(combined)
    panels.append(("CANONICAL COMBINATION", combo_bg))

    header = 40
    sheet = Image.new(
        "RGBA", (tile_size[0] * 3, tile_size[1] + header), (255, 248, 251, 255)
    )
    draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        x = index * tile_size[0]
        draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        sheet.paste(panel, (x, header))
    sheet.save(OUTPUT / "step-4-relaxed-baggy-three-background-proof.png")

    reference = Image.open(REFERENCE).convert("RGBA").resize((256, 384), Image.Resampling.LANCZOS)
    canonical = full.resize((256, 384), Image.Resampling.LANCZOS)
    approval = Image.new("RGBA", (512, 424), (255, 248, 251, 255))
    approval_draw = ImageDraw.Draw(approval)
    approval_draw.text((16, 14), "ART-DIRECTION REFERENCE", fill=(69, 43, 57, 255))
    approval_draw.text((272, 14), "CANONICAL MALE FIT PILOT", fill=(69, 43, 57, 255))
    approval.paste(reference, (0, 40))
    approval.paste(canonical, (256, 40))
    approval.save(OUTPUT / "step-4-relaxed-baggy-approval-board.png")

    # Match the user's rejection crop: reference contact on the left, current
    # canonical contact on the right at the same review scale.
    contact_size = (380, 220)
    reference_contact = Image.open(REFERENCE).convert("RGBA").crop(
        (370, 1165, 652, 1375)
    ).resize(contact_size, Image.Resampling.LANCZOS)
    current_contact = composite.crop((92, 308, 164, 352)).resize(
        contact_size, Image.Resampling.LANCZOS
    )
    current_background = _checkerboard(contact_size, 14)
    current_background.alpha_composite(current_contact)
    comparison = Image.new("RGBA", (contact_size[0] * 2, 260), (255, 248, 251, 255))
    comparison_draw = ImageDraw.Draw(comparison)
    comparison_draw.text((12, 14), "APPROVED CONTACT REFERENCE", fill=(69, 43, 57, 255))
    comparison_draw.text((392, 14), "CORRECTED CANONICAL CONTACT", fill=(69, 43, 57, 255))
    comparison.paste(reference_contact, (0, 40))
    comparison.paste(current_background, (380, 40))
    comparison.save(OUTPUT / "step-5-user-feedback-shoe-contact-comparison.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = build_master()
    preview = downsample_preview(master)
    master.save(OUTPUT / "step-2-warm-sand-relaxed-baggy-master-4x.png")
    preview.save(OUTPUT / "step-2-warm-sand-relaxed-baggy-preview-layer.png")
    composite_preview(preview).save(OUTPUT / "step-3-relaxed-baggy-canonical-composite.png")
    render_evidence(preview)


if __name__ == "__main__":
    main()
