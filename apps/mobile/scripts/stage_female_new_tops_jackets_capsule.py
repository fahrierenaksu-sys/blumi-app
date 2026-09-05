#!/usr/bin/env python3
"""Stage seven generated female tops/jackets against the canonical Blumi rig.

This producer never changes the catalog or room mapping.  It turns the retained
image-generation sources into reviewable 256x384 static + 4W+1S candidates,
then creates the 2x profile and thumbnail derivatives required for integration.
Promotion remains blocked pending independent visual review.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import argparse

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
PROFILE = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMBNAILS = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
SOURCE_ROOT = ROOT / "docs/avatar-motion-pipeline/render-sources/female-new-tops-jackets"
EVIDENCE_ROOT = ROOT / "docs/avatar-motion-pipeline/female-new-tops-jackets/2026-07-16"
CANVAS = (256, 384)
BACKGROUND = (249, 239, 246, 255)
POSES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)

# The bboxes are deliberately item-specific rather than a global top box.  They
# are measured to leave the canonical neck exposed, preserve the waist/bottom
# seam, and keep puffy jacket cuffs above the distal hand envelope.
ITEMS = (
    {
        "slug": "rosebud_picnic_peplum",
        "label": "Rosebud Picnic Peplum",
        "capsule": "top",
        "price": 80,
        "static_bbox": (70, 205, 186, 300),
    },
    {
        "slug": "lilac_cloud_wrap_top",
        "label": "Lilac Cloud Wrap Top",
        "capsule": "top",
        "price": 75,
        "static_bbox": (75, 205, 181, 296),
    },
    {
        "slug": "buttercream_bow_tee",
        "label": "Buttercream Bow Tee",
        "capsule": "top",
        "price": 60,
        "static_bbox": (77, 205, 179, 297),
    },
    {
        "slug": "azure_garden_halter",
        "label": "Azure Garden Halter",
        "capsule": "top",
        "price": 85,
        "static_bbox": (85, 202, 171, 298),
    },
    {
        "slug": "ivory_tweed_crop_jacket",
        "label": "Ivory Tweed Crop Jacket",
        "capsule": "jacket",
        "price": 130,
        "static_bbox": (73, 204, 183, 297),
    },
    {
        "slug": "cherry_varsity_cardigan",
        "label": "Cherry Picnic Cardigan",
        "capsule": "jacket",
        "price": 120,
        # A dedicated long-body, short-cuff source keeps the front-only
        # cardigan attached to the lower anchor without turning its sleeves
        # into hand-covering tubes. This remains one authored silhouette;
        # do not recover fit with post-hoc patch fills.
        "static_bbox": (68, 204, 188, 314),
        "source_alpha": "cherry_varsity_cardigan_fit_v4_alpha.png",
    },
    {
        "slug": "midnight_velvet_bolero",
        "label": "Midnight Velvet Bolero",
        "capsule": "jacket",
        "price": 140,
        "static_bbox": (70, 204, 186, 296),
        "source_alpha": "midnight_velvet_bolero_fit_v2_alpha.png",
    },
)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS and path.suffix == ".png" and "render-sources" not in path.parts:
        raise ValueError(f"{path}: expected canonical {CANVAS}, got {image.size}")
    return image


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA").copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif green > red + 30 and green > blue + 30:
                pixels[x, y] = (red, max(red, blue), blue, alpha)
    return result


def fit(source: Image.Image, target: tuple[int, int, int, int]) -> Image.Image:
    source = normalize(source)
    bbox = source.getchannel("A").point(lambda value: 255 if value > 10 else 0).getbbox()
    if bbox is None:
        raise ValueError("source alpha is empty")
    left, top, right, bottom = target
    fitted = source.crop(bbox).resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(fitted, (left, top))
    return normalize(result)


def pose_bbox(static_bbox: tuple[int, int, int, int], pose: str) -> tuple[int, int, int, int]:
    left, top, right, bottom = static_bbox
    variants = {
        "walking_front_f01": (0, 0, 0, 0),
        "walking_front_f02": (-1, 0, -1, 0),
        # The female W3 torso anchor does not move downward. Moving a halter
        # by one pixel detached its neckline from the measured contact band,
        # even though the hips animate below it. Expand its horizontal
        # envelope instead so W3 remains pose-specific without opening a
        # false neck seam.
        "walking_front_f03": (-1, 0, 1, 0),
        "walking_front_f04": (1, 0, 1, 0),
        "sitting_front_f01": (1, 0, -1, -3),
    }
    dx1, dy1, dx2, dy2 = variants[pose]
    return left + dx1, top + dy1, right + dx2, bottom + dy2


def static_layer(prefix: str) -> Image.Image:
    return load(ROOM / f"avatar_room_{prefix}.png")


def motion_layer(prefix: str, pose: str) -> Image.Image:
    return load(MOTION / f"room_avatar_{prefix}_{pose}.png")


def compose_static(top: Image.Image) -> Image.Image:
    layers = (
        static_layer("hair_back_female_mocha_ribbon_blowout_v2"),
        load(ROOM / "avatar_room_base_female_v2.png"),
        static_layer("face_female_soft_doll_foundation_v2"),
        static_layer("eyes_female_mocha_doe_v2"),
        static_layer("nose_female_soft_button_v2"),
        static_layer("mouth_female_peach_whisper_smile_v2"),
        static_layer("bottom_female_denim_skort_shorts_v2"),
        static_layer("shoes_female_milk_tea_court_sneakers_v2"),
        top,
        static_layer("hair_front_female_mocha_ribbon_blowout_v2"),
    )
    result = Image.new("RGBA", CANVAS, BACKGROUND)
    for layer in layers:
        result.alpha_composite(layer)
    return result


def compose_motion(pose: str, top: Image.Image) -> Image.Image:
    layers = (
        motion_layer("hair_back_female_mocha_ribbon_blowout_v2", pose),
        motion_layer("base_female_v2", pose),
        motion_layer("face_female_soft_doll_foundation_v2", pose),
        motion_layer("eyes_female_mocha_doe_v2", pose),
        motion_layer("nose_female_soft_button_v2", pose),
        motion_layer("mouth_female_peach_whisper_smile_v2", pose),
        motion_layer("bottom_female_denim_skort_shorts_v2", pose),
        motion_layer("shoes_female_milk_tea_court_sneakers_v2", pose),
        top,
        motion_layer("hair_front_female_mocha_ribbon_blowout_v2", pose),
    )
    result = Image.new("RGBA", CANVAS, BACKGROUND)
    for layer in layers:
        result.alpha_composite(layer)
    return result


def font(size: int) -> ImageFont.ImageFont:
    for name in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def alpha_iou(left: Image.Image, right: Image.Image) -> float:
    intersection = union = 0
    for alpha_left, alpha_right in zip(left.getchannel("A").getdata(), right.getchannel("A").getdata()):
        a = alpha_left > 16
        b = alpha_right > 16
        intersection += int(a and b)
        union += int(a or b)
    return intersection / union if union else 0.0


def green_residue(image: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in image.getdata()
        if alpha > 8 and green > red + 30 and green > blue + 30
    )


def hand_visibility(image: Image.Image, base: Image.Image) -> float:
    """Measure exposed distal hands; this is a gate, not a repair mask."""
    hand_pixels: list[tuple[int, int]] = []
    alpha = base.getchannel("A")
    for left_side in (True, False):
        candidates = [
            (x, y)
            for y in range(220, base.height)
            for x in range(base.width)
            if (x < 98 if left_side else x > 158) and alpha.getpixel((x, y)) > 16
        ]
        max_y = max(y for _, y in candidates)
        min_y = max_y - 15
        xs = [x for x, y in candidates if min_y <= y <= max_y]
        limit = sorted(set(xs))[max(0, int(len(set(xs)) * (0.65 if left_side else 0.35)) - 1)]
        hand_pixels.extend(
            (x, y)
            for x, y in candidates
            if min_y <= y <= max_y and (x <= limit if left_side else x >= limit)
        )
    visible = sum(1 for x, y in hand_pixels if image.getpixel((x, y))[3] <= 16)
    return visible / len(hand_pixels)


def write_evidence(item: dict[str, object], static: Image.Image, frames: list[tuple[str, Image.Image]]) -> None:
    item_root = EVIDENCE_ROOT / str(item["slug"])
    item_root.mkdir(parents=True, exist_ok=True)
    header = 36
    states = [("static_front_f01", static), *frames]
    sheet = Image.new("RGB", (CANVAS[0] * 6, CANVAS[1] + header), BACKGROUND[:3])
    draw = ImageDraw.Draw(sheet)
    for index, (pose, frame) in enumerate(states):
        composite = compose_static(frame) if pose == "static_front_f01" else compose_motion(pose, frame)
        x = index * CANVAS[0]
        sheet.paste(composite.convert("RGB"), (x, header))
        label = "Static" if index == 0 else (f"W{index}" if index < 5 else "S1")
        draw.text((x + 10, 9), f"{item['label']} · {label}", fill=(74, 43, 62), font=font(13))
    sheet.save(item_root / "4w1s-full-body-overlay.png", optimize=True)

    crop = (62, 194, 194, 309)
    scale = 3
    width = (crop[2] - crop[0]) * scale
    height = (crop[3] - crop[1]) * scale + 32
    closeups = Image.new("RGB", (width * 6, height), BACKGROUND[:3])
    draw = ImageDraw.Draw(closeups)
    for index, (pose, frame) in enumerate(states):
        composite = compose_static(frame) if pose == "static_front_f01" else compose_motion(pose, frame)
        panel = composite.crop(crop).resize((width, height - 32), Image.Resampling.NEAREST)
        x = index * width
        closeups.paste(panel.convert("RGB"), (x, 32))
        label = "Static" if index == 0 else (f"W{index}" if index < 5 else "S1")
        draw.text((x + 10, 8), f"{label} · neck / shoulder / waist", fill=(74, 43, 62), font=font(13))
    closeups.save(item_root / "4w1s-neckline-sleeve-waist-closeups.png", optimize=True)


def write_static_evidence(item: dict[str, object], static: Image.Image) -> None:
    """Write the mandatory static-fit checkpoint before any motion authoring."""
    item_root = EVIDENCE_ROOT / str(item["slug"])
    item_root.mkdir(parents=True, exist_ok=True)
    composite = compose_static(static).convert("RGB")
    sheet = Image.new("RGB", (CANVAS[0], CANVAS[1] + 36), BACKGROUND[:3])
    sheet.paste(composite, (0, 36))
    ImageDraw.Draw(sheet).text((10, 9), f"{item['label']} · static fit checkpoint", fill=(74, 43, 62), font=font(13))
    sheet.save(item_root / "static-full-body-overlay.png", optimize=True)
    crop = (62, 194, 194, 309)
    closeup = composite.crop(crop).resize(((crop[2] - crop[0]) * 4, (crop[3] - crop[1]) * 4), Image.Resampling.NEAREST)
    closeup.save(item_root / "static-neckline-shoulder-waist-closeup.png", optimize=True)


def write_capsule_contact_sheet(items: list[dict[str, object]]) -> None:
    """Create one inspectable all-seven Static + 4W + 1S review surface."""
    panels = [
        Image.open(EVIDENCE_ROOT / str(item["slug"]) / "4w1s-full-body-overlay.png").convert("RGB")
        for item in items
    ]
    if any(panel.size != (1536, 420) for panel in panels):
        raise ValueError("all item contact panels must be 1536×420")
    header = 36
    output = Image.new("RGB", (1536, header + sum(panel.height for panel in panels)), BACKGROUND[:3])
    draw = ImageDraw.Draw(output)
    draw.text(
        (12, 9),
        "Blumi female tops + jackets · static / W1 / W2 / W3 / W4 / S1",
        fill=(74, 43, 62),
        font=font(16),
    )
    y = header
    for panel in panels:
        output.paste(panel, (0, y))
        y += panel.height
    output.save(EVIDENCE_ROOT / "capsule-4w1s-contact-sheet.png", optimize=True)


def write_producer_qa(manifest: dict[str, object]) -> None:
    item_lines = "\n".join(
        f"- `{item['slug']}` — {item['label']} ({item['capsule']})"
        for item in manifest["items"]
    )
    (EVIDENCE_ROOT / "2026-07-16-producer-qa.md").write_text(
        "# Female tops and jackets capsule — producer QA\n\n"
        "## Status\n\n"
        "HOLD_PENDING_INDEPENDENT_VISUAL_REVIEW. This is staging evidence, not catalog promotion.\n\n"
        "## Scope\n\n"
        f"{item_lines}\n\n"
        "## Canonical base and motion contract\n\n"
        "- Rig: `blumi_2_5d_layered_v1`\n"
        "- Fit profile: `blumi_female_room_avatar_v1`\n"
        "- Canvas: `256×384` RGBA, Static + 4W + 1S, 120ms\n"
        "- Source: retained per-item chroma and alpha renders under `docs/avatar-motion-pipeline/render-sources/female-new-tops-jackets/`.\n\n"
        "## Visual evidence\n\n"
        "- [All-seven contact sheet](capsule-4w1s-contact-sheet.png)\n"
        "- Per-item full-body and neck/shoulder/waist close-ups are located in the matching item folder.\n\n"
        "## Producer verdict\n\n"
        "Static and pose-specific assets are present. Independent reviewer must open the contact sheet and close-ups before a PASS or catalog promotion is recorded.\n"
    )


def build_item(item: dict[str, object], include_motion: bool) -> dict[str, object]:
    slug = str(item["slug"])
    source_path = SOURCE_ROOT / str(item.get("source_alpha", f"{slug}_alpha.png"))
    source = load(source_path)
    static = fit(source, tuple(item["static_bbox"]))
    static_path = ROOM / f"avatar_room_top_female_{slug}_v2.png"
    static_path.parent.mkdir(parents=True, exist_ok=True)
    static.save(static_path, optimize=True)

    frames: list[tuple[str, Image.Image]] = []
    if include_motion:
        for pose in POSES:
            frame = fit(source, pose_bbox(tuple(item["static_bbox"]), pose))
            frame_path = MOTION / f"room_avatar_top_female_{slug}_v2_{pose}.png"
            frame_path.parent.mkdir(parents=True, exist_ok=True)
            frame.save(frame_path, optimize=True)
            frames.append((pose, frame))

    profile_path = PROFILE / f"avatar_top_{slug}.png"
    thumbnail_path = THUMBNAILS / f"avatar_v2_top_{slug}.png"
    PROFILE.mkdir(parents=True, exist_ok=True)
    THUMBNAILS.mkdir(parents=True, exist_ok=True)
    static.resize((512, 768), Image.Resampling.LANCZOS).save(profile_path, optimize=True)
    static.resize((512, 768), Image.Resampling.LANCZOS).save(thumbnail_path, optimize=True)
    # The static checkpoint and 4W+1S sheet are one evidence packet.  Motion
    # staging must not leave the standalone static overlay stale after a
    # source or fit revision.
    write_static_evidence(item, static)
    if include_motion:
        write_evidence(item, static, frames)

    base_static = load(ROOM / "avatar_room_base_female_v2.png")
    per_state = [{
        "pose": "static_front_f01",
        "assetPath": str(static_path.relative_to(ROOT)),
        "bbox": list(static.getchannel("A").getbbox() or ()),
        "sha256": sha256(static_path),
        "greenResiduePixels": green_residue(static),
        "distalHandVisibleRatio": round(hand_visibility(static, base_static), 6),
    }]
    for pose, frame in frames:
        frame_path = MOTION / f"room_avatar_top_female_{slug}_v2_{pose}.png"
        per_state.append({
            "pose": pose,
            "assetPath": str(frame_path.relative_to(ROOT)),
            "bbox": list(frame.getchannel("A").getbbox() or ()),
            "sha256": sha256(frame_path),
            "greenResiduePixels": green_residue(frame),
            "distalHandVisibleRatio": round(hand_visibility(frame, motion_layer("base_female_v2", pose)), 6),
        })
    return {
        **item,
        "sourceAlphaPath": str(source_path.relative_to(ROOT)),
        "staticPath": str(static_path.relative_to(ROOT)),
        "profilePath": str(profile_path.relative_to(ROOT)),
        "thumbnailPath": str(thumbnail_path.relative_to(ROOT)),
        "staticToW1AlphaIoU": round(alpha_iou(static, frames[0][1]), 6) if frames else None,
        "states": per_state,
        "producerVerdict": "HOLD_PENDING_INDEPENDENT_VISUAL_REVIEW" if include_motion else "STATIC_FIT_PENDING_REVIEW",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("static", "motion", "all"), default="all")
    args = parser.parse_args()
    include_motion = args.phase in {"motion", "all"}
    EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "date": "2026-07-16",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "canonicalBase": "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_female_v2.png",
        "frameDurationMs": 120,
        "promotionState": "HOLD_PENDING_INDEPENDENT_VISUAL_REVIEW" if include_motion else "STATIC_FIT_PENDING_REVIEW",
        "items": [build_item(item, include_motion) for item in ITEMS],
    }
    if include_motion:
        write_capsule_contact_sheet(manifest["items"])
    (EVIDENCE_ROOT / "capsule-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (EVIDENCE_ROOT / "README.md").write_text(
        "# Female Tops and Jackets Capsule — producer staging\n\n"
        "This packet stages seven new generated sources against `blumi_female_room_avatar_v1`. "
        f"Current phase: `{args.phase}`. It is not a catalog promotion.\n"
    )
    if include_motion:
        write_producer_qa(manifest)
    print(json.dumps({"items": len(manifest["items"]), "manifest": str(EVIDENCE_ROOT / "capsule-manifest.json")}, indent=2))


if __name__ == "__main__":
    main()
