#!/usr/bin/env python3
"""Targeted walking fit for the two rigid straight-trouser candidates.

V3 moved and clipped the authored leg, but kept a broad rectangular hem. V4
uses the actual per-frame shoe top as the lower-leg boundary, tapers each leg
into that shoe anchor, and gives the shoe complete ownership of its pixels.
Only the two user-rejected straight-trouser items are replaced; other V3
walking candidates remain untouched.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_male_bottom_motion_pose_native_v3 as v3


REPO_ROOT = v3.REPO_ROOT
EVIDENCE = REPO_ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-motion-pose-native-v4"
)
ITEMS = v3.ITEMS
WALK_STATES = v3.WALK_STATES
TARGETS = {
    "straight_utility_tailored_trousers",
    "warm_sand_deconstructed_trousers",
}
TAPER = {
    # Keep a straight-trouser leg readable. The rejected first V4 prototype
    # over-tapered to a narrow cone and read like a skirt; these values only
    # remove the excess outer width before the shoe while retaining real leg
    # volume.
    "straight_utility_tailored_trousers": 0.22,
    "warm_sand_deconstructed_trousers": 0.24,
}


def load_shoes(state: str) -> Image.Image:
    return v3.load_shoes(state)


def _shoe_top_and_center(state: str, left: int, right: int) -> tuple[int, int]:
    shoe = np.asarray(load_shoes(state))[..., 3] > 24
    rows, cols = np.where(shoe[:, left:right])
    if not len(rows):
        raise ValueError(f"shoe {state} has no pixels in half {left}:{right}")
    return int(rows.min()), int(np.median(cols)) + left


def _fit_each_leg_to_shoe(item: v3.v2.Item, state: str, pixels: np.ndarray) -> np.ndarray:
    output = pixels.copy()
    alpha = pixels[..., 3] > 24
    strength = TAPER[item.slug]
    for left, right in ((0, 128), (128, 256)):
        shoe_top, shoe_center = _shoe_top_and_center(state, left, right)
        start = item.leg_start_y + 2
        end = max(start + 1, shoe_top - 1)
        for row in range(start, end + 1):
            visible = np.where(alpha[row, left:right])[0]
            if len(visible) < 2:
                continue
            source_left = left + int(visible.min())
            source_right = left + int(visible.max()) + 1
            source_width = source_right - source_left
            progress = (row - start) / max(1, end - start)
            target_width = max(14, round(source_width * (1.0 - strength * progress)))
            target_width = min(target_width, 29 if progress > 0.72 else source_width)
            source_center = (source_left + source_right - 1) / 2.0
            center = round(source_center * (1.0 - progress) + shoe_center * progress)
            target_left = max(left, center - target_width // 2)
            target_right = min(right, target_left + target_width)
            target_left = target_right - target_width
            row_slice = Image.fromarray(pixels[row : row + 1, source_left:source_right])
            resized = np.asarray(row_slice.resize((target_width, 1), Image.Resampling.LANCZOS))
            output[row, left:right] = 0
            output[row, target_left:target_right] = resized[0]

        # The lower boundary belongs to the shoe. Removing every garment pixel
        # on/under the shoe top avoids the visible cloth-over-toe blocks seen in
        # the rejected V3 board.
        output[shoe_top:, left:right] = 0

    output[output[..., 3] == 0, :3] = 0
    return output


def build_frame(item: v3.v2.Item, state: str) -> Image.Image:
    if state not in WALK_STATES:
        raise ValueError(f"V4 supports walking states only: {state}")
    source = np.asarray(v3.build_frame(item, state)).copy()
    if item.slug in TARGETS:
        source = _fit_each_leg_to_shoe(item, state, source)
    source[source[..., 3] == 0, :3] = 0
    return Image.fromarray(source)


def produce() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    records: dict[str, list[str]] = {}
    for item in ITEMS:
        item_dir = EVIDENCE / item.slug
        item_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for state in WALK_STATES:
            destination = item_dir / f"{state}.png"
            build_frame(item, state).save(destination, optimize=True)
            paths.append(str(destination.relative_to(REPO_ROOT)))
        records[item.slug] = paths
    (EVIDENCE / "male-bottom-pose-native-v4-manifest.json").write_text(
        json.dumps({
            "schemaVersion": 1,
            "recordType": "male_bottom_walking_shoe_fit_candidate",
            "status": "candidate_pending_visual_review",
            "candidateOnly": True,
            "runtimePromoted": False,
            "method": "per-frame-shoe-top-hem-boundary-with-leg-taper",
            "replaces": "bottom-motion-pose-native-v3",
            "targetItems": sorted(TARGETS),
            "items": records,
        }, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    produce()
