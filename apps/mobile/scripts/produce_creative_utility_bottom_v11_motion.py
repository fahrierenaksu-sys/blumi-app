#!/usr/bin/env python3
"""Produce candidate-only 4W+1S motion for approved Creative Utility V11."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v11 import build_candidate as build_static


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
OUTPUT_ROOT = REDESIGN / "creative-utility-bottom-v11-motion"
BOARD = REDESIGN / "creative-utility-bottom-v11-4w1s-board.png"
MANIFEST = REDESIGN / "creative-utility-bottom-v11-motion-manifest.json"
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(pixels: np.ndarray) -> Image.Image:
    output = pixels.copy()
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output.astype(np.uint8))


def _authority_path(state: str) -> Path:
    return MOTION / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"


def _recolor_authority(state: str) -> np.ndarray:
    source = np.asarray(Image.open(_authority_path(state)).convert("RGBA"))
    output = source.copy()
    rgb = source[..., :3].astype(np.float32)
    alpha = source[..., 3]
    visible = alpha > 0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    output[..., 0] = np.clip(17.0 + luminance * 0.48, 0, 255).astype(np.uint8)
    output[..., 1] = np.clip(24.0 + luminance * 0.55, 0, 255).astype(np.uint8)
    output[..., 2] = np.clip(12.0 + luminance * 0.30, 0, 255).astype(np.uint8)
    panels = visible & (rgb[..., 2] > rgb[..., 0] * 1.03) & (rgb[..., 2] > rgb[..., 1] * 1.02)
    output[panels, 0] = (output[panels, 0].astype(np.float32) * 0.76).astype(np.uint8)
    output[panels, 1] = (output[panels, 1].astype(np.float32) * 0.84).astype(np.uint8)
    output[panels, 2] = (output[panels, 2].astype(np.float32) * 0.72).astype(np.uint8)
    output[~visible, :3] = 0
    return output


def _subtle_side_trim(pixels: np.ndarray) -> np.ndarray:
    output = pixels.copy()
    for y in range(300, 320):
        visible = np.where(output[y, :, 3] > 24)[0]
        if len(visible) < 3:
            continue
        left, right = int(visible.min()), int(visible.max())
        output[y, left] = 0
        output[y, right] = 0
        output[y, left + 1, 3] = min(int(output[y, left + 1, 3]), 220)
        output[y, right - 1, 3] = min(int(output[y, right - 1, 3]), 220)
    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    if state == "walking_front_f01":
        return build_static().copy()
    pixels = _subtle_side_trim(_recolor_authority(state))
    # All remaining pixels below this point are sparse source-rig tails, not
    # connected garment volume. The shoe begins above/at this contact zone.
    pixels[331:] = 0
    return _clean(pixels)


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def _motion_layer(prefix: str, state: str) -> Image.Image:
    return _load(MOTION / f"room_avatar_{prefix}_{state}.png")


def compose(state: str, bottom: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layers = (
        _motion_layer("base_male_light_v1", state),
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _motion_layer("shoes_male_milk_tea_court_v1", state),
        bottom,
        _motion_layer("top_male_powder_blue_crew_tee_v1", state),
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    for layer in layers:
        output = Image.alpha_composite(output, layer)
    return output


def _checker(size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGBA", size, (249, 247, 249, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, x + 11, y + 11), fill=(226, 222, 226, 255))
    return output


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
