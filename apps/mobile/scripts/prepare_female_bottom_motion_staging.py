#!/usr/bin/env python3
"""Audit seven female bottoms and stage only promotion-safe 4W+1S candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
STAGING = ROOT / "docs/avatar-motion-pipeline/female-bottom-motion-staging"
SOURCES = STAGING / "sources"
EXTRACTED = STAGING / "extracted"
METRICS = STAGING / "2026-07-15-female-bottom-motion-metrics.json"
CANVAS = (256, 384)
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")
STAGED_STATES = ("static", *STATES)

ITEMS = {
    # These two shipped before the promotion system existed.  Their bytes are
    # copied into the candidate surface unchanged so the later hash-bound
    # promotion can review Static + 4W + 1S without silently repainting a live
    # item.  They must clear the same geometry and visual-evidence gates as a
    # newly generated piece before joining the canonical promotion set.
    "denim_skort_shorts": {
        "decision": "STAGED_LIVE_REVIEW_CANDIDATE", "role": "short",
        # The legacy idle and W1 layers sat three pixels too low against the
        # female torso envelope. This moves their existing pixel art together.
        "offsets": {"static": (0, -3), "walking_front_f01": (0, -3)},
    },
    "striped_crochet_shorts": {"decision": "STAGED_LIVE_REVIEW_CANDIDATE", "role": "short"},
    "coral_embellished_laceup_pants": {"decision": "DELEGATED_LONG_PANT_REFIT", "role": "trouser"},
    "black_palm_embellished_pants": {
        "decision": "DELEGATED_LONG_PANT_REFIT", "role": "trouser",
        "source": "black-palm-4w1s-micro-chibi-chroma.png", "minimumRatio": (1.25, 1.70),
    },
    "smoky_floral_mesh_pants": {
        "decision": "DELEGATED_LONG_PANT_REFIT", "role": "trouser",
        "source": "smoky-floral-4w1s-micro-chibi-chroma.png", "minimumRatio": (1.25, 1.70),
    },
    "layered_lace_ruffle_mini_skirt": {
        "decision": "STAGED_REVIEW_CANDIDATE", "role": "skirt",
        "source": "layered-lace-4w1s-micro-chibi-chroma.png",
        "staticWidth": 96, "staticTop": 281,
        "widths": (98, 100, 97, 100, 116), "tops": (279, 280, 279, 280, 281),
    },
    "yellow_bow_lace_ruffle_skirt": {
        "decision": "STAGED_REVIEW_CANDIDATE", "role": "skirt",
        "source": "yellow-bow-4w1s-micro-chibi-chroma.png",
        "staticWidth": 94, "staticTop": 281,
        "widths": (96, 98, 95, 98, 113), "tops": (279, 280, 279, 280, 281),
    },
}


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def live_path(slug: str, state: str | None) -> Path:
    if state is None:
        return ROOM / f"avatar_room_bottom_female_{slug}_v2.png"
    return MOTION / f"room_avatar_bottom_female_{slug}_v2_{state}.png"


def chroma_panel(source: Image.Image, index: int) -> Image.Image:
    left = round(index * source.width / 5)
    right = round((index + 1) * source.width / 5)
    panel = source.crop((left, 0, right, source.height)).convert("RGBA")
    pixels = []
    for red, green, blue, _ in panel.getdata():
        dominance = green - max(red, blue)
        if green > 105 and dominance >= 45:
            alpha = 0
        elif green < 85 or dominance <= 5:
            alpha = 255
        else:
            alpha = round(255 * max(0, min(1, (45 - dominance) / 40)))
        if alpha:
            green = min(green, max(red, blue))
        pixels.append((red, green, blue, alpha))
    panel.putdata(pixels)
    return panel


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty chroma panel")
    return bbox


def retain_largest_alpha_component(image: Image.Image, threshold: int = 16) -> Image.Image:
    """Keep the garment component and discard detached chroma-key debris."""
    alpha = image.getchannel("A")
    width, height = image.size
    visible = bytearray(1 if value > threshold else 0 for value in alpha.getdata())
    visited = bytearray(width * height)
    largest: list[int] = []
    for start, is_visible in enumerate(visible):
        if not is_visible or visited[start]:
            continue
        stack = [start]
        visited[start] = 1
        component: list[int] = []
        while stack:
            current = stack.pop()
            component.append(current)
            x = current % width
            y = current // width
            for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor_x < 0 or neighbor_x >= width or neighbor_y < 0 or neighbor_y >= height:
                    continue
                neighbor = neighbor_y * width + neighbor_x
                if visible[neighbor] and not visited[neighbor]:
                    visited[neighbor] = 1
                    stack.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not largest:
        raise ValueError("empty chroma panel after component segmentation")
    keep = bytearray(width * height)
    for index in largest:
        keep[index] = 1
    cleaned = image.copy()
    pixels = list(cleaned.getdata())
    cleaned.putdata([
        pixel if keep[index] else (0, 0, 0, 0)
        for index, pixel in enumerate(pixels)
    ])
    return cleaned


def strict_despill(image: Image.Image) -> Image.Image:
    """Remove alpha-visible green-screen hue without repainting garment pixels."""
    cleaned = image.copy().convert("RGBA")
    cleaned.putdata([
        (red, min(green, max(red, blue)), blue, alpha) if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in cleaned.getdata()
    ])
    return cleaned


def staged_filename(slug: str, state: str) -> str:
    if state == "static":
        return f"avatar_room_bottom_female_{slug}_v2.png"
    return f"room_avatar_bottom_female_{slug}_v2_{state}.png"


def clean_existing_frame(slug: str, state: str, threshold: int = 0) -> tuple[Image.Image, int]:
    source = Image.open(live_path(slug, None if state == "static" else state)).convert("RGBA")
    before = sum(1 for value in source.getchannel("A").getdata() if value > 0)
    cleaned = retain_largest_alpha_component(strict_despill(source), threshold=threshold)
    after = sum(1 for value in cleaned.getchannel("A").getdata() if value > 0)
    return cleaned, before - after


def stage_skirt(slug: str, config: dict[str, object]) -> list[Image.Image]:
    source = Image.open(SOURCES / str(config["source"])).convert("RGBA")
    target_dir = EXTRACTED / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    static_panel = retain_largest_alpha_component(chroma_panel(source, 0))
    static_component = static_panel.crop(visible_bbox(static_panel))
    static_width = int(config["staticWidth"])
    static_height = round(static_component.height * static_width / static_component.width)
    static_component = strict_despill(
        static_component.resize((static_width, static_height), Image.Resampling.LANCZOS),
    )
    static = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    static.alpha_composite(
        static_component,
        (round((CANVAS[0] - static_width) / 2), int(config["staticTop"])),
    )
    frames: list[Image.Image] = [static]
    static.save(target_dir / staged_filename(slug, "static"), optimize=True)
    for index, state in enumerate(STATES):
        panel = retain_largest_alpha_component(chroma_panel(source, index))
        component = panel.crop(visible_bbox(panel))
        width = int(config["widths"][index])  # type: ignore[index]
        height = round(component.height * width / component.width)
        component = strict_despill(component.resize((width, height), Image.Resampling.LANCZOS))
        canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        x = round((CANVAS[0] - width) / 2)
        y = int(config["tops"][index])  # type: ignore[index]
        canvas.alpha_composite(component, (x, y))
        path = target_dir / staged_filename(slug, state)
        canvas.save(path, optimize=True)
        frames.append(canvas)
    return frames


def stage_existing_alpha_cleanup(slug: str) -> tuple[list[Image.Image], list[int]]:
    """Preserve approved pose-specific art while removing detached alpha debris."""
    frames: list[Image.Image] = []
    removed_pixels: list[int] = []
    target_dir = EXTRACTED / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for state in STAGED_STATES:
        cleaned, removed = clean_existing_frame(slug, state, threshold=1 if state == "static" else 0)
        path = target_dir / staged_filename(slug, state)
        cleaned.save(path, optimize=True)
        frames.append(cleaned)
        removed_pixels.append(removed)
    return frames, removed_pixels


def stage_existing_live_review(slug: str, config: dict[str, object]) -> list[Image.Image]:
    """Byte-copy a legacy live item into the candidate surface for a full rig review.

    The function deliberately does not resize, despill, or otherwise alter the
    asset.  If the review finds a fit defect, the item must go through a real
    refit rather than receiving a hidden staging-only patch.
    """
    frames: list[Image.Image] = []
    target_dir = EXTRACTED / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for state in STAGED_STATES:
        source = live_path(slug, None if state == "static" else state)
        target = target_dir / staged_filename(slug, state)
        # Once a reviewed candidate is atomically promoted, the live layer is
        # already at the canonical coordinate. Re-running the producer must
        # refresh its hash baseline, never apply the rig offset a second time.
        already_promoted = target.exists() and digest(target) == digest(source)
        copyfile(source, target)
        frame = Image.open(target).convert("RGBA")
        offset = dict(config.get("offsets", {})).get(state, (0, 0))
        offset_x, offset_y = tuple(offset)  # type: ignore[arg-type]
        if (offset_x or offset_y) and not already_promoted:
            translated = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            translated.alpha_composite(frame, (int(offset_x), int(offset_y)))
            translated.save(target, optimize=True)
            frame = translated
        frames.append(frame)
    return frames


def source_ratios(path: Path) -> list[float]:
    source = Image.open(path).convert("RGBA")
    ratios = []
    for index in range(5):
        bbox = visible_bbox(chroma_panel(source, index))
        ratios.append(round((bbox[2] - bbox[0]) / (bbox[3] - bbox[1]), 3))
    return ratios


def bbox_iou(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    left, top = max(first[0], second[0]), max(first[1], second[1])
    right, bottom = min(first[2], second[2]), min(first[3], second[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    first_area = (first[2] - first[0]) * (first[3] - first[1])
    second_area = (second[2] - second[0]) * (second[3] - second[1])
    return intersection / (first_area + second_area - intersection)


def transition_metrics(frames: list[Image.Image], role: str) -> dict[str, object]:
    boxes = [visible_bbox(frame) for frame in frames]
    centers = [(box[0] + box[2]) / 2 for box in boxes]
    green_pixels = sum(
        1 for frame in frames for red, green, blue, alpha in frame.getdata()
        # Green fabric and anti-aliased denim highlights are valid art. Only a
        # strong chroma-key green dominance is a rendering contamination.
        if alpha > 16 and green > 105 and green - max(red, blue) >= 45
    )
    unique_frames = len({hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames})
    unique_walking_frames = len({hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames[1:5]})
    static_w1_iou = bbox_iou(boxes[0], boxes[1])
    walking_boxes = boxes[1:5]
    walking_widths = [box[2] - box[0] for box in walking_boxes]
    walking_tops = [box[1] for box in walking_boxes]
    walking_bottoms = [box[3] for box in walking_boxes]
    shoe_boxes = [visible_bbox(load_layer("shoes_female_milk_tea_court_sneakers_v2", state)) for state in STAGED_STATES]
    shoe_contact_deltas = [box[3] - shoe_box[1] for box, shoe_box in zip(boxes, shoe_boxes)]
    waist_top_limit = 289 if role == "short" else 284
    waist_hem_gate = (
        all(277 <= box[1] <= waist_top_limit and 310 <= box[3] <= 335 for box in boxes[:5])
        and 280 <= boxes[5][1] <= 289 and 310 <= boxes[5][3] <= 335
    )
    shoe_contact_gate = all(abs(delta) <= 20 for delta in shoe_contact_deltas)
    gate = (
        green_pixels == 0
        and unique_frames >= 5
        and unique_walking_frames == 4
        and static_w1_iou >= 0.80
        and max(abs(center - 128) for center in centers) <= 3.0
        and max(walking_widths) - min(walking_widths) <= 7
        and max(walking_tops) - min(walking_tops) <= 2
        and max(walking_bottoms) - min(walking_bottoms) <= 7
        and waist_hem_gate
        and shoe_contact_gate
    )
    return {
        "transitionGatesPassed": gate,
        "alphaVisibleGreenPixels": green_pixels,
        "uniqueFrameCount": unique_frames,
        "uniqueWalkingFrameCount": unique_walking_frames,
        "staticW1BboxIoU": round(static_w1_iou, 3),
        "maxCenterlineDeviation": max(abs(center - 128) for center in centers),
        "walkingWidthRange": max(walking_widths) - min(walking_widths),
        "walkingTopRange": max(walking_tops) - min(walking_tops),
        "walkingHemRange": max(walking_bottoms) - min(walking_bottoms),
        "waistHemGatePassed": waist_hem_gate,
        "shoeContactPassed": shoe_contact_gate,
        "shoeContactDeltas": shoe_contact_deltas,
        "layerOrder": "trouser-over-shoe-upper" if role == "trouser" else "shoe-upper-over-skirt",
        "bboxes": [list(box) for box in boxes],
    }


def verify_transition_record(
    frames: list[Image.Image], role: str, claimed: dict[str, object],
) -> list[str]:
    """Recompute gates from PNG pixels; never trust the cached metrics verdict."""
    actual = transition_metrics(frames, role)
    failures: list[str] = []
    requirements = {
        "transitionGatesPassed": actual["transitionGatesPassed"] is True,
        "alphaVisibleGreenPixels": actual["alphaVisibleGreenPixels"] == 0,
        "uniqueFrameCount": int(actual["uniqueFrameCount"]) >= 5,
        "uniqueWalkingFrameCount": actual["uniqueWalkingFrameCount"] == 4,
        "staticW1BboxIoU": float(actual["staticW1BboxIoU"]) >= 0.80,
        "maxCenterlineDeviation": float(actual["maxCenterlineDeviation"]) <= 3.0,
        "walkingWidthRange": int(actual["walkingWidthRange"]) <= 7,
        "walkingTopRange": int(actual["walkingTopRange"]) <= 2,
        "walkingHemRange": int(actual["walkingHemRange"]) <= 7,
        "waistHemGatePassed": actual["waistHemGatePassed"] is True,
        "shoeContactPassed": actual["shoeContactPassed"] is True,
    }
    for key, passed in requirements.items():
        if not passed:
            failures.append(f"{key} recomputed from PNG failed: {actual[key]}")
    for key in requirements:
        if claimed.get(key) != actual.get(key):
            failures.append(
                f"{key} metrics claim drift: claimed={claimed.get(key)} actual={actual.get(key)}",
            )
    if claimed.get("bboxes") != actual.get("bboxes"):
        failures.append("bboxes metrics claim drift")
    if claimed.get("shoeContactDeltas") != actual.get("shoeContactDeltas"):
        failures.append("shoeContactDeltas metrics claim drift")
    return failures


def load_layer(prefix: str, state: str) -> Image.Image:
    if state == "static":
        return Image.open(ROOM / f"avatar_room_{prefix}.png").convert("RGBA")
    return Image.open(MOTION / f"room_avatar_{prefix}_{state}.png").convert("RGBA")


def compose(bottom: Image.Image, role: str, state: str) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#f9eff6")
    for prefix in (
        "hair_back_female_mocha_ribbon_blowout_v2", "base_female_v2",
        "face_female_soft_doll_foundation_v2", "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2", "mouth_female_peach_whisper_smile_v2",
    ):
        result.alpha_composite(load_layer(prefix, state))
    shoes = load_layer("shoes_female_milk_tea_court_sneakers_v2", state)
    if role == "trouser":
        result.alpha_composite(shoes)
        result.alpha_composite(bottom)
    else:
        result.alpha_composite(bottom)
        result.alpha_composite(shoes)
    result.alpha_composite(load_layer("top_female_cream_basic_tee_v2", state))
    result.alpha_composite(load_layer("hair_front_female_mocha_ribbon_blowout_v2", state))
    return result


def evidence_sheet(slug: str, config: dict[str, object], frames: list[Image.Image], frame_states: tuple[str, ...]) -> None:
    label_map = {
        "static": "Static",
        "walking_front_f01": "W1 · 0ms", "walking_front_f02": "W2 · 120ms",
        "walking_front_f03": "W3 · 240ms", "walking_front_f04": "W4 · 360ms",
        "sitting_front_f01": "S1",
    }
    labels = tuple(label_map[state] for state in frame_states)
    sheet = Image.new("RGB", (len(frames) * 256, 430), "#f9eff6")
    close = Image.new("RGB", (len(frames) * 252, 330), "#f9eff6")
    draw = ImageDraw.Draw(sheet)
    close_draw = ImageDraw.Draw(close)
    for index, (state, frame, label) in enumerate(zip(frame_states, frames, labels)):
        avatar = compose(frame, str(config["role"]), state).convert("RGB")
        sheet.paste(avatar, (index * 256, 38))
        draw.text((index * 256 + 8, 10), label, fill="#563f50", font=font(14, True))
        crop = avatar.crop((65, 268, 191, 352)).resize((252, 168), Image.Resampling.NEAREST)
        close.paste(crop, (index * 252, 42))
        close_draw.text((index * 252 + 8, 12), label, fill="#563f50", font=font(14, True))
    out = STAGING / "evidence" / slug
    out.mkdir(parents=True, exist_ok=True)
    prefix = "static-4w1s" if frame_states == STAGED_STATES else "4w1s"
    sheet.save(out / f"{prefix}-full-body-contact-sheet.png", optimize=True)
    close.save(out / f"{prefix}-waist-crotch-hem-shoe-closeups.png", optimize=True)


def produce() -> None:
    before = {f"{slug}:{state or 'static'}": digest(live_path(slug, state)) for slug in ITEMS for state in (None, *STATES)}
    records = []
    for slug, config in ITEMS.items():
        decision = str(config["decision"])
        ratios = None
        removed_pixels = None
        if decision == "STAGED_REVIEW_CANDIDATE":
            frames = stage_skirt(slug, config)
        elif decision == "STAGED_ALPHA_CLEANUP_CANDIDATE":
            frames, removed_pixels = stage_existing_alpha_cleanup(slug)
            ratios = source_ratios(SOURCES / str(config["source"]))
        elif decision == "STAGED_LIVE_REVIEW_CANDIDATE":
            frames = stage_existing_live_review(slug, config)
        elif decision == "DELEGATED_LONG_PANT_REFIT":
            records.append({
                "item": slug, "decision": decision, "producerVerdict": "HOLD",
                "delegatedPipeline": "female-long-pant-shoe-refit-staging/2026-07-15",
                "visualInspectionRequired": True,
            })
            continue
        else:
            frames = [Image.open(live_path(slug, state)).convert("RGBA") for state in STATES]
        frame_states = STAGED_STATES if decision.startswith("STAGED_") else STATES
        evidence_sheet(slug, config, frames, frame_states)
        record = {
            "item": slug, "decision": decision, "producerVerdict": "HOLD",
            "rejectedAlternativeSourceRatios": ratios,
            "removedDetachedAlphaPixels": removed_pixels,
            "visualInspectionRequired": True,
        }
        if decision.startswith("STAGED_"):
            record.update(transition_metrics(frames, str(config["role"])))
        records.append(record)
    after = {f"{slug}:{state or 'static'}": digest(live_path(slug, state)) for slug in ITEMS for state in (None, *STATES)}
    metrics = {
        "itemCount": len(ITEMS),
        "stagedReviewCandidates": sum(r["decision"].startswith("STAGED_") for r in records),
        "delegatedLongPantRefitCandidates": sum(r["decision"] == "DELEGATED_LONG_PANT_REFIT" for r in records),
        "rejectedAlternativeSources": sum(r.get("rejectedAlternativeSourceRatios") is not None for r in records),
        "frameDurationMs": 120,
        "liveAssetsUntouched": before == after,
        "liveSha256": before,
        "items": records,
    }
    METRICS.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


def check() -> None:
    metrics = json.loads(METRICS.read_text())
    failures = []
    if metrics["itemCount"] != 7:
        failures.append("item scope drift")
    for slug, config in ITEMS.items():
        prefix = "static-4w1s" if str(config["decision"]).startswith("STAGED_") else "4w1s"
        for filename in (f"{prefix}-full-body-contact-sheet.png", f"{prefix}-waist-crotch-hem-shoe-closeups.png"):
            if not (STAGING / "evidence" / slug / filename).exists():
                failures.append(f"missing {slug}/{filename}")
        if str(config["decision"]).startswith("STAGED_"):
            frames = []
            for state in STAGED_STATES:
                path = EXTRACTED / slug / staged_filename(slug, state)
                if not path.exists() or Image.open(path).size != CANVAS:
                    failures.append(f"missing/invalid {path}")
                    continue
                frames.append(Image.open(path).convert("RGBA"))
            record = next(item for item in metrics["items"] if item["item"] == slug)
            if len(frames) == len(STAGED_STATES):
                failures.extend(
                    f"{slug}: {failure}"
                    for failure in verify_transition_record(frames, str(config["role"]), record)
                )
    current = {f"{slug}:{state or 'static'}": digest(live_path(slug, state)) for slug in ITEMS for state in (None, *STATES)}
    metrics["liveAssetsUntouched"] = current == metrics["liveSha256"]
    if not metrics["liveAssetsUntouched"]:
        failures.append("live assets changed")
    print(json.dumps(metrics, indent=2))
    if failures:
        print("\n".join(failures))
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check() if args.check else produce()


if __name__ == "__main__":
    main()
