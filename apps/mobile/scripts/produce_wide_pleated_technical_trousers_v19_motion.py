#!/usr/bin/env python3
"""Produce pose-native Wide Pleated Technical Trousers 4W+1S candidates."""

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


REPO_ROOT = Path(__file__).resolve().parents[3]
CANVAS = (256, 384)
ROOT = (
    REDESIGN
    / "candidates/bottom/wide_pleated_technical_trousers_v19"
)
GENERATED_ROOT = ROOT / "generated"
OUTPUT_ROOT = ROOT / "motion-v19"
BOARD = ROOT / "wide-pleated-technical-trousers-v19-4w1s-board.png"
MANIFEST = ROOT / "wide-pleated-technical-trousers-v19-motion-manifest.json"
REVIEW = ROOT / "wide-pleated-technical-trousers-v19-independent-review.json"
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/wide_pleated_technical_trousers/rig/"
    "static-review-natural-fit-v18.png"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-garment-alpha.png"


def _authority_path(state: str) -> Path:
    return (
        MOTION
        / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
    )


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _validated_independent_review(
    files: dict[str, dict[str, str]],
) -> tuple[str, str | None]:
    if not REVIEW.is_file():
        return "PENDING", None
    record = json.loads(REVIEW.read_text(encoding="utf-8"))
    if record.get("verdict") == "FAIL":
        return "FAIL", _relative(REVIEW)
    if record.get("verdict") != "PASS":
        return "PENDING", None
    if record.get("board", {}).get("sha256") != _sha256(BOARD):
        return "PENDING", None
    reviewed = record.get("frames", {})
    for state in STATES:
        if reviewed.get(state, {}).get("sha256") != files[state]["sha256"]:
            return "PENDING", None
    return "PASS", _relative(REVIEW)


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    source = Image.open(_source(state)).convert("RGBA")
    source_pixels = np.asarray(source)
    source_mask = _dominant(source_pixels[..., 3] > 12)
    source_box = _bbox(source_mask)
    authority = _alpha(_authority_path(state))
    target_box = _bbox(authority)
    target_left = max(0, target_box[0] - 2)
    target_right = min(CANVAS[0], target_box[2] + 2)
    target_size = (
        target_right - target_left,
        target_box[3] - target_box[1],
    )

    cropped = source.crop(source_box).resize(
        target_size,
        Image.Resampling.LANCZOS,
    )
    cropped_alpha = Image.fromarray(
        (source_mask * 255).astype(np.uint8)
    ).crop(source_box).resize(target_size, Image.Resampling.LANCZOS)

    output = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    output[
        target_box[1] : target_box[3],
        target_left:target_right,
        :3,
    ] = np.asarray(cropped)[..., :3]
    output[
        target_box[1] : target_box[3],
        target_left:target_right,
        3,
    ] = np.asarray(cropped_alpha)

    candidate_waist = output[286:300, :, 3] > 24
    _candidate_y, candidate_x = np.where(candidate_waist)
    _authority_y, authority_x = np.where(authority[286:300])
    horizontal_shift = round(
        float(authority_x.mean() - candidate_x.mean())
    )
    if horizontal_shift:
        shifted = np.zeros_like(output)
        if horizontal_shift > 0:
            shifted[:, horizontal_shift:] = output[:, :-horizontal_shift]
        else:
            shifted[:, :horizontal_shift] = output[:, -horizontal_shift:]
        output = shifted

    waist_allowance = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(5)
        )
    ) > 0
    for y in range(286, 300):
        output[y, ~waist_allowance[y]] = 0
    for x0, shoe_top, x1, _shoe_bottom in shoe_bboxes(state):
        output[shoe_top + 8 :, x0:x1] = 0
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def _solid(
    size: tuple[int, int],
    color: tuple[int, int, int, int],
) -> Image.Image:
    return Image.new("RGBA", size, color)


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
            (208, 168),
            Image.Resampling.LANCZOS,
        )
        checker_contact = _checker(contact.size)
        checker_contact.alpha_composite(contact)
        board.alpha_composite(
            checker_contact,
            (x + 32, header + full_height + 4),
        )
        black = _solid(contact.size, (18, 18, 20, 255))
        black.alpha_composite(contact)
        board.alpha_composite(
            black,
            (x + 32, header + full_height + contact_height + 4),
        )
    board.convert("RGB").save(BOARD, optimize=True)


def produce() -> dict:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames = {state: build_frame(state) for state in STATES}
    files: dict[str, dict[str, str]] = {}
    for state, frame in frames.items():
        destination = OUTPUT_ROOT / f"{state}-v19.png"
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
            else "rejected_by_independent_visual_review"
            if review_verdict == "FAIL"
            else "candidate_motion_pending_visual_and_independent_review"
        ),
        "itemId": "wide_pleated_technical_trousers",
        "version": "v19",
        "candidateOnly": True,
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": review_verdict,
        "runtimePromoted": False,
        "states": list(STATES),
        "method": (
            "pose-native-per-state-imagegen-alpha-extraction-"
            "canonical-contact-envelope-registration"
        ),
        "staticCandidate": {
            "path": _relative(STATIC_CANDIDATE),
            "sha256": _sha256(STATIC_CANDIDATE),
        },
        "generatedMasters": {
            state: {
                "path": _relative(_source(state)),
                "sha256": _sha256(_source(state)),
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
