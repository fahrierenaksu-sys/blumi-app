#!/usr/bin/env python3
"""Produce candidate-only, pose-native 4W+1S motion for every male bottom.

The previous batch re-scaled each full standing garment into an existing motion
alpha silhouette. That makes a pair of legs behave like one rectangle, so an
ordinary walking step creates torn crotches, detached cargo pockets and hems
that cover the shoes.  This producer instead locks the waist to the approved
standing layer and moves *each physical leg* from the canonical shoe anchors.
It is deliberately candidate-only: output cannot affect runtime before visual
review and an explicit promotion decision.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-motion-pose-native-v2"
)
BOARD = EVIDENCE / "male-bottom-pose-native-v2-4w1s-board.png"
CLOSEUP_BOARD = EVIDENCE / "male-bottom-pose-native-v2-contact-board.png"
MANIFEST = EVIDENCE / "male-bottom-pose-native-v2-manifest.json"
CANVAS = (256, 384)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class Item:
    slug: str
    family: str
    leg_start_y: int
    seated_leg_start_y: int
    walk_motion: float
    sit_motion: float

    @property
    def static_path(self) -> Path:
        return ROOM / f"avatar_room_bottom_male_{self.slug}_v1.png"


ITEMS = (
    Item("charcoal_tapered_chinos", "slim", 302, 318, 1.0, 1.0),
    Item("mid_blue_straight_jeans", "straight", 302, 318, 1.0, 1.0),
    Item("navy_straight_pants", "straight", 302, 318, 1.0, 1.0),
    Item("straight_utility_tailored_trousers", "straight", 302, 319, 0.9, 0.72),
    Item("warm_sand_deconstructed_trousers", "straight", 302, 318, 0.9, 1.0),
    Item("warm_sand_relaxed_pants", "relaxed", 301, 320, 0.9, 0.78),
    Item("wide_pleated_technical_trousers", "relaxed", 301, 320, 0.9, 0.78),
    Item("midnight_relaxed_tailoring_trousers", "relaxed", 301, 320, 0.9, 0.78),
    Item("monochrome_street_tailoring_bottom", "relaxed", 301, 319, 0.9, 0.78),
    Item("contemporary_resort_street_bottom", "relaxed", 301, 320, 0.85, 0.78),
    Item("washed_baggy_denim", "relaxed", 301, 320, 0.85, 0.78),
    Item("creative_utility_bottom", "cargo", 301, 320, 0.82, 0.56),
    Item("modern_track_luxury_bottom", "cargo", 301, 319, 0.82, 0.56),
    Item("soft_parachute_cargo_pants", "cargo", 301, 320, 0.8, 0.56),
    Item("colorblock_nylon_track_pants", "cargo", 301, 319, 0.82, 0.56),
    Item("sage_cuffed_shorts", "shorts", 302, 302, 0.18, 0.35),
    Item("relaxed_tailored_shorts", "shorts", 302, 302, 0.18, 0.35),
    Item("refined_utility_cargo_shorts", "shorts", 302, 302, 0.2, 0.35),
    Item("technical_sport_shorts", "shorts", 302, 302, 0.2, 0.35),
)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    pixels = np.asarray(image).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _shoes(state: str | None) -> Image.Image:
    if state is None:
        return _load(ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png")
    return _load(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png")


def _shoe_boxes(state: str | None) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    alpha = np.asarray(_shoes(state))[..., 3] > 24
    boxes = []
    for left, right in ((0, 128), (128, 256)):
        ys, xs = np.where(alpha[:, left:right])
        if not len(xs):
            raise ValueError(f"shoe {state or 'static'} has no visible half")
        boxes.append((int(xs.min()) + left, int(ys.min()), int(xs.max()) + left + 1, int(ys.max()) + 1))
    return tuple(boxes)  # type: ignore[return-value]


STATIC_SHOE_BOXES = _shoe_boxes(None)


def _shift_region(source: np.ndarray, mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """Translate a garment sub-region without ever wrapping pixels around."""
    output = np.zeros_like(source)
    ys, xs = np.where(mask)
    target_x = xs + dx
    target_y = ys + dy
    valid = (target_x >= 0) & (target_x < CANVAS[0]) & (target_y >= 0) & (target_y < CANVAS[1])
    output[target_y[valid], target_x[valid]] = source[ys[valid], xs[valid]]
    return output


def _leg_masks(
    item: Item,
    alpha: np.ndarray,
    leg_start_y: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Split exactly below the crotch while retaining an overlapping waist hinge."""
    height, width = alpha.shape
    y, x = np.indices((height, width))
    # A 5px overlap keeps the body attachment solid.  The left/right choice is
    # intentional below the gap; it prevents one transformed rectangle from
    # filling the leg opening when the feet take opposing walking positions.
    hinge = alpha & (y < leg_start_y + 4)
    lower = alpha & (y >= leg_start_y - 3)
    left = lower & (x <= 127)
    right = lower & (x >= 128)
    return hinge, left, right


