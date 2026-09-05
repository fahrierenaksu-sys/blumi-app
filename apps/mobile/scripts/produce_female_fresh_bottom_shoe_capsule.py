#!/usr/bin/env python3
"""Produce a source-traceable female bottom and shoe capsule on the Blumi rig.

Each source render is generated separately and retained under ``render-sources``.
This script only chroma-keys those source renders, fits them once into the
canonical female front-view envelopes, and uses pose-specific envelopes for
4W+1S.  It never copies an existing wardrobe item or paints base/body pixels.

Workflow:
  1. ``--phase static`` produces isolated static candidates + full body proof.
  2. An independent reviewer opens ``static-fit-contact-sheet.png``.
  3. ``--phase motion`` is run only after that review and writes runtime assets,
     profile layers, thumbnails and 4W+1S evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
PROFILE = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMBNAILS = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/female-fresh-bottom-shoe-capsule/2026-07-16"
SOURCES = ROOT / "docs/avatar-motion-pipeline/render-sources/female-fresh-bottom-shoe-capsule/2026-07-16"
CANVAS = (256, 384)
RIG_ID = "blumi_2_5d_layered_v1"
FIT_PROFILE_ID = "blumi_female_room_avatar_v1"
STATES = (
    "static",
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class CapsuleItem:
    category: str
    slug: str
    label: str
    role: str
    price: int
    key: str


ITEMS = (
    CapsuleItem("bottom", "midnight_ribbon_wide_leg_pants", "Midnight Ribbon Wide-Leg Pants", "trouser", 460, "green"),
    CapsuleItem("bottom", "buttercream_pearl_tailored_pants", "Buttercream Pearl Tailored Pants", "trouser", 440, "green"),
    CapsuleItem("bottom", "rose_picnic_pleated_shorts", "Rose Picnic Pleated Shorts", "short", 360, "green"),
    CapsuleItem("bottom", "lavender_bow_twill_shorts", "Lavender Bow Twill Shorts", "short", 340, "green"),
    CapsuleItem("shoes", "rose_satin_bow_heels", "Rose Satin Bow Heels", "heel", 520, "green"),
    CapsuleItem("shoes", "ivory_pearl_slingback_heels", "Ivory Pearl Slingback Heels", "heel", 500, "green"),
    CapsuleItem("shoes", "lilac_star_platform_sneakers", "Lilac Star Platform Sneakers", "sneaker", 480, "green"),
    CapsuleItem("shoes", "mint_ribbon_court_sneakers", "Mint Ribbon Court Sneakers", "sneaker", 450, "magenta"),
)

MOTION_OFFSETS = {
    "static": ((0, 0), (0, 0)),
    "walking_front_f01": ((0, 0), (0, 0)),
    "walking_front_f02": ((-6, -1), (5, 1)),
    "walking_front_f03": ((-2, -1), (2, -1)),
    "walking_front_f04": ((-4, 1), (7, -1)),
    "sitting_front_f01": ((-2, 11), (2, 11)),
}


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def source_path(item: CapsuleItem) -> Path:
    return SOURCES / f"{item.slug}-chroma.png"


def runtime_path(item: CapsuleItem, state: str) -> Path:
    if state == "static":
        return ROOM / f"avatar_room_{item.category}_female_{item.slug}_v2.png"
    return MOTION / f"room_avatar_{item.category}_female_{item.slug}_v2_{state}.png"


def candidate_path(item: CapsuleItem, state: str) -> Path:
    return EVIDENCE / "candidate-layers" / item.category / item.slug / f"{state}.png"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_transparent_pixels(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    result.putdata([
        (0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha)
        for red, green, blue, alpha in result.getdata()
    ])
    return result


def chroma_key(source: Image.Image, key: str) -> Image.Image:
    """Turn the declared flat source background into a soft clean alpha matte."""
    result = source.convert("RGBA")
    pixels = []
    for red, green, blue, _ in result.getdata():
        if key == "green":
            distance = ((red - 0) ** 2 + (green - 255) ** 2 + (blue - 0) ** 2) ** 0.5
            # Image generation can compress an ostensibly flat key into a
            # narrow green range.  Reject that range decisively before the
            # garment crop is measured so key haze can never consume a leg.
            alpha = round(max(0, min(1, (distance - 52) / 118)) * 255)
            if alpha:
                green = min(green, max(red, blue) + 12)
        else:
            distance = ((red - 255) ** 2 + (green - 0) ** 2 + (blue - 255) ** 2) ** 0.5
            alpha = round(max(0, min(1, (distance - 52) / 118)) * 255)
            if alpha:
                red = min(red, green + 196)
                blue = min(blue, green + 196)
        pixels.append((red, green, blue, alpha) if alpha else (0, 0, 0, 0))
    result.putdata(pixels)
    return clean_transparent_pixels(result)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 72 else 0).getbbox()
    if bbox is None:
        raise ValueError("source has no visible foreground after chroma key")
    return bbox


@lru_cache(maxsize=None)
def source_alpha(item: CapsuleItem) -> Image.Image:
    source = source_path(item)
    if not source.exists():
        raise FileNotFoundError(f"missing generated source: {source}")
    keyed = chroma_key(Image.open(source), item.key)
    cleaned_path = EVIDENCE / "source-alpha" / f"{item.slug}.png"
    save(keyed, cleaned_path)
    return keyed.crop(alpha_bbox(keyed))


def resize_to_box(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    width, height = box[2] - box[0], box[3] - box[1]
    canvas.alpha_composite(image.resize((width, height), Image.Resampling.LANCZOS), box[:2])
    return clean_transparent_pixels(canvas)


def mask_from_polygons(polygons: Iterable[Iterable[tuple[float, float]]]) -> Image.Image:
    scale = 4
    mask = Image.new("L", (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon([(round(x * scale), round(y * scale)) for x, y in polygon], fill=255)
    return mask.resize(CANVAS, Image.Resampling.LANCZOS)


def bottom_mask(role: str, state: str) -> Image.Image:
    if state == "sitting_front_f01":
        if role == "trouser":
            return mask_from_polygons(([
                (97, 281), (159, 281), (160, 298), (172, 313), (176, 332),
                # The short front-view rig exposes the lower shoe silhouette
                # even when a trouser covers the upper.  Stop the hem above
                # that toe corridor; a long, opaque leg here makes the shoe
                # disappear when this layer sits above it.
                (166, 333), (144, 335), (130, 335), (126, 335), (112, 335),
                (90, 333), (80, 332), (84, 313), (96, 298),
            ],))
        return mask_from_polygons(([
            (97, 281), (159, 281), (162, 298), (174, 311), (173, 323),
            (154, 328), (133, 324), (128, 322), (123, 324), (102, 328),
            (83, 323), (82, 311), (94, 298),
        ],))

    left_offset, right_offset = MOTION_OFFSETS[state]
    left_dx, left_dy = left_offset
    right_dx, right_dy = right_offset
    waist = [
        (97, 282), (106, 281), (118, 280.5), (128, 281),
        (138, 280.5), (150, 281), (159, 282), (158, 293), (98, 293),
    ]
    if role == "trouser":
        # Trousers are one body-wrapping garment, not two independently
        # clipped stickers.  Keep a continuous inner thigh/crotch envelope
        # through the entire stride so the canonical base never leaks between
        # the two generated halves.  Outer edges still follow the walk sway.
        inner_hem_y = 337 if state in {"static", "walking_front_f01"} else 335
        trousers = [
            (97, 282), (159, 282),
            (162 + right_dx, 306 + right_dy),
            (160 + right_dx, 330 + right_dy),
            # Keep both hems just above the shoe-toe corridor.  This is a
            # deliberate front-view fit envelope: trousers cover the shoe
            # upper but never erase the matching toe silhouette while walking.
            (156 + right_dx, 333 + right_dy),
            # The standing and planted-walk heel envelopes are open at their
            # medial uppers. A gentle two-pixel inner drape keeps the same
            # trouser fabric over that upper without touching the toe corridor
            # or changing any crossed/sitting pose.
            (128, inner_hem_y),
            (126, inner_hem_y),
            (100 + left_dx, 333 + left_dy),
            (94 + left_dx, 330 + left_dy),
            (94 + left_dx, 306 + left_dy),
        ]
        return mask_from_polygons((waist, trousers))
    else:
        left = [
            (98 + left_dx, 289 + left_dy), (127 + left_dx, 289 + left_dy),
            (124 + left_dx, 314 + left_dy), (104 + left_dx, 314 + left_dy),
            (95 + left_dx, 304 + left_dy),
        ]
        right = [
            (129 + right_dx, 289 + right_dy), (158 + right_dx, 289 + right_dy),
            (161 + right_dx, 304 + right_dy), (152 + right_dx, 314 + right_dy),
            (132 + right_dx, 314 + right_dy),
        ]
    return mask_from_polygons((waist, left, right))


def fitted_bottom(item: CapsuleItem, state: str) -> Image.Image:
    source = source_alpha(item)
    if item.role == "trouser":
        # The generated trouser art is authored as a complete pair.  On the
        # short female rig, laying that whole tall source into one compressed
        # rectangle can starve one leg of source coverage.  Keep the existing
        # left/right authored halves intact and solve their fit directly
        # against the two canonical leg corridors before joining at the waist.
        midpoint = source.width // 2
        left_source = source.crop((0, 0, midpoint + 8, source.height))
        right_source = source.crop((midpoint - 8, 0, source.width, source.height))
        left_source = left_source.crop(alpha_bbox(left_source))
        right_source = right_source.crop(alpha_bbox(right_source))
        left_target = (42, 56)
        right_target = (60, 56)
        if state == "sitting_front_f01":
            # The sitting base opens the two bare-foot envelopes farther than
            # a standing pose. Extend only the authored trouser legs into the
            # existing cuff corridor, so every shoe upper is covered without
            # moving the canonical shoe anchors or hiding a toe/sole.
            left_target = (42, 64)
            right_target = (61, 64)
        fitted = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        fitted.alpha_composite(
            left_source.resize(left_target, Image.Resampling.LANCZOS),
            (88, 280),
        )
        fitted.alpha_composite(
            right_source.resize(right_target, Image.Resampling.LANCZOS),
            # A deliberate inner overlap preserves a fabric seam without
            # revealing the moving base leg or default shoe through the
            # trouser pair. The shared front-view rig is narrow at the inner
            # thigh; a literal side-by-side split creates a false hole there.
            (110, 280),
        )
    else:
        target = (90, 280, 166, 329)
        fitted = resize_to_box(source, target)
    mask = bottom_mask(item.role, state)
    fitted.putalpha(ImageChops.multiply(fitted.getchannel("A"), mask))
    return clean_transparent_pixels(fitted)


def shoe_targets(state: str) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    # Measured anchors from the canonical female shoe layer, not generic
    # additive offsets. W2–W4 cross the two feet, so preserving two separate
    # standing columns creates a floating duplicate pair in front of the
    # moving body. These pairs describe the real front-view foot envelopes in
    # their paint order; every generated shoe is fitted to the same anchors.
    targets = {
        "static": ((99, 319, 128, 348), (132, 319, 157, 348)),
        # W1 is the planted contact pose. Keep the pair one crisp pixel wider
        # and two pixels taller than the compressed reference matte so delicate
        # heel straps remain a meaningful grounded component rather than tiny
        # disconnected marks.
        # W1 right foot begins two pixels higher so it meets the trouser hem
        # at the real planted ankle contact, rather than leaving a white seam
        # between independently authored bottom and shoe layers.
        "walking_front_f01": ((97, 320, 129, 348), (132, 318, 159, 348)),
        "walking_front_f02": ((103, 313, 129, 338), (122, 322, 148, 348)),
        "walking_front_f03": ((102, 322, 130, 348), (128, 313, 150, 338)),
        "walking_front_f04": ((106, 322, 132, 348), (125, 313, 152, 338)),
        "sitting_front_f01": ((93, 322, 128, 346), (133, 322, 164, 346)),
    }
    return targets[state]


def fitted_shoes(item: CapsuleItem, state: str) -> Image.Image:
    source = source_alpha(item)
    midpoint = source.width // 2
    halves = (source.crop((0, 0, midpoint, source.height)), source.crop((midpoint, 0, source.width, source.height)))
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for part, target in zip(halves, shoe_targets(state)):
        # Each generated shoe is independently placed on its matching foot;
        # the source pair remains traceable in render-sources.
        crop = part.crop(alpha_bbox(part))
        width, height = target[2] - target[0], target[3] - target[1]
        canvas.alpha_composite(crop.resize((width, height), Image.Resampling.LANCZOS), target[:2])
    return clean_transparent_pixels(canvas)


def component_count(image: Image.Image, threshold: int = 16) -> int:
    width, height = image.size
    visible = {index for index, alpha in enumerate(image.getchannel("A").getdata()) if alpha > threshold}
    count = 0
    while visible:
        count += 1
        stack = [visible.pop()]
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in visible:
                    visible.remove(neighbor)
                    stack.append(neighbor)
    return count


def residue(image: Image.Image) -> int:
    return sum(1 for red, green, blue, alpha in image.getdata() if alpha == 0 and (red or green or blue))


def layer_path(filename: str, state: str) -> Path:
    if state == "static":
        return ROOM / filename
    stem = Path(filename).stem.replace("avatar_room_", "room_avatar_", 1)
    return MOTION / f"{stem}_{state}.png"


def load_layer(filename: str, state: str) -> Image.Image:
    return Image.open(layer_path(filename, state)).convert("RGBA")


def compose(item: CapsuleItem, state: str, layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for filename in (
        "avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png",
        "avatar_room_base_female_v2.png",
        "avatar_room_face_female_soft_doll_foundation_v2.png",
        "avatar_room_eyes_female_mocha_doe_v2.png",
        "avatar_room_nose_female_soft_button_v2.png",
        "avatar_room_mouth_female_peach_whisper_smile_v2.png",
    ):
        result.alpha_composite(load_layer(filename, state))
    if item.category == "bottom":
        shoes = load_layer("avatar_room_shoes_female_milk_tea_court_sneakers_v2.png", state)
        if item.role == "trouser":
            result.alpha_composite(shoes)
            result.alpha_composite(layer)
        else:
            result.alpha_composite(layer)
            result.alpha_composite(shoes)
    else:
        result.alpha_composite(load_layer("avatar_room_bottom_female_denim_skort_shorts_v2.png", state))
        result.alpha_composite(layer)
    result.alpha_composite(load_layer("avatar_room_top_female_cream_basic_tee_v2.png", state))
    result.alpha_composite(load_layer("avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png", state))
    return clean_transparent_pixels(result)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clean_transparent_pixels(image).save(path, optimize=True)


def static_composite_path(item: CapsuleItem) -> Path:
    return EVIDENCE / "static-composites" / item.category / f"{item.slug}.png"


def render_static_contact_sheet(records: list[dict[str, object]]) -> Path:
    tile_w, tile_h = 320, 500
    sheet = Image.new("RGBA", (tile_w * 4, 76 + tile_h * 2), "#fbf2f8")
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 22), "Fresh female capsule · static body-fit gate", fill="#453443", font=font(26, True))
    for index, record in enumerate(records):
        item = record["item"]
        column, row = index % 4, index // 4
        x, y = column * tile_w, 76 + row * tile_h
        draw.rounded_rectangle((x + 12, y + 10, x + tile_w - 12, y + tile_h - 10), radius=24, fill="#fffafd", outline="#ead5e3", width=2)
        avatar = Image.open(ROOT / record["staticCompositePath"]).convert("RGBA")
        preview = avatar.resize((250, 375), Image.Resampling.LANCZOS)
        sheet.alpha_composite(preview, (x + 35, y + 50))
        draw.text((x + 24, y + 22), item["label"], fill="#503c4e", font=font(15, True))
        draw.text((x + 24, y + 420), f"{item['role']} · {item['price']} Blumi coins", fill="#8d7084", font=font(13))
    path = EVIDENCE / "static-fit-contact-sheet.png"
    save(sheet, path)
    return path


def render_closeups(records: list[dict[str, object]], state: str = "static") -> Path:
    tile_w, tile_h = 260, 208
    sheet = Image.new("RGBA", (tile_w * 4, 62 + tile_h * 2), "#fbf2f8")
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 18), "Static close-up · waist / crotch / hem / shoe upper", fill="#453443", font=font(19, True))
    for index, record in enumerate(records):
        item = record["item"]
        column, row = index % 4, index // 4
        x, y = column * tile_w, 62 + row * tile_h
        avatar = Image.open(ROOT / record["staticCompositePath"]).convert("RGBA")
        crop = avatar.crop((78, 266, 178, 352)).resize((232, 198), Image.Resampling.NEAREST)
        sheet.alpha_composite(crop, (x + 14, y + 28))
        draw.text((x + 14, y + 8), item["label"], fill="#594454", font=font(12, True))
    path = EVIDENCE / "static-closeups.png"
    save(sheet, path)
    return path


def static_phase() -> dict[str, object]:
    records: list[dict[str, object]] = []
    for item in ITEMS:
        layer = fitted_bottom(item, "static") if item.category == "bottom" else fitted_shoes(item, "static")
        static_layer = candidate_path(item, "static")
        save(layer, static_layer)
        composite = compose(item, "static", layer)
        composite_path = static_composite_path(item)
        save(composite, composite_path)
        actual_components = component_count(layer)
        expected_components = 2 if item.category == "shoes" else 1
        record = {
            "item": asdict(item),
            "category": item.category,
            "slug": item.slug,
            "role": item.role,
            "price": item.price,
            "canvas": list(CANVAS),
            "sourcePath": str(source_path(item).relative_to(ROOT)),
            "sourceSha256": sha(source_path(item)),
            "staticPath": str(static_layer.relative_to(ROOT)),
            "staticSha256": sha(static_layer),
            "staticCompositePath": str(composite_path.relative_to(ROOT)),
            "transparentRgbResidue": residue(layer),
            "detachedAlphaComponents": max(0, actual_components - expected_components),
            "alphaBounds": list(layer.getchannel("A").getbbox() or ()),
            "occlusionRole": "bottomOverShoeUpper" if item.role == "trouser" else "bottomBehindShoes" if item.category == "bottom" else "shoes",
        }
        records.append(record)
    contact = render_static_contact_sheet(records)
    closeup = render_closeups(records)
    manifest = {
        "schemaVersion": 1,
        "rigId": RIG_ID,
        "fitProfileId": FIT_PROFILE_ID,
        "canvas": list(CANVAS),
        "states": ["static"],
        "staticFitVerdict": "PASS_CANDIDATE",
        "staticFitRequiresIndependentReview": True,
        "sourceMethod": "independent-image-generation-chroma-keyed-on-canonical-female-envelope",
        "items": records,
        "staticContactSheet": str(contact.relative_to(ROOT)),
        "staticCloseups": str(closeup.relative_to(ROOT)),
    }
    (EVIDENCE / "static-manifest.json").parent.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "static-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def motion_phase() -> dict[str, object]:
    static_manifest_path = EVIDENCE / "static-manifest.json"
    if not static_manifest_path.exists():
        raise RuntimeError("run --phase static and complete static fit review before motion")
    static_manifest = json.loads(static_manifest_path.read_text())
    if static_manifest.get("staticFitVerdict") != "PASS_CANDIDATE":
        raise RuntimeError("static candidate is not eligible for motion")
    motion_records: list[dict[str, object]] = []
    for item in ITEMS:
        item_frames: list[dict[str, object]] = []
        for state in STATES:
            layer = fitted_bottom(item, state) if item.category == "bottom" else fitted_shoes(item, state)
            candidate = candidate_path(item, state)
            save(layer, candidate)
            runtime = runtime_path(item, state)
            save(layer, runtime)
            composite = compose(item, state, layer)
            composite_path = EVIDENCE / "motion-composites" / item.category / item.slug / f"{state}.png"
            save(composite, composite_path)
            item_frames.append({
                "state": state,
                "candidatePath": str(candidate.relative_to(ROOT)),
                "runtimePath": str(runtime.relative_to(ROOT)),
                "sha256": sha(runtime),
                "compositePath": str(composite_path.relative_to(ROOT)),
                "bounds": list(layer.getchannel("A").getbbox() or ()),
                "transparentRgbResidue": residue(layer),
            })
        static_layer = Image.open(runtime_path(item, "static")).convert("RGBA")
        profile = PROFILE / f"avatar_{item.category}_{item.slug}.png"
        save(static_layer.resize((512, 768), Image.Resampling.LANCZOS), profile)
        thumb = THUMBNAILS / f"avatar_v2_{item.category}_{item.slug}.png"
        static_composite = Image.open(EVIDENCE / "motion-composites" / item.category / item.slug / "static.png").convert("RGBA")
        save(static_composite.crop((54, 70, 202, 350)).resize((220, 220), Image.Resampling.LANCZOS), thumb)
        motion_records.append({
            "item": asdict(item),
            "category": item.category,
            "slug": item.slug,
            "label": item.label,
            "role": item.role,
            "price": item.price,
            "runtimeStaticPath": str(runtime_path(item, "static").relative_to(ROOT)),
            "profilePath": str(profile.relative_to(ROOT)),
            "thumbnailPath": str(thumb.relative_to(ROOT)),
            "states": item_frames,
            "occlusionRole": "bottomOverShoeUpper" if item.role == "trouser" else "bottomBehindShoes" if item.category == "bottom" else "shoes",
        })
    contact = render_motion_contact_sheet(motion_records)
    closeups = render_motion_closeups(motion_records)
    manifest = {
        "schemaVersion": 1,
        "rigId": RIG_ID,
        "fitProfileId": FIT_PROFILE_ID,
        "canvas": list(CANVAS),
        "states": list(STATES),
        "frameDurationMs": 120,
        "promotionState": "CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
        "items": motion_records,
        "motionContactSheet": str(contact.relative_to(ROOT)),
        "motionCloseups": str(closeups.relative_to(ROOT)),
    }
    (EVIDENCE / "capsule-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def render_motion_contact_sheet(records: list[dict[str, object]]) -> Path:
    tile_w, tile_h = 188, 306
    sheet = Image.new("RGBA", (tile_w * len(STATES), 56 + tile_h * len(records)), "#fbf2f8")
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), "Fresh female capsule · static / 4W / 1S", fill="#453443", font=font(21, True))
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit 01")
    for row, record in enumerate(records):
        for column, (frame, label) in enumerate(zip(record["states"], labels)):
            x, y = column * tile_w, 56 + row * tile_h
            avatar = Image.open(ROOT / frame["compositePath"]).convert("RGBA")
            preview = avatar.resize((160, 240), Image.Resampling.LANCZOS)
            sheet.alpha_composite(preview, (x + 14, y + 42))
            if row == 0:
                draw.text((x + 18, y + 12), label, fill="#786273", font=font(13, True))
            if column == 0:
                draw.text((x + 10, y + 278), record["label"], fill="#594454", font=font(12, True))
    path = EVIDENCE / "motion-fit-contact-sheet.png"
    save(sheet, path)
    return path


def render_motion_closeups(records: list[dict[str, object]]) -> Path:
    """Render every item/state around the waist-to-sole contact zone at 2x.

    Full-body sheets establish silhouette and gait.  This matrix deliberately
    makes crotch seams, trouser hems, shoe uppers and the sitting contact point
    large enough for an independent reviewer to inspect without extrapolating.
    """
    crop = (78, 266, 178, 352)
    tile_w, tile_h = 236, 204
    labels = ("Static", "Walk 01", "Walk 02", "Walk 03", "Walk 04", "Sit 01")
    sheet = Image.new("RGBA", (tile_w * len(labels), 62 + tile_h * len(records)), "#fbf2f8")
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 16), "Fresh female capsule · 4W+1S waist / hem / shoe close-up", fill="#453443", font=font(20, True))
    for row, record in enumerate(records):
        for column, (frame, label) in enumerate(zip(record["states"], labels)):
            x, y = column * tile_w, 62 + row * tile_h
            avatar = Image.open(ROOT / frame["compositePath"]).convert("RGBA")
            preview = avatar.crop(crop).resize((216, 186), Image.Resampling.NEAREST)
            sheet.alpha_composite(preview, (x + 10, y + 22))
            if row == 0:
                draw.text((x + 14, y + 4), label, fill="#786273", font=font(12, True))
            if column == 0:
                draw.text((x + 10, y + 188), record["label"], fill="#594454", font=font(11, True))
    path = EVIDENCE / "motion-seam-closeups.png"
    save(sheet, path)
    return path


def check() -> None:
    static_manifest = json.loads((EVIDENCE / "static-manifest.json").read_text())
    failures = []
    if len(static_manifest.get("items", [])) != 8:
        failures.append("static capsule item count must be eight")
    for item in static_manifest.get("items", []):
        if item.get("canvas") != [256, 384]:
            failures.append(f"canvas drift: {item.get('slug')}")
        if item.get("transparentRgbResidue"):
            failures.append(f"transparent RGB residue: {item.get('slug')}")
        if item.get("detachedAlphaComponents"):
            failures.append(f"detached alpha island: {item.get('slug')}")
        if not (ROOT / item["staticPath"]).exists():
            failures.append(f"missing static: {item.get('slug')}")
    promotion = EVIDENCE / "capsule-manifest.json"
    if promotion.exists():
        manifest = json.loads(promotion.read_text())
        if manifest.get("states") != list(STATES):
            failures.append("4W+1S coverage drift")
        for item in manifest.get("items", []):
            if len(item.get("states", [])) != len(STATES):
                failures.append(f"motion coverage missing: {item.get('slug')}")
            for key in ("runtimeStaticPath", "profilePath", "thumbnailPath"):
                if not (ROOT / item[key]).exists():
                    failures.append(f"missing {key}: {item.get('slug')}")
            if item.get("role") == "trouser":
                for frame in item.get("states", []):
                    if frame.get("state") not in {
                        "walking_front_f02",
                        "walking_front_f03",
                        "walking_front_f04",
                    }:
                        continue
                    # The trouser layer renders above shoes. Keep the lower
                    # toe corridor transparent so a movement frame cannot
                    # silently regress into a trouser-shaped shoe mask.
                    image = Image.open(ROOT / frame["runtimePath"]).convert("RGBA")
                    alpha = image.getchannel("A")
                    toe_coverage = sum(
                        1
                        for y in range(337, 348)
                        for x in range(94, 162)
                        if alpha.getpixel((x, y)) > 32
                    )
                    if toe_coverage:
                        failures.append(
                            f"trouser blocks shoe toe corridor: {item.get('slug')}/{frame.get('state')}"
                        )
            if item.get("role") in {"heel", "sneaker"}:
                for frame in item.get("states", []):
                    if frame.get("state") not in {
                        "walking_front_f02",
                        "walking_front_f03",
                        "walking_front_f04",
                    }:
                        continue
                    reference = load_layer(
                        "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
                        frame["state"],
                    ).getchannel("A")
                    layer = Image.open(ROOT / frame["runtimePath"]).convert("RGBA").getchannel("A")
                    anchored = [
                        (x, y)
                        for y in range(CANVAS[1])
                        for x in range(CANVAS[0])
                        if reference.getpixel((x, y)) > 16
                    ]
                    coverage = sum(layer.getpixel(point) > 16 for point in anchored) / len(anchored)
                    # Heels deliberately expose more ankle than sneakers, but
                    # a fitted pair must still cover the vast majority of the
                    # canonical moving-foot anchor. The earlier fixed-column
                    # method only covered about half and produced a second,
                    # floating pair beside the actual feet.
                    if coverage < 0.74:
                        failures.append(
                            f"shoe misses canonical foot anchor: {item.get('slug')}/{frame.get('state')} ({coverage:.3f})"
                        )
    if failures:
        raise SystemExit("\n".join(failures))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("static", "motion"), default="static")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check()
        return
    manifest = static_phase() if args.phase == "static" else motion_phase()
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
