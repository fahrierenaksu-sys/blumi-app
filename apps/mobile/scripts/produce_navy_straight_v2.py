#!/usr/bin/env python3
"""Produce the Navy straight-tailored static approval candidate.

The generated full-avatar image is art direction only. The final garment is
re-illustrated from deterministic 4x geometry and is written only to QA
staging; this producer never mutates a runtime wardrobe asset.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-27/navy-straight-v2"
)
GEOMETRY = OUTPUT / "geometry.json"
REFERENCE = OUTPUT / "step-0-navy-straight-contact-reference-v2.png"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
PREMIUM_SHOE_REFERENCE = OUTPUT / "step-0-milk-tea-court-premium-reference.png"
PREMIUM_SHOE_REFERENCE_SHA256 = (
    "083feccde567e2ef9febdfaf51772dff196abf8f4e45a9f98b9dd035e2f99312"
)
SCALE = 4
CANVAS = (256, 384)
MASTER_CANVAS = (CANVAS[0] * SCALE, CANVAS[1] * SCALE)
HEM_EXCLUSIVE_Y = 333


def _geometry() -> dict:
    return json.loads(GEOMETRY.read_text())


def _verify_reference() -> None:
    expected = _geometry()["artDirectionReferenceSha256"]
    actual = hashlib.sha256(REFERENCE.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"navy straight reference drift: {actual}")


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
    geometry = _geometry()
    waist_top = geometry["anchors"]["waistTopY"] * SCALE
    left_outer = [tuple(point) for point in geometry["leftLeg"]["outerContour"]]
    left_inner = [tuple(point) for point in geometry["leftLeg"]["innerContour"]]
    left_hem = [tuple(point) for point in geometry["leftLeg"]["hemContour"]]
    right_outer = [tuple(point) for point in geometry["rightLeg"]["outerContour"]]
    right_inner = [tuple(point) for point in geometry["rightLeg"]["innerContour"]]
    right_hem = [tuple(point) for point in geometry["rightLeg"]["hemContour"]]

    def edge(
        points: list[tuple[float, float]],
        offset: float = 0.0,
    ) -> list[tuple[int, int]]:
        return [
            (int(round((x + offset) * SCALE)), int(round(y * SCALE)))
            for x, y in points
        ]

    left_outer_edge = edge(left_outer)
    left_inner_edge = edge(left_inner, 1.0)
    left_hem_edge = edge(left_hem)
    right_outer_edge = edge(right_outer)
    right_inner_edge = edge(right_inner)
    right_hem_edge = edge(right_hem)

    mask = Image.new("L", MASTER_CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [
            (128 * SCALE - 1, waist_top),
            *left_outer_edge,
            *left_hem_edge[1:],
            *reversed(left_inner_edge),
        ],
        fill=255,
    )
    draw.polygon(
        [
            (128 * SCALE, waist_top),
            *right_outer_edge,
            *right_hem_edge[1:],
            *reversed(right_inner_edge),
        ],
        fill=255,
    )
    return mask


def _navy_wool_twill() -> Image.Image:
    """Author a deep tailored fabric field without transferring reference pixels."""

    _verify_reference()
    height, width = MASTER_CANVAS[1], MASTER_CANVAS[0]
    yy, xx = np.mgrid[0:height, 0:width]
    left_volume = np.exp(-((xx - 446) / 78) ** 2)
    right_volume = np.exp(-((xx - 578) / 78) ** 2)
    outer_shadow = (
        np.exp(-((xx - 402) / 24) ** 2)
        + np.exp(-((xx - 622) / 24) ** 2)
    )
    crease = (
        np.exp(-((xx - 456) / 8) ** 2)
        + np.exp(-((xx - 568) / 8) ** 2)
    ) * np.exp(-((yy - 1260) / 170) ** 2)
    knee = np.exp(-((yy - 1280) / 42) ** 2) * (
        np.exp(-((xx - 450) / 58) ** 2)
        + np.exp(-((xx - 574) / 58) ** 2)
    )
    diagonal_twill = (
        np.sin((xx + yy * 0.72) / 6.5) * 1.8
        + np.sin((xx - yy * 0.18) / 31.0) * 1.2
    )
    shade = (
        12.5 * (left_volume + right_volume)
        - 11.0 * outer_shadow
        + 8.0 * crease
        - 4.5 * knee
        + diagonal_twill
    )
    rng = np.random.default_rng(270729)
    grain = rng.normal(0, 1.25, (height, width))
    base = np.array([28, 36, 82], dtype=np.float32)
    channels = np.stack(
        (
            base[0] + shade * 0.64 + grain,
            base[1] + shade * 0.78 + grain,
            base[2] + shade * 1.08 + grain,
        ),
        axis=-1,
    )
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    rgba = np.concatenate(
        (np.clip(channels, 0, 255).astype(np.uint8), alpha),
        axis=2,
    )
    return Image.fromarray(rgba).filter(ImageFilter.GaussianBlur(0.28))


def _construction_details(mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    # Tailored waistband, tonal button, fly and slant pockets.
    draw.rounded_rectangle(
        (399, 1144, 625, 1174),
        radius=5,
        fill=(19, 25, 61, 185),
    )
    draw.line((402, 1149, 622, 1149), fill=(74, 88, 143, 95), width=2)
    draw.line((402, 1172, 622, 1172), fill=(9, 14, 38, 185), width=3)
    draw.ellipse(
        (504, 1150, 520, 1166),
        fill=(74, 66, 71, 255),
        outline=(17, 20, 39, 235),
        width=2,
    )
    draw.ellipse((508, 1154, 516, 1162), fill=(132, 112, 99, 220))
    draw.line(
        (512, 1171, 512, 1214, 507, 1226),
        fill=(8, 12, 34, 210),
        width=3,
    )
    draw.line(
        (517, 1175, 517, 1208, 512, 1222),
        fill=(91, 99, 143, 115),
        width=2,
    )
    for points in (
        ((405, 1163), (438, 1178), (458, 1202)),
        ((619, 1163), (586, 1178), (566, 1202)),
    ):
        draw.line(points, fill=(7, 11, 31, 205), width=5, joint="curve")
        draw.line(
            tuple((x, y - 2) for x, y in points),
            fill=(85, 98, 153, 110),
            width=2,
            joint="curve",
        )

    # Pressed creases and restrained trouser folds are painted, never alpha cuts.
    folds = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    fold_draw = ImageDraw.Draw(folds, "RGBA")
    fold_draw.line(
        (454, 1196, 452, 1262, 455, 1308, 453, 1324),
        fill=(109, 125, 178, 72),
        width=3,
    )
    fold_draw.line(
        (459, 1198, 456, 1262, 459, 1308, 457, 1324),
        fill=(4, 8, 26, 78),
        width=5,
    )
    fold_draw.line(
        (570, 1196, 572, 1262, 568, 1308, 570, 1323),
        fill=(109, 125, 178, 66),
        width=3,
    )
    fold_draw.line(
        (575, 1198, 577, 1262, 573, 1308, 575, 1323),
        fill=(4, 8, 26, 74),
        width=5,
    )
    for points in (
        ((414, 1218), (438, 1226), (468, 1222)),
        ((610, 1218), (586, 1226), (556, 1222)),
        ((418, 1305), (442, 1298), (470, 1304)),
        ((606, 1305), (582, 1298), (554, 1304)),
    ):
        fold_draw.line(points, fill=(97, 115, 171, 54), width=5, joint="curve")
    folds = folds.filter(ImageFilter.GaussianBlur(3.0))
    layer = Image.alpha_composite(layer, folds)

    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line(
        (412, 1329, 434, 1328, 456, 1329, 478, 1328, 498, 1330),
        fill=(3, 7, 24, 125),
        width=2,
    )
    draw.line(
        (526, 1330, 546, 1328, 568, 1329, 590, 1328, 612, 1329),
        fill=(3, 7, 24, 125),
        width=2,
    )
    draw.line(
        (414, 1326, 438, 1325, 458, 1326, 478, 1325, 496, 1327),
        fill=(99, 114, 168, 82),
        width=2,
    )
    draw.line(
        (528, 1327, 546, 1325, 566, 1326, 586, 1325, 610, 1326),
        fill=(99, 114, 168, 82),
        width=2,
    )
    return Image.composite(
        layer,
        Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
        mask,
    )


def build_master() -> Image.Image:
    mask = _master_mask()
    fabric = Image.composite(
        _navy_wool_twill(),
        Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
        mask,
    )
    master = Image.alpha_composite(fabric, _construction_details(mask))
    eroded = mask.filter(ImageFilter.MinFilter(7))
    rim = ImageChops.subtract(mask, eroded)
    rim_layer = Image.new("RGBA", MASTER_CANVAS, (4, 8, 26, 125))
    master = Image.alpha_composite(
        master,
        Image.composite(
            rim_layer,
            Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
            rim,
        ),
    )
    master.putalpha(mask)
    pixels = np.asarray(master).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def downsample_preview(master: Image.Image) -> Image.Image:
    preview = master.resize(CANVAS, Image.Resampling.LANCZOS)
    alpha = np.asarray(
        _master_mask().resize(CANVAS, Image.Resampling.LANCZOS)
    ).copy()
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    alpha[HEM_EXCLUSIVE_Y:, :] = 0
    preview.putalpha(Image.fromarray(alpha))
    pixels = np.asarray(preview).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def build_contact_shoes_master() -> Image.Image:
    """Normalize original premium shoe art to the canonical 4x rig anchors."""

    actual = hashlib.sha256(PREMIUM_SHOE_REFERENCE.read_bytes()).hexdigest()
    if actual != PREMIUM_SHOE_REFERENCE_SHA256:
        raise ValueError(f"premium shoe reference drift: {actual}")

    source = np.asarray(Image.open(PREMIUM_SHOE_REFERENCE).convert("RGB"))
    red = source[..., 0].astype(np.float32)
    green = source[..., 1].astype(np.float32)
    blue = source[..., 2].astype(np.float32)
    warm_chroma = np.minimum(red - green, green - blue)
    alpha = np.clip((warm_chroma - 1.5) * 42.0, 0, 255).astype(np.uint8)
    alpha[(red - blue) < 7.0] = 0
    alpha_image = Image.fromarray(alpha).filter(ImageFilter.MaxFilter(3))
    alpha_image = alpha_image.filter(ImageFilter.GaussianBlur(0.55))
    alpha = np.asarray(alpha_image)
    ys, xs = np.nonzero(alpha > 8)
    if len(xs) == 0:
        raise ValueError("premium shoe reference segmentation is empty")
    crop_box = (int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1))
    luma = (
        source[..., 0].astype(np.float32) * 0.30
        + source[..., 1].astype(np.float32) * 0.59
        + source[..., 2].astype(np.float32) * 0.11
    )
    tone = np.clip((luma - 190.0) / 65.0, 0.0, 1.0)
    graded = np.stack(
        (
            135.0 + tone * 117.0,
            95.0 + tone * 139.0,
            65.0 + tone * 153.0,
        ),
        axis=-1,
    )
    extracted = Image.fromarray(
        np.dstack((np.clip(graded, 0, 255).astype(np.uint8), alpha))
    ).crop(crop_box)
    normalized = extracted.resize((52 * SCALE, 27 * SCALE), Image.Resampling.LANCZOS)

    master = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    master.alpha_composite(normalized, (102 * SCALE, 322 * SCALE))
    pixels = np.asarray(master).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def downsample_contact_shoes(master: Image.Image) -> Image.Image:
    shoes = master.resize(CANVAS, Image.Resampling.LANCZOS)
    pixels = np.asarray(shoes).copy()
    alpha = pixels[..., 3]
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    pixels[..., 3] = alpha
    keep = np.zeros(CANVAS[::-1], dtype=bool)
    keep[322:349, 102:154] = True
    pixels[~keep] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _shoe_natural_foreground_mask(shoes: Image.Image) -> Image.Image:
    """Use the shoe's own silhouette as the only pant/shoe depth boundary.

    A hand-authored center patch made the straight hems read as two severed
    blocks. The native upper already contains the correct tongue, collar and
    toe contour, so the entire opaque shoe belongs in front of the hem.
    """

    return shoes.getchannel("A").copy()


def _shoe_natural_foreground(shoes: Image.Image) -> Image.Image:
    foreground = shoes.copy()
    foreground.putalpha(_shoe_natural_foreground_mask(shoes))
    return foreground


def composite_preview(preview: Image.Image) -> Image.Image:
    shoes = downsample_contact_shoes(build_contact_shoes_master())
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BASE),
        _load(FACE),
        shoes,
        preview,
        _shoe_natural_foreground(shoes),
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


def _zoom(
    image: Image.Image,
    crop: tuple[int, int, int, int],
    scale: int,
) -> Image.Image:
    return image.crop(crop).resize(
        ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale),
        Image.Resampling.LANCZOS,
    )


def render_evidence(preview: Image.Image) -> None:
    composite = composite_preview(preview)
    full_size = (CANVAS[0] * 3, CANVAS[1] * 3)
    full = _checkerboard(full_size, 24)
    full.alpha_composite(composite.resize(full_size, Image.Resampling.LANCZOS))
    full.save(OUTPUT / "step-4-navy-straight-fullbody.png")

    for name, crop in (
        ("waist", (90, 276, 166, 312)),
        ("crotch", (96, 292, 160, 326)),
        ("shoe", (92, 316, 164, 354)),
    ):
        zoom = _zoom(composite, crop, 7)
        background = _checkerboard(zoom.size, 14)
        background.alpha_composite(zoom)
        background.save(OUTPUT / f"step-4-navy-straight-{name}-closeup.png")

    isolated = _zoom(preview, (88, 278, 168, 340), 6)
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
        "RGBA",
        (tile_size[0] * 3, tile_size[1] + header),
        (255, 248, 251, 255),
    )
    sheet_draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        x = index * tile_size[0]
        sheet_draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        sheet.paste(panel, (x, header))
    sheet.save(OUTPUT / "step-4-navy-straight-three-background-proof.png")

    reference = Image.open(REFERENCE).convert("RGBA").resize(
        (256, 384),
        Image.Resampling.LANCZOS,
    )
    canonical = full.resize((256, 384), Image.Resampling.LANCZOS)
    approval = Image.new("RGBA", (512, 424), (255, 248, 251, 255))
    approval_draw = ImageDraw.Draw(approval)
    approval_draw.text((16, 14), "ART-DIRECTION REFERENCE", fill=(69, 43, 57, 255))
    approval_draw.text((272, 14), "CANONICAL NAVY FIT", fill=(69, 43, 57, 255))
    approval.paste(reference, (0, 40))
    approval.paste(canonical, (256, 40))
    approval.save(OUTPUT / "step-4-navy-straight-approval-board.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = build_master()
    preview = downsample_preview(master)
    shoe_master = build_contact_shoes_master()
    shoe_preview = downsample_contact_shoes(shoe_master)
    master.save(OUTPUT / "step-2-navy-straight-master-4x.png")
    preview.save(OUTPUT / "step-2-navy-straight-preview-layer.png")
    shoe_master.save(OUTPUT / "step-2-milk-tea-court-contact-master-4x.png")
    shoe_preview.save(OUTPUT / "step-2-milk-tea-court-contact-preview.png")
    composite_preview(preview).save(
        OUTPUT / "step-3-navy-straight-canonical-composite.png"
    )
    render_evidence(preview)


if __name__ == "__main__":
    main()