def _offsets(item: Item, state: str) -> tuple[tuple[int, int], tuple[int, int]]:
    if state == "walking_front_f01":
        return ((0, 0), (0, 0))
    target = _shoe_boxes(state)
    factor = item.sit_motion if state == "sitting_front_f01" else item.walk_motion
    offsets = []
    for reference, current in zip(STATIC_SHOE_BOXES, target):
        ref_center = (reference[0] + reference[2]) / 2.0
        current_center = (current[0] + current[2]) / 2.0
        dx = round((current_center - ref_center) * factor)
        # Shorts are attached to the thigh, not the shoe.  They only receive a
        # subtle lateral pose response and never follow a raised foot upward.
        dy = 0 if item.family == "shorts" else round((current[1] - reference[1]) * factor)
        offsets.append((dx, dy))
    return offsets[0], offsets[1]


def _close_crotch_bridge(pixels: np.ndarray, through_y: int) -> None:
    """Close only tiny accidental center slits above the intentional leg gap."""
    alpha = pixels[..., 3] > 24
    for y in range(289, through_y + 1):
        visible = np.where(alpha[y])[0]
        if len(visible) < 2:
            continue
        left, right = int(visible.min()), int(visible.max())
        x = left
        while x <= right:
            if alpha[y, x]:
                x += 1
                continue
            gap_start = x
            while x <= right and not alpha[y, x]:
                x += 1
            gap_end = x
            # Never bridge a meaningful leg opening. The only allowed repair is
            # a 1–3 pixel raster slit with garment pixels on both sides.
            if (
                gap_end - gap_start <= 3
                and gap_start > left
                and gap_end <= right
                and alpha[y, gap_start - 1]
                and alpha[y, gap_end]
            ):
                for gap_x in range(gap_start, gap_end):
                    ratio = (gap_x - gap_start + 1) / (gap_end - gap_start + 1)
                    pixels[y, gap_x] = np.round(
                        pixels[y, gap_start - 1] * (1 - ratio)
                        + pixels[y, gap_end] * ratio
                    ).astype(np.uint8)
                    pixels[y, gap_x, 3] = 255
                    alpha[y, gap_x] = True


