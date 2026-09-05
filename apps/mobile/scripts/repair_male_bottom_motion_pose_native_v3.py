#!/usr/bin/env python3
"""Shoe-aware V3 walking repair for the male-bottom wardrobe.

V2 moved each leg by only a family multiplier, so wide/cargo hems lagged behind
the canonical walking shoes and were then composited over their tongue and toe.
V3 retains the authored upper garment, progressively follows the actual shoe
anchor toward the hem, and clips each item against its current shoe silhouette.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

import repair_male_bottom_motion_pose_native_v2 as v2


REPO_ROOT = v2.REPO_ROOT
ROOM = v2.ROOM
MOTION = v2.MOTION
ITEMS = v2.ITEMS
WALK_STATES = tuple(state for state in v2.STATES if state.startswith("walking_"))
EVIDENCE = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-motion-pose-native-v3"
)
TARGETS = {
    "straight_utility_tailored_trousers",
    "warm_sand_deconstructed_trousers",
    "contemporary_resort_street_bottom",
    "modern_track_luxury_bottom",
}
HEM_TAPER = {
    "straight_utility_tailored_trousers": 0.16,
    "warm_sand_deconstructed_trousers": 0.18,
    "contemporary_resort_street_bottom": 0.22,
    "modern_track_luxury_bottom": 0.18,
}


def load_shoes(state: str) -> Image.Image:
    return v2._shoes(state)


def _progressive_residual(item: v2.Item, state: str, pixels: np.ndarray) -> np.ndarray:
    """Apply only the missing anchor delta, from zero at hip to full at hem."""
    if state == "walking_front_f01":
        return pixels
    target_boxes = v2._shoe_boxes(state)
    factor = item.walk_motion
    output = pixels.copy()
    alpha = pixels[..., 3] > 24
    for half, (left, right) in enumerate(((0, 128), (128, 256))):
        static_box = v2.STATIC_SHOE_BOXES[half]
        target_box = target_boxes[half]
        full_dx = round(
            ((target_box[0] + target_box[2]) - (static_box[0] + static_box[2])) / 2.0
        )
        residual_dx = round(full_dx * (1.0 - factor))
        if residual_dx == 0:
            continue
        for row in range(item.leg_start_y, 338):
            progress = min(1.0, max(0.0, (row - item.leg_start_y) / max(1, 332 - item.leg_start_y)))
            shift = round(residual_dx * progress)
            if shift == 0:
                continue
            row_mask = alpha[row, left:right]
            source_x = np.where(row_mask)[0] + left
            source_x = source_x[source_x + shift >= left]
            source_x = source_x[source_x + shift < right]
            output[row, left:right] = 0
            output[row, source_x + shift] = pixels[row, source_x]
    return output


def _clip_to_shoe_contact(state: str, pixels: np.ndarray) -> np.ndarray:
    """Keep shallow cuff contact but never cover tongue, laces, or toe."""
    output = pixels.copy()
    shoe = np.asarray(load_shoes(state))[..., 3] > 24
    rows, cols = np.indices(shoe.shape)
    for left, right in ((0, 128), (128, 256)):
        ys, xs = np.where(shoe[:, left:right])
        if not len(xs):
            continue
        top = int(ys.min())
        center = int(np.median(xs)) + left
        deep_contact = shoe & (cols >= left) & (cols < right) & (rows >= top + 3)
        # The central upper is the visible tongue/lace channel. It is always
        # shoe-owned; only the outer cuff may overlap the first two shoe rows.
        tongue = shoe & (cols >= center - 7) & (cols <= center + 7) & (rows >= top)
        output[deep_contact | tongue] = 0
    # These are the canonical front tongue corridors across all four walk
    # poses. Keeping them shoe-owned prevents tiny residual cuff pixels from
    # reading as torn cloth over the laces.
    fixed_tongues = shoe & (rows >= 329) & (rows < 345) & (
        ((cols >= 105) & (cols < 120)) | ((cols >= 137) & (cols < 152))
    )
    output[fixed_tongues] = 0
    output[output[..., 3] == 0, :3] = 0
    return output


def _taper_lower_leg(item: v2.Item, pixels: np.ndarray) -> np.ndarray:
    """Contour each authored leg toward its hem without moving the waist."""
    output = pixels.copy()
    strength = HEM_TAPER[item.slug]
    for row in range(item.leg_start_y + 2, 330):
        progress = min(1.0, max(0.0, (row - item.leg_start_y) / max(1, 328 - item.leg_start_y)))
        for left, right in ((0, 128), (128, 256)):
            visible = np.where(pixels[row, left:right, 3] > 24)[0]
            if len(visible) < 2:
                continue
            source_left = left + int(visible.min())
            source_right = left + int(visible.max()) + 1
            source = Image.fromarray(pixels[row : row + 1, source_left:source_right])
            target_width = max(16, round(source.width * (1.0 - strength * progress)))
            if target_width >= source.width:
                continue
            center = round((source_left + source_right - 1) / 2.0)
            target_left = max(left, center - target_width // 2)
            target_right = min(right, target_left + target_width)
            target_left = target_right - target_width
            resized = np.asarray(source.resize((target_width, 1), Image.Resampling.LANCZOS))
            output[row, source_left:source_right] = 0
            output[row, target_left:target_right] = resized
    output[output[..., 3] == 0, :3] = 0
    return output


def build_frame(item: v2.Item, state: str) -> Image.Image:
    if state not in WALK_STATES:
        raise ValueError(f"V3 supports walking states only: {state}")
    source = np.asarray(v2.build_frame(item, state)).copy()
    if item.slug in TARGETS:
        source = _progressive_residual(item, state, source)
        source = _taper_lower_leg(item, source)
        source = _clip_to_shoe_contact(state, source)
    source[source[..., 3] == 0, :3] = 0
    return Image.fromarray(source)


def produce() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "schemaVersion": 1,
        "recordType": "male_bottom_walking_shoe_aware_candidate",
        "status": "candidate_pending_visual_review",
        "runtimePromoted": False,
        "items": {},
    }
    for item in ITEMS:
        item_dir = EVIDENCE / item.slug
        item_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for state in WALK_STATES:
            output = item_dir / f"{state}.png"
            build_frame(item, state).save(output, optimize=True)
            paths.append(str(output.relative_to(REPO_ROOT)))
        manifest["items"][item.slug] = paths  # type: ignore[index]
    (EVIDENCE / "male-bottom-pose-native-v3-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    produce()
