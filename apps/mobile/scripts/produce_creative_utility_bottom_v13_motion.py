#!/usr/bin/env python3
"""Rig approved V11 by shearing each leg from a fixed waist to pose shoes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v11 import build_candidate as build_static
from produce_creative_utility_bottom_v11_motion import MOTION, REDESIGN, STATES, _authority_path, _checker
from produce_creative_utility_bottom_v12_motion import shoe_bboxes


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
OUTPUT_ROOT = REDESIGN / "creative-utility-bottom-v13-motion"
BOARD = REDESIGN / "creative-utility-bottom-v13-4w1s-board.png"
MANIFEST = REDESIGN / "creative-utility-bottom-v13-motion-manifest.json"
CANVAS = (256, 384)
ANCHOR_Y = 298
SOURCE_CONTACT_Y = 326
SOURCE_SHOE_CENTERS = (116.0, 140.0)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _transform_half(source: Image.Image, half_index: int, target_center: float, target_contact_y: int) -> Image.Image:
    pixels = np.asarray(source).copy()
    if half_index == 0:
        pixels[:, 128:] = 0
    else:
        pixels[:, :128] = 0
    pixels[:ANCHOR_Y] = 0
    half = Image.fromarray(pixels).resize((1024, 1536), Image.Resampling.LANCZOS)

    delta_x = target_center - SOURCE_SHOE_CENTERS[half_index]
    scale_y = (target_contact_y - ANCHOR_Y) / (SOURCE_CONTACT_Y - ANCHOR_Y)
    shear_x = delta_x / (SOURCE_CONTACT_Y - ANCHOR_Y)
    anchor = ANCHOR_Y * 4.0
    inverse_shear = shear_x / scale_y
    transformed = half.transform(
        half.size,
        Image.Transform.AFFINE,
        (
            1.0,
            -inverse_shear,
            inverse_shear * anchor,
            0.0,
            1.0 / scale_y,
            anchor * (1.0 - 1.0 / scale_y),
        ),
        Image.Resampling.BICUBIC,
    ).resize(CANVAS, Image.Resampling.LANCZOS)
    transformed_pixels = np.asarray(transformed).copy()
    half_slice = slice(0, 128) if half_index == 0 else slice(128, 256)
    transformed_pixels[target_contact_y + 3 :, half_slice] = 0
    transformed_pixels[transformed_pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(transformed_pixels)


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    source = build_static().convert("RGBA")
    if state == "walking_front_f01":
        return source.copy()
    boxes = shoe_bboxes(state)
    if len(boxes) != 2:
        raise ValueError(f"{state}: expected two shoe components")

    lower = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for index, (x0, y0, x1, _y1) in enumerate(boxes):
        center = (x0 + x1 - 1) / 2.0
        lower = Image.alpha_composite(lower, _transform_half(source, index, center, y0))

    output = np.asarray(lower).copy()
    static_pixels = np.asarray(source)
    output[:ANCHOR_Y] = static_pixels[:ANCHOR_Y]
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def _motion_layer(prefix: str, state: str) -> Image.Image:
    return _load(MOTION / f"room_avatar_{prefix}_{state}.png")


def compose(state: str, bottom: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _motion_layer("base_male_light_v1", state),
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _motion_layer("shoes_male_milk_tea_court_v1", state),
        bottom,
        _motion_layer("top_male_cream_basic_tee_v1", state),
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    ):
        output = Image.alpha_composite(output, layer)
    return _clean(output)


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
        "method": "approved-static-two-half-waist-anchored-shoe-targeted-shear-rig",
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