def build_frame(item: Item, state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    static = np.asarray(_load(item.static_path)).copy()
    alpha = static[..., 3] > 24
    seated = state == "sitting_front_f01" and item.family != "shorts"
    leg_start_y = item.seated_leg_start_y if seated else item.leg_start_y
    hinge, left, right = _leg_masks(item, alpha, leg_start_y)
    left_offset, right_offset = _offsets(item, state)

    # The approved static waist and upper hip are immutable.  Individual legs
    # overlap it by three rows, which removes horizontal seams during a step.
    output = np.zeros_like(static)
    output[hinge] = static[hinge]
    for mask, offset in ((left, left_offset), (right, right_offset)):
        moved = _shift_region(static, mask, *offset)
        visible = moved[..., 3] > 0
        output[visible] = moved[visible]

    # Preserve a continuous waist even when a leg moves upward. This is a real
    # attachment zone, not a cloned rectangular patch: the pixels come solely
    # from the approved garment itself.
    upper = alpha & (np.indices(alpha.shape)[0] < leg_start_y + 2)
    output[upper] = static[upper]
    if not seated:
        _close_crotch_bridge(output, item.leg_start_y)
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def validate_frame(item: Item, state: str, frame: Image.Image) -> list[str]:
    pixels = np.asarray(frame.convert("RGBA"))
    alpha = pixels[..., 3] > 24
    errors: list[str] = []
    if np.any(pixels[pixels[..., 3] == 0, :3]):
        errors.append("transparent RGB residue")
    if state != "sitting_front_f01":
        for y in range(289, item.leg_start_y):
            visible = np.where(alpha[y])[0]
            if len(visible) < 12:
                errors.append(f"empty waist at y={y}")
                break
            if not np.all(alpha[y, visible.min() : visible.max() + 1]):
                errors.append(f"torn waist at y={y}")
                break
    # Each trouser must still reach the lower body after pose translation;
    # shorts must remain above the shoe region instead of covering the shoes.
    if item.family == "shorts":
        if alpha[330:].any():
            errors.append("short hem overlaps shoe region")
    elif not alpha[310:].any():
        errors.append("trouser lost lower-leg coverage")
    return errors


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(
            f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size
        )
    except OSError:
        return ImageFont.load_default()


def _checker(size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", size, (251, 249, 251, 255))
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 10):
        for x in range(0, size[0], 10):
            if (x // 10 + y // 10) % 2:
                draw.rectangle((x, y, x + 9, y + 9), fill=(232, 228, 232, 255))
    return result


def _compose(item: Item, state: str, bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layers = (
        _load(MOTION / f"room_avatar_base_male_light_v1_{state}.png"),
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _load(MOTION / f"room_avatar_top_male_powder_blue_crew_tee_v1_{state}.png"),
        _shoes(state),
        bottom,
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    for layer in layers:
        result.alpha_composite(layer)
    return result


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _render_boards(frames: dict[str, dict[str, Image.Image]]) -> None:
    columns, cell_w, row_h = 5, 208, 232
    board = Image.new("RGBA", (columns * cell_w, 48 + row_h * len(ITEMS)), (255, 248, 251, 255))
    closeups = Image.new("RGBA", (columns * cell_w, 48 + row_h * len(ITEMS)), (255, 248, 251, 255))
    for image, label in ((board, "BLUMI MALE BOTTOMS · POSE-NATIVE V2 · 4W+1S"), (closeups, "BLUMI MALE BOTTOMS · POSE-NATIVE V2 · CONTACT CHECK")):
        ImageDraw.Draw(image).text((14, 14), label, font=_font(17, True), fill=(62, 43, 54, 255))
    for row, item in enumerate(ITEMS):
        y = 48 + row * row_h
        for index, state in enumerate(STATES):
            composite = _compose(item, state, frames[item.slug][state])
            tile = composite.resize((124, 186), Image.Resampling.LANCZOS)
            bg = _checker(tile.size)
            bg.alpha_composite(tile)
            board.alpha_composite(bg, (index * cell_w + 42, y + 23))
            crop = composite.crop((76, 270, 180, 354)).resize((182, 147), Image.Resampling.NEAREST)
            crop_bg = _checker(crop.size)
            crop_bg.alpha_composite(crop)
            closeups.alpha_composite(crop_bg, (index * cell_w + 13, y + 23))
            ImageDraw.Draw(board).text((index * cell_w + 8, y + 210), state.replace("_front_", " "), font=_font(10, True), fill=(86, 60, 73, 255))
            ImageDraw.Draw(closeups).text((index * cell_w + 8, y + 184), state.replace("_front_", " "), font=_font(10, True), fill=(86, 60, 73, 255))
        ImageDraw.Draw(board).text((8, y + 5), item.slug, font=_font(10, True), fill=(62, 43, 54, 255))
        ImageDraw.Draw(closeups).text((8, y + 5), item.slug, font=_font(10, True), fill=(62, 43, 54, 255))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(BOARD, optimize=True)
    closeups.convert("RGB").save(CLOSEUP_BOARD, optimize=True)


def produce() -> dict:
    frames: dict[str, dict[str, Image.Image]] = {}
    records = []
    for item in ITEMS:
        item_frames = {state: build_frame(item, state) for state in STATES}
        for state, frame in item_frames.items():
            errors = validate_frame(item, state, frame)
            if errors:
                raise ValueError(f"{item.slug}/{state}: {'; '.join(errors)}")
        frames[item.slug] = item_frames
        output_dir = EVIDENCE / item.slug
        output_dir.mkdir(parents=True, exist_ok=True)
        outputs = {}
        for state, frame in item_frames.items():
            destination = output_dir / f"{state}.png"
            frame.save(destination, optimize=True)
            outputs[state] = {"path": _rel(destination), "sha256": _sha256(destination)}
        records.append({"slug": item.slug, "family": item.family, "frames": outputs})
    _render_boards(frames)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_only_pending_visual_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "pose_native_static_art_leg_segmentation_with_canonical_shoe_anchors",
        "states": list(STATES),
        "items": records,
        "boards": [
            {"path": _rel(BOARD), "sha256": _sha256(BOARD)},
            {"path": _rel(CLOSEUP_BOARD), "sha256": _sha256(CLOSEUP_BOARD)},
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
