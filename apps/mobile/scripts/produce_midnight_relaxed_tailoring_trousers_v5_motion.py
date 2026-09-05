#!/usr/bin/env python3
"""Produce pose-native Midnight relaxed-tailoring trousers 4W+1S candidates."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from produce_creative_utility_bottom_v11_motion import (
    MOTION,
    REDESIGN,
    STATES,
    _checker,
)
from produce_creative_utility_bottom_v13_motion import compose
from produce_warm_sand_relaxed_pants_v4_motion import (
    _bbox,
    _dominant,
    shoe_bboxes,
)
from register_male_keyed_rig_edit import (
    cleanup_alpha_components,
    extract_keyed_foreground,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
CANVAS = (256, 384)
ROOT = (
    REDESIGN
    / "candidates/bottom/midnight_relaxed_tailoring_trousers_v5"
)
GENERATED_ROOT = ROOT / "generated"
OUTPUT_ROOT = ROOT / "motion-v5"
BOARD = ROOT / "midnight-relaxed-tailoring-trousers-v5-4w1s-board.png"
MANIFEST = ROOT / "midnight-relaxed-tailoring-trousers-v5-motion-manifest.json"
REVIEW = ROOT / "midnight-relaxed-tailoring-trousers-v5-independent-review.json"
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/midnight_relaxed_tailoring_trousers/rig/"
    "static-review-baseline-v3.png"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _chroma_source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-garment-chroma.png"


def _source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-garment-alpha.png"


def prepare_sources() -> None:
    for state in STATES:
        keyed = extract_keyed_foreground(
            Image.open(_chroma_source(state)).convert("RGBA")
        )
        cleaned = cleanup_alpha_components(keyed, min_pixel_count=2000)
        pixels = np.asarray(cleaned).copy()
        pixels[pixels[..., 3] == 0, :3] = 0
        Image.fromarray(pixels).save(_source(state), optimize=True)


def _validated_independent_review(
    files: dict[str, dict[str, str]],
) -> tuple[str, str | None]:
    if not REVIEW.is_file():
        return "PENDING", None
    record = json.loads(REVIEW.read_text(encoding="utf-8"))
    if record.get("verdict") != "PASS":
        return "PENDING", None
    if record.get("board", {}).get("sha256") != _sha256(BOARD):
        return "PENDING", None
    reviewed = record.get("frames", {})
    for state in STATES:
        if reviewed.get(state, {}).get("sha256") != files[state]["sha256"]:
            return "PENDING", None
    return "PASS", _relative(REVIEW)


def _authority_path(state: str) -> Path:
    return (
        MOTION
        / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
    )


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _place_source(
    source: Image.Image,
    source_mask: np.ndarray,
    target: tuple[int, int, int, int],
) -> np.ndarray:
    source_box = _bbox(source_mask)
    left, top, right, bottom = target
    target_size = (right - left, bottom - top)
    garment = source.crop(source_box).resize(
        target_size,
        Image.Resampling.LANCZOS,
    )
    alpha = Image.fromarray(
        (source_mask * 255).astype(np.uint8)
    ).crop(source_box).resize(target_size, Image.Resampling.LANCZOS)
    output = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    output[top:bottom, left:right, :3] = np.asarray(garment)[..., :3]
    output[top:bottom, left:right, 3] = np.asarray(alpha)
    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    source = Image.open(_source(state)).convert("RGBA")
    source_pixels = np.asarray(source)
    source_mask = _dominant(source_pixels[..., 3] > 12)
    authority = _alpha(_authority_path(state))
    authority_box = _bbox(authority)
    shoes = shoe_bboxes(state)

    width_factor = 0.88 if state == "sitting_front_f01" else 0.82
    target_width = max(
        1,
        round((authority_box[2] - authority_box[0]) * width_factor),
    )
    target_center = (authority_box[0] + authority_box[2]) / 2.0
    target_left = round(target_center - target_width / 2.0)
    target_right = target_left + target_width
    target_bottom = max(shoe_top + 12 for _x0, shoe_top, _x1, _b in shoes)
    output = _place_source(
        source,
        source_mask,
        (target_left, authority_box[1], target_right, target_bottom),
    )

    candidate = output[286:300, :, 3] > 24
    _cy, candidate_x = np.where(candidate)
    _ay, authority_x = np.where(authority[286:300])
    shift = round(float(authority_x.mean() - candidate_x.mean()))
    if shift:
        shifted = np.zeros_like(output)
        if shift > 0:
            shifted[:, shift:] = output[:, :-shift]
        else:
            shifted[:, :shift] = output[:, -shift:]
        output = shifted

    waist_allowance = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(5)
        )
    ) > 0
    for y in range(286, 300):
        output[y, ~waist_allowance[y]] = 0

    for x0, shoe_top, x1, _shoe_bottom in shoes:
        center = (x0 + x1 - 1) / 2.0
        half_width = max((x1 - x0) / 2.0, 1.0)
        for x in range(x0, x1):
            distance = abs(x - center) / half_width
            hem_bottom = shoe_top + round(7 + 4 * distance * distance)
            output[hem_bottom + 1 :, x] = 0

    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


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
            checker_contact,
            (x + 32, header + full_height + 4),
        )
        black = Image.new("RGBA", contact.size, (18, 18, 20, 255))
        black.alpha_composite(contact)
        board.alpha_composite(
            black,
            (x + 32, header + full_height + contact_height + 4),
        )
    board.convert("RGB").save(BOARD, optimize=True)


def produce() -> dict:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    prepare_sources()
    frames = {state: build_frame(state) for state in STATES}
    files: dict[str, dict[str, str]] = {}
    for state, frame in frames.items():
        destination = OUTPUT_ROOT / f"{state}-v5.png"
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
            "candidate_motion_independent_pass_pending_runtime_policy"
            if review_verdict == "PASS"
            else "candidate_motion_pending_visual_and_independent_review"
        ),
        "itemId": "midnight_relaxed_tailoring_trousers",
        "version": "v5",
        "candidateOnly": True,
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": review_verdict,
        "runtimePromoted": False,
        "states": list(STATES),
        "method": (
            "pose-native-per-state-imagegen-chroma-alpha-"
            "slim-straight-canonical-contact-registration"
        ),
        "staticCandidate": {
            "path": _relative(STATIC_CANDIDATE),
            "sha256": _sha256(STATIC_CANDIDATE),
        },
        "generatedMasters": {
            state: {
                "chromaPath": _relative(_chroma_source(state)),
                "chromaSha256": _sha256(_chroma_source(state)),
                "alphaPath": _relative(_source(state)),
                "alphaSha256": _sha256(_source(state)),
                "provider": "openai-imagegen",
                "seed": "not_provided",
                "requestId": "not_provided",
            }
            for state in STATES
        },
        "frames": files,
        "board": {
            "path": _relative(BOARD),
            "sha256": _sha256(BOARD),
        },
        "independentReview": (
            {"verdict": review_verdict, "path": review_path}
            if review_path
            else "PENDING"
        ),
        "userApproval": "PENDING",
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
