#!/usr/bin/env python3
"""Build candidate-only pose-native Colorblock Nylon Track Pants 4W+1S."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from produce_creative_utility_bottom_v13_motion import compose
from produce_soft_parachute_cargo_pants_v9_motion import (
    CANVAS,
    MOTION,
    REDESIGN,
    REPO_ROOT,
    STATES,
    _alpha,
    _checker,
    _generated_foreground,
    _keep_dominant_component,
    _solid,
    shoe_bboxes,
)


GENERATED_ROOT = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants_v7/generated"
)
OUTPUT_ROOT = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants_v7/motion-v7"
)
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants/rig/"
    "static-review-natural-fit-v5.png"
)
BOARD = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants_v7/"
    "colorblock-nylon-track-pants-v7-4w1s-board.png"
)
MANIFEST = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants_v7/"
    "colorblock-nylon-track-pants-v7-motion-manifest.json"
)
REVIEW = (
    REDESIGN
    / "candidates/bottom/colorblock_nylon_track_pants_v7/"
    "colorblock-nylon-track-pants-v7-independent-review.json"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _validated_independent_review(
    files: dict[str, dict[str, str]],
) -> tuple[str, str | None]:
    if not REVIEW.exists():
        return "PENDING", None
    record = json.loads(REVIEW.read_text(encoding="utf-8"))
    if record.get("verdict") != "PASS":
        return "PENDING", None
    if record.get("board", {}).get("sha256") != _sha256(BOARD):
        return "PENDING", None
    reviewed_frames = record.get("frames", {})
    for state in STATES:
        if reviewed_frames.get(state, {}).get("sha256") != files[state]["sha256"]:
            return "PENDING", None
    return "PASS", _relative(REVIEW)


def _generated_source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-garment-isolated-chroma.png"


def _authority_path(state: str) -> Path:
    return (
        MOTION
        / f"room_avatar_bottom_male_colorblock_nylon_track_pants_v1_{state}.png"
    )


def _registered_generated_garment(state: str) -> np.ndarray:
    source = np.asarray(Image.open(_generated_source(state)).convert("RGB"))
    # The F02 image model returned the correct asymmetric step mirrored
    # relative to the canonical cycle. The design is bilaterally symmetric,
    # so orient the pose before any registration instead of deforming a leg.
    if state == "walking_front_f02":
        source = np.flip(source, axis=1).copy()
    foreground = _generated_foreground(source)
    ys, xs = np.where(foreground)
    source_box = (
        int(xs.min()),
        int(ys.min()),
        int(xs.max()) + 1,
        int(ys.max()) + 1,
    )
    authority = _alpha(_authority_path(state))
    target_y, target_x = np.where(authority)
    target_box = (
        int(target_x.min()),
        int(target_y.min()),
        int(target_x.max()) + 1,
        int(target_y.max()) + 1,
    )

    source_height = source_box[3] - source_box[1]
    waist_y = min(source_box[3] - 1, source_box[1] + source_height // 10)
    source_waist_x = np.where(foreground[waist_y])[0]
    _target_waist_y, target_waist_x = np.where(authority[286:300])
    if not len(source_waist_x) or not len(target_waist_x):
        raise ValueError(f"{state}: waist anchors unavailable")
    scale_x = (
        int(target_waist_x.max()) - int(target_waist_x.min()) + 1
    ) / (int(source_waist_x.max()) - int(source_waist_x.min()) + 1)
    target_width = max(1, round((source_box[2] - source_box[0]) * scale_x))
    target_height = target_box[3] - target_box[1]
    target_center_x = (
        int(target_waist_x.min()) + int(target_waist_x.max()) + 1
    ) / 2.0
    target_left = round(target_center_x - target_width / 2.0)
    target_right = target_left + target_width

    crop = Image.fromarray(source).crop(source_box)
    resized = crop.resize(
        (target_width, target_height), Image.Resampling.LANCZOS
    )
    crop_alpha = Image.fromarray(
        (foreground * 255).astype(np.uint8)
    ).crop(source_box).resize(resized.size, Image.Resampling.LANCZOS)
    output = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    output[
        target_box[1] : target_box[3], target_left:target_right, :3
    ] = np.asarray(resized)
    output[
        target_box[1] : target_box[3], target_left:target_right, 3
    ] = np.asarray(crop_alpha)
    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    pixels = _registered_generated_garment(state)
    rgb = pixels[..., :3].astype(np.int16)
    chroma = (
        (rgb[..., 1] > rgb[..., 0] + 18)
        & (rgb[..., 1] > rgb[..., 2] + 18)
    )
    pixels[chroma] = 0
    dominant = _keep_dominant_component(pixels[..., 3] > 0)
    pixels[~dominant] = 0

    authority = _alpha(_authority_path(state))
    waist_allowance = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(5)
        )
    ) > 0
    for y in range(286, 300):
        pixels[y, ~waist_allowance[y]] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def render_board(frames: dict[str, Image.Image]) -> None:
    cell_width, header = 272, 42
    full_height, contact_height = 320, 176
    board = Image.new(
        "RGBA",
        (cell_width * len(STATES), header + full_height + contact_height * 2),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    for index, state in enumerate(STATES):
        x = index * cell_width
        draw.text((x + 10, 14), state, fill=(58, 37, 48, 255))
        combined = compose(state, frames[state])
        full = combined.resize((210, 315), Image.Resampling.LANCZOS)
        checker = _checker(full.size)
        checker.alpha_composite(full)
        board.alpha_composite(checker, (x + 31, header))
        contact = combined.crop((76, 252, 180, 352)).resize(
            (208, 168), Image.Resampling.LANCZOS
        )
        checker_contact = _checker(contact.size)
        checker_contact.alpha_composite(contact)
        board.alpha_composite(
            checker_contact, (x + 32, header + full_height + 4)
        )
        black = _solid(contact.size, (18, 18, 20, 255))
        black.alpha_composite(contact)
        board.alpha_composite(
            black,
            (x + 32, header + full_height + contact_height + 4),
        )
    BOARD.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(BOARD, optimize=True)


def produce() -> dict:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames = {state: build_frame(state) for state in STATES}
    files: dict[str, dict[str, str]] = {}
    for state, frame in frames.items():
        destination = OUTPUT_ROOT / f"{state}-v7.png"
        frame.save(destination, optimize=True)
        files[state] = {
            "path": _relative(destination),
            "sha256": _sha256(destination),
        }
    render_board(frames)
    review_verdict, review_path = _validated_independent_review(files)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": (
            "candidate_motion_pending_explicit_user_approval"
            if review_verdict == "PASS"
            else "candidate_motion_pending_visual_and_independent_review"
        ),
        "itemId": "colorblock_nylon_track_pants",
        "version": "v7",
        "candidateOnly": True,
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": review_verdict,
        "runtimePromoted": False,
        "states": list(STATES),
        "method": (
            "pose-native-per-state-isolated-generation-"
            "waist-centered-canonical-registration"
        ),
        "staticCandidate": {
            "path": _relative(STATIC_CANDIDATE),
            "sha256": _sha256(STATIC_CANDIDATE),
        },
        "isolatedGarmentMasters": {
            state: {
                "path": _relative(_generated_source(state)),
                "sha256": _sha256(_generated_source(state)),
                "provider": "openai-imagegen",
                "seed": "not_provided",
                "requestId": "not_provided",
            }
            for state in STATES
        },
        "frames": files,
        "board": {"path": _relative(BOARD), "sha256": _sha256(BOARD)},
        "independentReview": (
            {"verdict": review_verdict, "path": review_path}
            if review_path
            else "PENDING"
        ),
        "userApproval": "PENDING",
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
