#!/usr/bin/env python3
"""Build V11 motion with pose-specific cuffs anchored to actual shoe tops."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v11 import build_candidate as build_static
from produce_creative_utility_bottom_v11_motion import (
    MOTION,
    REDESIGN,
    STATES,
    _authority_path,
    _checker,
    _recolor_authority,
    _subtle_side_trim,
    compose,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = REDESIGN / "creative-utility-bottom-v12-motion"
BOARD = REDESIGN / "creative-utility-bottom-v12-4w1s-board.png"
MANIFEST = REDESIGN / "creative-utility-bottom-v12-motion-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def shoe_bboxes(state: str) -> list[tuple[int, int, int, int]]:
    shoes = np.asarray(
        Image.open(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png").convert("RGBA")
    )[..., 3] > 24
    seen = np.zeros_like(shoes, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(shoes)):
        if seen[y, x]:
            continue
        stack = [(int(y), int(x))]
        seen[y, x] = True
        points: list[tuple[int, int]] = []
        while stack:
            cy, cx = stack.pop()
            points.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < shoes.shape[0] and 0 <= nx < shoes.shape[1] and shoes[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(points) >= 100:
            components.append(points)
    boxes = []
    for points in components:
        ys = [point[0] for point in points]
        xs = [point[1] for point in points]
        boxes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    return sorted(boxes, key=lambda box: box[0])


def _nearest_texture(original: np.ndarray, y: int, x: int, half_start: int, half_end: int) -> np.ndarray:
    for sample_y in range(min(y, 330), max(y - 10, 285), -1):
        visible = np.where(original[sample_y, half_start:half_end, 3] > 24)[0] + half_start
        if len(visible):
            nearest = int(visible[np.abs(visible - x).argmin()])
            return original[sample_y, nearest, :3]
    return np.asarray((74, 92, 47), dtype=np.uint8)


def _anchor_cuffs_to_shoes(state: str, pixels: np.ndarray) -> np.ndarray:
    output = pixels.copy()
    original = pixels.copy()
    shoes_alpha = np.asarray(
        Image.open(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png").convert("RGBA")
    )[..., 3]
    boxes = shoe_bboxes(state)
    if len(boxes) != 2:
        raise ValueError(f"{state}: expected two shoe components, found {len(boxes)}")

    for index, (x0, shoe_top, x1, _shoe_bottom) in enumerate(boxes):
        half_start, half_end = (0, 128) if index == 0 else (128, 256)
        cutoff = shoe_top - 7
        output[cutoff:, half_start:half_end] = 0

        upper_x = np.where(original[cutoff - 1, half_start:half_end, 3] > 24)[0] + half_start
        if not len(upper_x):
            raise ValueError(f"{state}: no garment volume above shoe {index}")
        top_start, top_end = int(upper_x.min()), int(upper_x.max()) + 1

        shoe_x = np.where(shoes_alpha[shoe_top, x0:x1] > 24)[0] + x0
        if not len(shoe_x):
            center = (x0 + x1) // 2
            shoe_x = np.arange(center - 3, center + 4)
        bottom_start = max(half_start, int(shoe_x.min()) - 1)
        bottom_end = min(half_end, int(shoe_x.max()) + 2)

        span = max(shoe_top + 1 - cutoff, 1)
        for y in range(cutoff, shoe_top + 2):
            progress = (y - cutoff) / span
            start = int(round(top_start * (1.0 - progress) + bottom_start * progress))
            end = int(round(top_end * (1.0 - progress) + bottom_end * progress))
            for x in range(start, end):
                rgb = _nearest_texture(original, y, x, half_start, half_end).astype(np.float32)
                center = (start + end - 1) / 2.0
                highlight = 1.0 + 0.05 * (1.0 - abs(x - center) / max((end - start) / 2.0, 1.0))
                output[y, x, :3] = np.clip(rgb * highlight, 0, 255).astype(np.uint8)
                edge = min(x - start, end - 1 - x)
                output[y, x, 3] = 144 if edge == 0 else (224 if edge == 1 else 255)
    output[output[..., 3] == 0, :3] = 0
    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    if state == "walking_front_f01":
        return build_static().copy()
    pixels = _subtle_side_trim(_recolor_authority(state))
    return Image.fromarray(_anchor_cuffs_to_shoes(state, pixels).astype(np.uint8))


def render_board(frames: dict[str, Image.Image]) -> None:
    cell_width, header, full_height, contact_height = 260, 42, 330, 190
    board = Image.new("RGBA", (cell_width * len(STATES), header + full_height + contact_height), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    for index, state in enumerate(STATES):
        x = index * cell_width
        draw.text((x + 10, 14), state, fill=(58, 37, 48, 255))
        combined = compose(state, frames[state])
        full = combined.resize((220, 330), Image.Resampling.LANCZOS)
        full_bg = _checker(full.size)
        full_bg.alpha_composite(full)
        board.alpha_composite(full_bg, (x + 20, header))
        contact = combined.crop((72, 270, 184, 356)).resize((224, 172), Image.Resampling.LANCZOS)
        contact_bg = _checker(contact.size)
        contact_bg.alpha_composite(contact)
        board.alpha_composite(contact_bg, (x + 18, header + full_height + 8))
    board.convert("RGB").save(BOARD, optimize=True)


def produce() -> dict:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames = {state: build_frame(state) for state in STATES}
    files = {}
    for state, frame in frames.items():
        destination = OUTPUT_ROOT / f"{state}.png"
        frame.save(destination, optimize=True)
        files[state] = {"path": _relative(destination), "sha256": _sha256(destination)}
    render_board(frames)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_motion_pending_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "staticApproval": "USER_APPROVED_V11",
        "states": list(STATES),
        "method": "pose-authority-recolor-with-per-frame-shoe-component-cuff-anchoring",
        "motionAuthority": {
            state: {"path": _relative(_authority_path(state)), "sha256": _sha256(_authority_path(state))}
            for state in STATES
        },
        "frames": files,
        "board": {"path": _relative(BOARD), "sha256": _sha256(BOARD)},
        "independentReview": "PENDING",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
