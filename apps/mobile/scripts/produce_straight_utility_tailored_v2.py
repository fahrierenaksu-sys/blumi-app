#!/usr/bin/env python3
"""Produce the straight utility-tailored static approval candidate.

This is a QA-only deterministic 4x re-illustration. It intentionally does not
write the runtime wardrobe asset or any motion/catalog derivative.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-27/straight-utility-tailored-v2"
)
GEOMETRY = OUTPUT / "geometry.json"
REFERENCE = (
    REPO
    / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/source-alpha/straight_utility_tailored_trousers.png"
)
PREMIUM_ART = OUTPUT / "step-0-utility-tailored-premium-alpha.png"
PREMIUM_ART_SHA256 = (
    "c6ac93f3a6f23014c78d2341ea8a663a54cd598a23e1b063bd95c30157a224ff"
)
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
SCALE = 4
CANVAS = (256, 384)
MASTER_CANVAS = (CANVAS[0] * SCALE, CANVAS[1] * SCALE)
HEM_EXCLUSIVE_Y = 337


def _load_navy_module():
    path = Path(__file__).with_name("produce_navy_straight_v2.py")
    spec = importlib.util.spec_from_file_location("_shared_navy_shoe_v2", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load shared premium shoe producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_NAVY = _load_navy_module()


def _geometry() -> dict:
    return json.loads(GEOMETRY.read_text())


def _verify_reference() -> None:
    expected = _geometry()["artDirectionReferenceSha256"]
    actual = hashlib.sha256(REFERENCE.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"utility-tailored reference drift: {actual}")


def _native_mask() -> Image.Image:
    geometry = _geometry()
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    for side, apex in (("leftLeg", (127, 286)), ("rightLeg", (128, 286))):
        leg = geometry[side]
        outer = [tuple(point) for point in leg["outerContour"]]
        inner = [tuple(point) for point in leg["innerContour"]]
        hem = [tuple(point) for point in leg["hemContour"]]
        draw.polygon([apex, *outer, *hem[1:], *reversed(inner)], fill=255)
    return mask


def _master_mask() -> Image.Image:
    geometry = _geometry()
    mask = Image.new("L", MASTER_CANVAS, 0)
    draw = ImageDraw.Draw(mask)

    def edge(points, x_offset: float = 0.0):
        return [
            (int(round((x + x_offset) * SCALE)), int(round(y * SCALE)))
            for x, y in points
        ]

    for side, apex, inner_offset in (
        ("leftLeg", (128 * SCALE - 1, 286 * SCALE), 1.0),
        ("rightLeg", (128 * SCALE, 286 * SCALE), 0.0),
    ):
        leg = geometry[side]
        outer = edge(leg["outerContour"])
        inner = edge(leg["innerContour"], inner_offset)
        hem = edge(leg["hemContour"])
        draw.polygon([apex, *outer, *hem[1:], *reversed(inner)], fill=255)
    return mask


def _technical_twill() -> Image.Image:
    """Normalize original premium art to the canonical 4x chibi garment box."""

    _verify_reference()
    actual = hashlib.sha256(PREMIUM_ART.read_bytes()).hexdigest()
    if actual != PREMIUM_ART_SHA256:
        raise ValueError(f"premium utility art drift: {actual}")
    source = Image.open(PREMIUM_ART).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("premium utility art is empty")
    cropped = source.crop(bbox)
    # Flatten onto the garment's own graphite field before resizing. Leaving
    # transparent source pixels unfilled creates black RGB fringes that become
    # opaque after the canonical leg mask is applied and read as torn fabric.
    flattened = Image.new("RGBA", cropped.size, (82, 79, 76, 255))
    flattened.alpha_composite(cropped)
    normalized = flattened.resize((240, 200), Image.Resampling.LANCZOS)
    field = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    field.alpha_composite(normalized, (392, 1138))
    pixels = np.asarray(field).copy()
    rgb = pixels[..., :3].astype(np.int16)
    alpha = pixels[..., 3]
    olive = (
        (rgb[..., 1] > rgb[..., 2] + 6)
        & (rgb[..., 1] >= rgb[..., 0] - 4)
        & (alpha > 16)
    )
    olive_luma = rgb[olive].mean(axis=1).astype(np.uint8)
    pixels[olive, 0] = olive_luma + 2
    pixels[olive, 1] = olive_luma
    pixels[olive, 2] = np.maximum(olive_luma - 2, 0)
    for y in range(1176, 1225):
        side_rgb = np.concatenate(
            (pixels[y, 480:496, :3], pixels[y, 528:544, :3]),
            axis=0,
        ).astype(np.float32)
        row_tone = np.clip(side_rgb.mean(axis=0) * 0.84, 58, 126).astype(np.uint8)
        pixels[y, 500:524, :3] = row_tone
        pixels[y, 500:524, 3] = 255
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _construction_details(mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    # Compact tailored waist and true front closure.
    draw.rounded_rectangle((397, 1144, 627, 1174), radius=5, fill=(50, 49, 49, 205))
    draw.line((400, 1149, 624, 1149), fill=(135, 132, 128, 96), width=2)
    draw.line((400, 1171, 624, 1171), fill=(27, 27, 29, 205), width=3)
    for x in (423, 482, 542, 601):
        draw.rounded_rectangle((x, 1143, x + 10, 1182), radius=3, fill=(60, 59, 58, 235))
        draw.line((x + 2, 1147, x + 8, 1147), fill=(145, 141, 135, 90), width=2)
    draw.ellipse((504, 1150, 520, 1166), fill=(55, 59, 57, 255), outline=(22, 23, 24, 255), width=2)
    draw.ellipse((509, 1155, 515, 1161), fill=(130, 128, 118, 190))
    draw.line((512, 1172, 512, 1212, 506, 1226), fill=(29, 29, 31, 215), width=3)

    # Slanted inset pockets and pressed tailored seams.
    for points in (
        ((401, 1165), (434, 1177), (453, 1198)),
        ((623, 1165), (590, 1177), (571, 1198)),
    ):
        draw.line(points, fill=(31, 31, 32, 215), width=5, joint="curve")
        draw.line(tuple((x, y - 2) for x, y in points), fill=(142, 138, 132, 85), width=2, joint="curve")

    # Low-profile olive utility pockets stay within the leg envelope.
    olive = (91, 99, 76, 245)
    olive_dark = (54, 61, 45, 235)
    olive_light = (146, 151, 117, 100)
    for box in ((404, 1216, 440, 1264), (584, 1216, 620, 1264)):
        draw.rounded_rectangle(box, radius=7, fill=olive, outline=olive_dark, width=3)
        flap = (box[0] - 2, box[1] - 3, box[2] + 2, box[1] + 22)
        draw.rounded_rectangle(flap, radius=6, fill=(101, 108, 82, 255), outline=olive_dark, width=3)
        draw.line((box[0] + 6, box[1] + 4, box[2] - 6, box[1] + 4), fill=olive_light, width=2)
        draw.line((box[0] + 5, box[1] + 29, box[0] + 5, box[3] - 7), fill=olive_light, width=2)

    folds = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    fold_draw = ImageDraw.Draw(folds, "RGBA")
    for x, direction in ((456, -1), (568, 1)):
        fold_draw.line((x, 1194, x + direction * 2, 1260, x, 1325), fill=(162, 158, 151, 70), width=3)
        fold_draw.line((x + 5, 1196, x + direction * 4, 1260, x + 4, 1325), fill=(26, 27, 29, 82), width=4)
    for points in (
        ((411, 1244), (435, 1237), (463, 1244)),
        ((613, 1244), (589, 1237), (561, 1244)),
        ((412, 1310), (438, 1304), (468, 1310)),
        ((612, 1310), (586, 1304), (556, 1310)),
    ):
        fold_draw.line(points, fill=(148, 145, 139, 42), width=5, joint="curve")
    layer = Image.alpha_composite(layer, folds.filter(ImageFilter.GaussianBlur(2.6)))

    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line((410, 1327, 498, 1329), fill=(28, 29, 31, 140), width=2)
    draw.line((526, 1329, 614, 1327), fill=(28, 29, 31, 140), width=2)
    draw.line((412, 1324, 496, 1326), fill=(142, 138, 132, 72), width=2)
    draw.line((528, 1326, 612, 1324), fill=(142, 138, 132, 72), width=2)
    return Image.composite(layer, Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)), mask)


def _utility_pocket_details(mask: Image.Image) -> Image.Image:
    """Add compact inset utility pockets after canonical silhouette fitting."""

    layer = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    left_body = ((412, 1211), (436, 1215), (435, 1249), (411, 1246))
    right_body = tuple((1024 - x, y) for x, y in left_body)
    for body in (left_body, right_body):
        draw.polygon(body, fill=(91, 99, 72, 152))
        draw.line((*body, body[0]), fill=(48, 55, 40, 185), width=2, joint="curve")
        upper_left = min(point[0] for point in body)
        upper_right = max(point[0] for point in body)
        draw.rounded_rectangle(
            (upper_left - 1, 1207, upper_right + 1, 1223),
            radius=4,
            fill=(105, 112, 83, 205),
            outline=(48, 55, 40, 190),
            width=2,
        )
        draw.line(
            (upper_left + 5, 1211, upper_right - 5, 1213),
            fill=(168, 171, 133, 105),
            width=2,
        )
    # Restore small-scale tailored construction after art normalization.
    draw.line((512, 1171, 512, 1207, 507, 1220), fill=(58, 57, 57, 205), width=3)
    draw.line((517, 1174, 517, 1204, 512, 1217), fill=(144, 138, 130, 92), width=2)
    for x in (456, 568):
        draw.line((x, 1210, x, 1321), fill=(35, 35, 35, 105), width=2)
        draw.line((x - 3, 1210, x - 3, 1321), fill=(157, 151, 143, 52), width=2)
    draw.line((410, 1343, 498, 1345), fill=(36, 35, 35, 125), width=2)
    draw.line((526, 1345, 614, 1343), fill=(36, 35, 35, 125), width=2)
    return Image.composite(
        layer,
        Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
        mask,
    )


def build_master() -> Image.Image:
    mask = _master_mask()
    fabric = Image.composite(_technical_twill(), Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)), mask)
    master = Image.alpha_composite(fabric, _utility_pocket_details(mask))
    rim = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(7)))
    master = Image.alpha_composite(
        master,
        Image.composite(
            Image.new("RGBA", MASTER_CANVAS, (32, 33, 35, 115)),
            Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0)),
            rim,
        ),
    )
    master.putalpha(mask)
    pixels = np.asarray(master).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def downsample_preview(master: Image.Image) -> Image.Image:
    preview = master.resize(CANVAS, Image.Resampling.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=0.65, percent=130, threshold=1)
    )
    alpha = np.asarray(_master_mask().resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    alpha[HEM_EXCLUSIVE_Y:, :] = 0
    preview.putalpha(Image.fromarray(alpha))
    pixels = np.asarray(preview).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def build_contact_shoes_master() -> Image.Image:
    source = _NAVY.build_contact_shoes_master()
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("shared premium shoe art is empty")
    cropped = source.crop(bbox).resize((48 * SCALE, 22 * SCALE), Image.Resampling.LANCZOS)
    master = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    master.alpha_composite(cropped, (104 * SCALE, 326 * SCALE))
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
    keep[326:348, 104:152] = True
    pixels[~keep] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _shoe_natural_foreground_mask(shoes: Image.Image) -> Image.Image:
    return shoes.getchannel("A").copy()


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def composite_preview(preview: Image.Image) -> Image.Image:
    shoes = downsample_contact_shoes(build_contact_shoes_master())
    shoe_foreground = shoes.copy()
    shoe_foreground.putalpha(_shoe_natural_foreground_mask(shoes))
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (_load(BASE), _load(FACE), shoes, preview, shoe_foreground, _load(TOP), _load(HAIR)):
        result = Image.alpha_composite(result, layer)
    return result


def _checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(result)
    colors = ((255, 253, 254, 255), (228, 224, 227, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=colors[(x // cell + y // cell) % 2])
    return result


def _zoom(image: Image.Image, crop: tuple[int, int, int, int], scale: int) -> Image.Image:
    return image.crop(crop).resize(((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale), Image.Resampling.LANCZOS)


def render_evidence(preview: Image.Image) -> None:
    composite = composite_preview(preview)
    full_size = (CANVAS[0] * 3, CANVAS[1] * 3)
    full = _checkerboard(full_size, 24)
    full.alpha_composite(composite.resize(full_size, Image.Resampling.LANCZOS))
    full.save(OUTPUT / "step-4-utility-tailored-fullbody.png")
    for name, crop in (
        ("waist", (90, 276, 166, 312)),
        ("pockets", (92, 296, 164, 330)),
        ("shoe", (92, 316, 164, 354)),
    ):
        zoom = _zoom(composite, crop, 7)
        background = _checkerboard(zoom.size, 14)
        background.alpha_composite(zoom)
        background.save(OUTPUT / f"step-4-utility-tailored-{name}-closeup.png")

    isolated = _zoom(preview, (88, 278, 168, 340), 6)
    combined = _zoom(composite, (88, 278, 168, 354), 6)
    tile_size = combined.size
    panels = []
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
    sheet = Image.new("RGBA", (tile_size[0] * 3, tile_size[1] + 40), (255, 248, 251, 255))
    sheet_draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        x = index * tile_size[0]
        sheet_draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        sheet.paste(panel, (x, 40))
    sheet.save(OUTPUT / "step-4-utility-tailored-three-background-proof.png")

    reference = _load(REFERENCE).resize((256, 384), Image.Resampling.LANCZOS)
    canonical = full.resize((256, 384), Image.Resampling.LANCZOS)
    approval = Image.new("RGBA", (512, 424), (255, 248, 251, 255))
    draw = ImageDraw.Draw(approval)
    draw.text((16, 14), "ART-DIRECTION REFERENCE", fill=(69, 43, 57, 255))
    draw.text((272, 14), "CANONICAL UTILITY FIT", fill=(69, 43, 57, 255))
    approval.paste(reference, (0, 40))
    approval.paste(canonical, (256, 40))
    approval.save(OUTPUT / "step-4-utility-tailored-approval-board.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = build_master()
    preview = downsample_preview(master)
    master.save(OUTPUT / "step-2-utility-tailored-master-4x.png")
    preview.save(OUTPUT / "step-2-utility-tailored-preview-layer.png")
    composite_preview(preview).save(OUTPUT / "step-3-utility-tailored-canonical-composite.png")
    render_evidence(preview)


if __name__ == "__main__":
    main()
