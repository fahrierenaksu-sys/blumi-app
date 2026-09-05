#!/usr/bin/env python3
"""Produce the Mid Blue straight-jeans static approval candidate.

The generated full-avatar image is used only as denim art direction. Geometry,
alpha, waist contact and shoe contact are authored from the canonical male rig
at 4x and exported only to QA staging.
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
    / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-27/mid-blue-straight-v2"
)
GEOMETRY = OUTPUT / "geometry.json"
REFERENCE = OUTPUT / "step-0-mid-blue-straight-art-reference.png"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
SCALE = 4
CANVAS = (256, 384)
MASTER_CANVAS = (CANVAS[0] * SCALE, CANVAS[1] * SCALE)
HEM_EXCLUSIVE_Y = 340


def _geometry() -> dict:
    return json.loads(GEOMETRY.read_text())


def _verify_reference() -> None:
    expected = _geometry()["artDirectionReferenceSha256"]
    actual = hashlib.sha256(REFERENCE.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"mid-blue straight reference drift: {actual}")


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
    """Draw continuous straight-leg contours directly on the 4x canvas."""

    geometry = _geometry()
    anchors = geometry["anchors"]
    waist_top = anchors["waistTopY"] * SCALE
    hem_bottom = anchors["hemExclusiveY"] * SCALE - 1
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


def _denim_fabric_field() -> Image.Image:
    height, width = MASTER_CANVAS[1], MASTER_CANVAS[0]
    yy, xx = np.mgrid[0:height, 0:width]
    left_volume = np.exp(-((xx - 448) / 80) ** 2)
    right_volume = np.exp(-((xx - 576) / 80) ** 2)
    center_fold = np.exp(-((xx - 512) / 31) ** 2) * np.exp(
        -((yy - 1225) / 112) ** 2
    )
    knee_softening = np.exp(-((yy - 1273) / 34) ** 2) * (
        np.exp(-((xx - 450) / 60) ** 2)
        + np.exp(-((xx - 574) / 60) ** 2)
    )
    shade = (
        20 * (left_volume + right_volume)
        - 16 * center_fold
        - 8 * knee_softening
        + 2.6 * np.sin((yy + xx * 0.28) / 27)
    )
    rng = np.random.default_rng(270728)
    grain = rng.normal(0, 2.0, (height, width))
    base = np.array([43, 105, 168], dtype=np.float32)
    rgb = np.clip(base + shade[..., None] + grain[..., None], 0, 255).astype(
        np.uint8
    )
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    return Image.fromarray(np.concatenate((rgb, alpha), axis=2)).filter(
        ImageFilter.GaussianBlur(0.34)
    )


def _reference_fabric_plane() -> Image.Image:
    """Extract only luminance/fold language from the generated art reference."""

    _verify_reference()
    reference = Image.open(REFERENCE).convert("RGB")
    crop = reference.crop((392, 817, 635, 1285)).resize(
        (256, 216),
        Image.Resampling.LANCZOS,
    )
    source = np.asarray(crop).astype(np.float32)
    luma = (
        source[..., 0] * 0.24
        + source[..., 1] * 0.56
        + source[..., 2] * 0.20
    )
    delta = luma - 116.0
    graded = np.stack(
        (
            45.0 + delta * 0.52,
            108.0 + delta * 0.66,
            174.0 + delta * 0.78,
        ),
        axis=-1,
    )
    rgba = np.concatenate(
        (
            np.clip(graded, 0, 255).astype(np.uint8),
            np.full((*luma.shape, 1), 255, dtype=np.uint8),
        ),
        axis=2,
    )
    plane = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    plane.paste(Image.fromarray(rgba), (384, 1144))

    # Reject the black background and non-denim skin/shoe areas from the
    # generated reference. Any rejected pixel falls back to the authored blue
    # fabric field, never to a pasted full-avatar plane.
    blue_valid = (
        (source[..., 2] > source[..., 0] * 1.15)
        & (source[..., 2] > source[..., 1] * 1.05)
        & (luma > 36)
    )
    valid = Image.fromarray(np.where(blue_valid, 255, 0).astype(np.uint8))
    valid = valid.filter(ImageFilter.GaussianBlur(2.0))
    validity = Image.new("L", MASTER_CANVAS, 0)
    validity.paste(valid, (384, 1144))
    return Image.composite(plane, _denim_fabric_field(), validity)


def _construction_details(mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    # Compact waistband and belt loops remain under the canonical tee contact.
    draw.rounded_rectangle(
        (398, 1144, 625, 1175),
        radius=5,
        fill=(26, 73, 124, 126),
    )
    draw.line((402, 1150, 621, 1150), fill=(110, 169, 218, 95), width=2)
    draw.line((402, 1173, 621, 1173), fill=(15, 53, 96, 150), width=3)
    for x in (426, 481, 542, 597):
        draw.rounded_rectangle(
            (x, 1143, x + 13, 1178),
            radius=3,
            fill=(34, 90, 147, 190),
        )
        draw.line(
            (x + 3, 1147, x + 3, 1174),
            fill=(219, 154, 58, 170),
            width=2,
        )

    # Button, fly, pockets and restrained orange-gold denim topstitching.
    draw.ellipse(
        (503, 1149, 521, 1167),
        fill=(185, 126, 34, 255),
        outline=(78, 62, 39, 235),
        width=2,
    )
    draw.ellipse((507, 1152, 517, 1162), fill=(237, 188, 77, 235))
    draw.line(
        (512, 1172, 512, 1211, 506, 1224),
        fill=(14, 48, 87, 170),
        width=3,
    )
    draw.line(
        (517, 1176, 517, 1207, 511, 1222),
        fill=(224, 149, 48, 190),
        width=2,
    )
    for points in (
        ((405, 1163), (438, 1174), (459, 1201)),
        ((619, 1163), (586, 1174), (565, 1201)),
    ):
        draw.line(points, fill=(12, 49, 91, 160), width=5, joint="curve")
        draw.line(
            tuple((x, y - 2) for x, y in points),
            fill=(224, 149, 48, 175),
            width=2,
            joint="curve",
        )

    # Straight-leg volume: long restrained highlights and knee whiskers,
    # never alpha cuts or a hard black center stripe.
    folds = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    fold_draw = ImageDraw.Draw(folds, "RGBA")
    for points in (
        ((427, 1202), (438, 1240), (435, 1296), (442, 1351)),
        ((476, 1204), (464, 1245), (469, 1296), (462, 1352)),
        ((597, 1202), (586, 1240), (589, 1296), (582, 1351)),
        ((548, 1204), (560, 1245), (555, 1296), (562, 1352)),
    ):
        fold_draw.line(points, fill=(9, 43, 81, 66), width=8, joint="curve")
        fold_draw.line(
            tuple((x + 5, y) for x, y in points),
            fill=(132, 188, 229, 46),
            width=5,
            joint="curve",
        )
    for y in (1218, 1232, 1272):
        fold_draw.line(
            (418, y, 470, y + 8),
            fill=(147, 198, 232, 36),
            width=4,
        )
        fold_draw.line(
            (606, y, 554, y + 8),
            fill=(147, 198, 232, 36),
            width=4,
        )
    folds = folds.filter(ImageFilter.GaussianBlur(5.3))
    layer = Image.alpha_composite(layer, folds)

    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line(
        (412, 1357, 436, 1356, 458, 1354, 480, 1355, 498, 1359),
        fill=(17, 56, 98, 105),
        width=3,
    )
    draw.line(
        (526, 1359, 544, 1355, 566, 1354, 588, 1356, 612, 1357),
        fill=(17, 56, 98, 105),
        width=3,
    )
    draw.line(
        (414, 1354, 438, 1353, 458, 1351, 478, 1352, 496, 1356),
        fill=(224, 149, 48, 125),
        width=2,
    )
    draw.line(
        (528, 1356, 546, 1352, 566, 1351, 586, 1353, 610, 1354),
        fill=(224, 149, 48, 125),
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
        _reference_fabric_plane(),
        Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
        mask,
    )
    master = Image.alpha_composite(fabric, _construction_details(mask))
    eroded = mask.filter(ImageFilter.MinFilter(7))
    rim = ImageChops.subtract(mask, eroded)
    rim_layer = Image.new("RGBA", MASTER_CANVAS, (9, 39, 75, 105))
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


def composite_preview(preview: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
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
    full.save(OUTPUT / "step-4-mid-blue-straight-fullbody.png")

    for name, crop in (
        ("waist", (90, 276, 166, 312)),
        ("crotch", (96, 292, 160, 326)),
        ("shoe", (92, 316, 164, 354)),
    ):
        zoom = _zoom(composite, crop, 7)
        background = _checkerboard(zoom.size, 14)
        background.alpha_composite(zoom)
        background.save(OUTPUT / f"step-4-mid-blue-straight-{name}-closeup.png")

    isolated = _zoom(preview, (88, 278, 168, 336), 6)
    combined = _zoom(composite, (88, 278, 168, 354), 6)
    tile_size = combined.size
    panels: list[tuple[str, Image.Image]] = []
    for label, background in (
        ("LAYER / CHECKER", _checkerboard(isolated.size, 12)),
        ("LAYER / BLACK", Image.new("RGBA", isolated.size, (0, 0, 0, 255))),
    ):
        background.alpha_composite(isolated)
        padded = Image.new("RGBA", tile_size, (255, 248, 251, 255))
        padded.paste(
            background,
            (0, (tile_size[1] - isolated.size[1]) // 2),
        )
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
    sheet.save(OUTPUT / "step-4-mid-blue-straight-three-background-proof.png")

    reference = Image.open(REFERENCE).convert("RGBA").resize(
        (256, 384),
        Image.Resampling.LANCZOS,
    )
    canonical = full.resize((256, 384), Image.Resampling.LANCZOS)
    approval = Image.new("RGBA", (512, 424), (255, 248, 251, 255))
    approval_draw = ImageDraw.Draw(approval)
    approval_draw.text((16, 14), "ART-DIRECTION REFERENCE", fill=(69, 43, 57, 255))
    approval_draw.text((272, 14), "CANONICAL STRAIGHT FIT", fill=(69, 43, 57, 255))
    approval.paste(reference, (0, 40))
    approval.paste(canonical, (256, 40))
    approval.save(OUTPUT / "step-4-mid-blue-straight-approval-board.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = build_master()
    preview = downsample_preview(master)
    master.save(OUTPUT / "step-2-mid-blue-straight-master-4x.png")
    preview.save(OUTPUT / "step-2-mid-blue-straight-preview-layer.png")
    composite_preview(preview).save(
        OUTPUT / "step-3-mid-blue-straight-canonical-composite.png"
    )
    render_evidence(preview)


if __name__ == "__main__":
    main()
