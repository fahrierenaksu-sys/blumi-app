#!/usr/bin/env python3
"""Stage premium pose-specific female top 4W+1S sources without live writes."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
STAGING = ROOT / "docs/avatar-motion-pipeline/female-premium-top-motion-staging"
CANVAS = (256, 384)
ITEMS = {
    "cream_basic_tee": "Cream Basic Tee",
    "blush_lace_cardigan": "Blush Lace Cardigan",
    "sage_ribbon_knit_jacket": "Sage Ribbon Knit Jacket",
    "cherry_heart_milkmaid_blouse": "Cherry Heart Milkmaid Blouse",
    "powder_blue_ribbon_corset_top": "Powder Blue Ribbon Corset Top",
    "noir_rose_heart_cardigan": "Noir Rose Heart Cardigan",
}

HAND_CLEARANCE_SLUGS: set[str] = set()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS and "sources" not in path.parts:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def extract_chroma(source: Image.Image) -> Image.Image:
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    pixels = []
    for red, green, blue, source_alpha in source.convert("RGBA").getdata():
        dominance = green - max(red, blue)
        if green >= 115 and dominance >= 75:
            alpha = 0
        elif green < 95 or dominance <= 12:
            alpha = source_alpha
        else:
            alpha = round(source_alpha * max(0.0, min(1.0, (75 - dominance) / 63)))
        if alpha:
            green = min(green, max(red, blue) + 4)
            pixels.append((red, green, blue, alpha))
        else:
            pixels.append((0, 0, 0, 0))
    output.putdata(pixels)
    return output


def fitted(source: Image.Image, target: tuple[int, int, int, int]) -> Image.Image:
    keyed = extract_chroma(source)
    alpha = keyed.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("chroma extraction produced an empty top")
    left, top, right, bottom = target
    garment = keyed.crop(bbox).resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(garment, (left, top))
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, value = pixels[x, y]
            if value == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif green > red + 30 and green > blue + 30:
                pixels[x, y] = (red, max(red, blue), blue, value)
    return result


def normalized_asset(source: Image.Image) -> Image.Image:
    """Canonicalize transparent RGB and remove chroma residue without changing geometry."""
    result = source.convert("RGBA").copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif green > red + 30 and green > blue + 30:
                pixels[x, y] = (red, max(red, blue), blue, alpha)
    return result


def canonical_hand_pixels(base: Image.Image) -> set[tuple[int, int]]:
    """Return the distal canonical hand zones used by the runtime front rig."""
    alpha = base.getchannel("A")
    pixels: set[tuple[int, int]] = set()
    for left_side in (True, False):
        anchors = [
            (x, y)
            for y in range(220, base.height)
            for x in range(base.width)
            if (x < 98 if left_side else x > 158) and alpha.getpixel((x, y)) > 16
        ]
        if not anchors:
            raise ValueError("canonical hand zone is empty")
        max_y = max(y for _, y in anchors)
        min_y = max_y - 15
        x_range = range(0, 108) if left_side else range(149, base.width)
        pixels.update(
            (x, y)
            for y in range(min_y, max_y + 1)
            for x in x_range
            if alpha.getpixel((x, y)) > 16
        )
    return pixels


def outer_hand_core_pixels(base: Image.Image) -> set[tuple[int, int]]:
    """Return distal outer-hand pixels, excluding valid inner torso contact."""
    hand_pixels = canonical_hand_pixels(base)
    core: set[tuple[int, int]] = set()
    for left_side in (True, False):
        side = sorted(
            ((x, y) for x, y in hand_pixels if (x < 108 if left_side else x >= 149)),
            key=lambda point: (point[0], point[1]),
        )
        distinct_xs = sorted({x for x, _ in side})
        split_index = (
            max(0, int(len(distinct_xs) * 0.65) - 1)
            if left_side
            else min(len(distinct_xs) - 1, int(len(distinct_xs) * 0.35))
        )
        split_x = distinct_xs[split_index]
        core.update(
            (x, y)
            for x, y in side
            if (x <= split_x if left_side else x >= split_x)
        )
    return core


def hand_visibility(top: Image.Image, base: Image.Image) -> dict[str, int | float]:
    pixels = outer_hand_core_pixels(base)
    covered = sum(1 for x, y in pixels if top.getpixel((x, y))[3] > 16)
    visible = len(pixels) - covered
    return {
        "outerHandCorePixels": len(pixels),
        "coveredOuterHandCorePixels": covered,
        "visibleOuterHandCorePixels": visible,
        "visibleOuterHandCoreRatio": round(visible / len(pixels), 6),
    }


def clear_canonical_hands(top: Image.Image, base: Image.Image) -> Image.Image:
    """Apply the front-rig hand occlusion envelope; never punch hand-shaped holes.

    The generated source already carries a short cuff.  This state-specific
    envelope only establishes which layer owns the hand/garment boundary when
    the walking arms move inward; it does not repaint or warp garment art.
    """
    result = top.copy()
    pixels = result.load()
    hand_pixels = canonical_hand_pixels(base)
    for left_side in (True, False):
        side = [(x, y) for x, y in hand_pixels if (x < 108 if left_side else x >= 149)]
        if not side:
            raise ValueError("canonical side hand zone is empty")
        cuff_end = min(y for _, y in side)
        x_range = range(0, 110) if left_side else range(146, result.width)
        for y in range(cuff_end, result.height):
            for x in x_range:
                pixels[x, y] = (0, 0, 0, 0)
    return result


def live_path(slug: str, pose: str) -> Path:
    return MOTION / f"room_avatar_top_female_{slug}_v2_{pose}.png"


def target_bounds(slug: str, pose: str) -> tuple[int, int, int, int]:
    bbox = load(live_path(slug, pose)).getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"live anchor is empty: {slug} {pose}")
    if slug == "noir_rose_heart_cardigan" and pose in {
        "walking_front_f02",
        "walking_front_f03",
    }:
        # The two inward-arm poses need one pixel of symmetric side clearance
        # so the short painted cuff stays outside each distal hand core.  This
        # is part of state-specific anchor fitting, not an alpha cutout.
        left, top, right, bottom = bbox
        return left + 1, top, right - 1, bottom
    return bbox


def static_target_bounds(slug: str) -> tuple[int, int, int, int]:
    bbox = load(ROOM / f"avatar_room_top_female_{slug}_v2.png").getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"live static anchor is empty: {slug}")
    return bbox


def motion_layer(prefix: str, pose: str) -> Image.Image:
    return load(MOTION / f"room_avatar_{prefix}_{pose}.png")


def static_layer(prefix: str) -> Image.Image:
    return load(ROOM / f"avatar_room_{prefix}.png")


def static_source(slug: str) -> Path:
    if slug == "cream_basic_tee":
        return ROOT / "docs/avatar-motion-pipeline/static-seeds/avatar_room_top_female_cream_basic_tee_aligned_clean_v1.png"
    return ROOM / f"avatar_room_top_female_{slug}_v2.png"


def source_paths(slug: str) -> tuple[Path, Path]:
    if slug == "cream_basic_tee":
        root = ROOT / "docs/avatar-motion-pipeline/female-cream-tee-motion-staging"
        return root / "cream-tee-walk-4w-chroma-source.png", root / "cream-tee-sit-chroma-source.png"
    source_root = STAGING / slug / "sources"
    if slug == "blush_lace_cardigan":
        # These accepted redraws use a true short-sleeve silhouette.  Earlier
        # sources carried long cuffs over the canonical distal hand zones and
        # the first sitting redraw changed the garment identity completely.
        # Keep the source geometry intact; do not repair those failures with a
        # hand-shaped alpha mask after fitting.
        return source_root / "walk-4w-chroma-cuff-fit-v8.png", source_root / "sit-chroma-cuff-fit-v4.png"
    if slug == "noir_rose_heart_cardigan":
        return source_root / "walk-4w-chroma-cuff-fit-v9.png", source_root / "sit-chroma-cuff-fit-v4.png"
    if slug == "powder_blue_ribbon_corset_top":
        return source_root / "walk-4w-chroma-front-bow-v2.png", source_root / "sit-chroma-front-bow-v2.png"
    return source_root / "walk-4w-chroma.png", source_root / "sit-chroma.png"


def compose(pose: str, top: Image.Image) -> Image.Image:
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
    result = Image.new("RGBA", CANVAS, (249, 239, 246, 255))
    for layer in layers:
        result.alpha_composite(layer)
    return result


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
    result = Image.new("RGBA", CANVAS, (249, 239, 246, 255))
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


def green_residue(image: Image.Image) -> int:
    return sum(1 for red, green, blue, alpha in image.getdata() if alpha > 8 and green - max(red, blue) > 30)


def produce(slug: str) -> None:
    item_root = STAGING / slug
    sources = item_root / "sources"
    extracted = item_root / "extracted"
    walk_source, sit_source = source_paths(slug)
    if not walk_source.exists() or not sit_source.exists():
        raise FileNotFoundError(f"accepted sources missing for {slug}")
    extracted.mkdir(parents=True, exist_ok=True)
    strip = Image.open(walk_source).convert("RGBA")
    regenerated_static_slugs = {
        "cream_basic_tee",
        "blush_lace_cardigan",
        "powder_blue_ribbon_corset_top",
        "noir_rose_heart_cardigan",
    }
    if slug in regenerated_static_slugs:
        first_panel = strip.crop((0, 0, round(strip.width / 4), strip.height))
        static = fitted(first_panel, static_target_bounds(slug))
    else:
        static = normalized_asset(load(static_source(slug)))
    if slug in HAND_CLEARANCE_SLUGS:
        static = clear_canonical_hands(static, load(ROOM / "avatar_room_base_female_v2.png"))
    static_target = extracted / f"avatar_room_top_female_{slug}_v2.png"
    static.save(static_target, optimize=True)

    frames: list[tuple[str, Image.Image]] = []
    live_hashes: dict[str, str] = {}
    for index in range(4):
        pose = f"walking_front_f{index + 1:02d}"
        source_left = round(index * strip.width / 4)
        source_right = round((index + 1) * strip.width / 4)
        frame = fitted(strip.crop((source_left, 0, source_right, strip.height)), target_bounds(slug, pose))
        if slug in HAND_CLEARANCE_SLUGS:
            frame = clear_canonical_hands(frame, motion_layer("base_female_v2", pose))
        target = extracted / f"room_avatar_top_female_{slug}_v2_{pose}.png"
        frame.save(target, optimize=True)
        frames.append((pose, frame))
        live_hashes[pose] = sha256(live_path(slug, pose))
    sit_pose = "sitting_front_f01"
    sit_frame = fitted(Image.open(sit_source).convert("RGBA"), target_bounds(slug, sit_pose))
    if slug in HAND_CLEARANCE_SLUGS:
        sit_frame = clear_canonical_hands(sit_frame, motion_layer("base_female_v2", sit_pose))
    sit_target = extracted / f"room_avatar_top_female_{slug}_v2_{sit_pose}.png"
    sit_frame.save(sit_target, optimize=True)
    frames.append((sit_pose, sit_frame))
    live_hashes[sit_pose] = sha256(live_path(slug, sit_pose))

    header = 36
    evidence_frames = [("static_front_f01", static), *frames]
    sheet = Image.new("RGB", (CANVAS[0] * 6, CANVAS[1] + header), (249, 239, 246))
    draw = ImageDraw.Draw(sheet)
    for index, (pose, frame) in enumerate(evidence_frames):
        x = index * CANVAS[0]
        composite = compose_static(frame) if pose == "static_front_f01" else compose(pose, frame)
        sheet.paste(composite.convert("RGB"), (x, header))
        label = "Static" if index == 0 else (f"W{index}" if index < 5 else "S1")
        draw.text((x + 10, 9), f"{ITEMS[slug]} · {label}", fill=(74, 43, 62), font=font(13))
    overlay = item_root / "4w1s-full-body-overlay.png"
    sheet.save(overlay, optimize=True)

    crop = (65, 195, 191, 310)
    scale = 3
    cell = ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale + 32)
    closeups = Image.new("RGB", (cell[0] * 6, cell[1]), (249, 239, 246))
    closeup_draw = ImageDraw.Draw(closeups)
    for index, (pose, frame) in enumerate(evidence_frames):
        x = index * cell[0]
        composite = compose_static(frame) if pose == "static_front_f01" else compose(pose, frame)
        panel = composite.crop(crop).resize((cell[0], cell[1] - 32), Image.Resampling.NEAREST)
        closeups.paste(panel.convert("RGB"), (x, 32))
        label = "Static" if index == 0 else (f"W{index}" if index < 5 else "S1")
        closeup_draw.text((x + 10, 8), f"{label} · neck / sleeve / waist", fill=(74, 43, 62), font=font(13))
    closeup_path = item_root / "4w1s-neckline-sleeve-waist-closeups.png"
    closeups.save(closeup_path, optimize=True)

    metrics = {
        "slug": slug,
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "walkSourceSha256": sha256(walk_source),
        "sitSourceSha256": sha256(sit_source),
        "staticSourceSha256": sha256(walk_source) if slug in regenerated_static_slugs else sha256(static_source(slug)),
        "staticSha256": sha256(static_target),
        "frames": [
            {
                "pose": pose,
                "targetBbox": list(frame.getchannel("A").getbbox() or ()),
                "sha256": sha256(extracted / f"room_avatar_top_female_{slug}_v2_{pose}.png"),
                "greenResiduePixels": green_residue(frame),
                "liveSha256": live_hashes[pose],
            }
            for pose, frame in frames
        ],
        "liveAssetsUntouched": all(sha256(live_path(slug, pose)) == live_hashes[pose] for pose, _ in frames),
        "producerVerdict": "HOLD_PENDING_VISUAL_REVIEW",
    }
    if slug in {"blush_lace_cardigan", "noir_rose_heart_cardigan"}:
        metrics["handVisibilityThreshold"] = 0.95
        metrics["staticHandVisibility"] = hand_visibility(
            static,
            load(ROOM / "avatar_room_base_female_v2.png"),
        )
        for frame_metrics, (pose, frame) in zip(metrics["frames"], frames):
            frame_metrics["handVisibility"] = hand_visibility(
                frame,
                motion_layer("base_female_v2", pose),
            )
    if slug == "powder_blue_ribbon_corset_top":
        identity_bbox = (117, 241, 139, 258)
        composed = compose("walking_front_f01", frames[0][1])
        hair = motion_layer("hair_front_female_mocha_ribbon_blowout_v2", "walking_front_f01")
        visible = 0
        for y in range(identity_bbox[1], identity_bbox[3]):
            for x in range(identity_bbox[0], identity_bbox[2]):
                if frames[0][1].getpixel((x, y))[3] > 16 and hair.getpixel((x, y))[3] <= 16 and composed.getpixel((x, y))[3] > 16:
                    visible += 1
        metrics["frontIdentityBbox"] = list(identity_bbox)
        metrics["visibleIdentityPixels"] = visible
    (item_root / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))


def check(slug: str) -> None:
    item_root = STAGING / slug
    metrics = json.loads((item_root / "metrics.json").read_text())
    failures = []
    hashes = set()
    static_path = item_root / "extracted" / f"avatar_room_top_female_{slug}_v2.png"
    if green_residue(load(static_path)):
        failures.append("static: chroma residue")
    for frame in metrics["frames"]:
        pose = frame["pose"]
        path = item_root / "extracted" / f"room_avatar_top_female_{slug}_v2_{pose}.png"
        image = load(path)
        if list(image.getchannel("A").getbbox() or ()) != frame["targetBbox"]:
            failures.append(f"{pose}: bbox drift")
        if green_residue(image):
            failures.append(f"{pose}: chroma residue")
        if sha256(live_path(slug, pose)) != frame["liveSha256"]:
            failures.append(f"{pose}: live asset changed")
        hashes.add(sha256(path))
    if len(hashes) != 5:
        failures.append("4W+1S frames are not all distinct")
    for evidence in ("4w1s-full-body-overlay.png", "4w1s-neckline-sleeve-waist-closeups.png"):
        if not (item_root / evidence).exists():
            failures.append(f"missing {evidence}")
    print(json.dumps({"slug": slug, "failures": failures, "liveAssetsUntouched": not any("live asset" in failure for failure in failures)}))
    if failures:
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--item", required=True, choices=sorted(ITEMS))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check(args.item) if args.check else produce(args.item)


if __name__ == "__main__":
    main()
