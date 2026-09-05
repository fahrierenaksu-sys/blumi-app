#!/usr/bin/env python3
"""Produce pose-native Warm Sand relaxed-baggy pants 4W+1S candidates."""

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
from produce_creative_utility_bottom_v12_motion import (
    shoe_bboxes as connected_shoe_bboxes,
)
from produce_creative_utility_bottom_v13_motion import compose


REPO_ROOT = Path(__file__).resolve().parents[3]
CANVAS = (256, 384)
ROOT = (
    REDESIGN
    / "candidates/bottom/warm_sand_relaxed_pants_v4"
)
GENERATED_ROOT = ROOT / "generated"
OUTPUT_ROOT = ROOT / "motion-v4"
BOARD = ROOT / "warm-sand-relaxed-pants-v4-4w1s-board.png"
MANIFEST = ROOT / "warm-sand-relaxed-pants-v4-motion-manifest.json"
REVIEW = ROOT / "warm-sand-relaxed-pants-v4-independent-review.json"
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/warm_sand_relaxed_pants/rig/"
    "static-review-baseline-v3.png"
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


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


def _source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-garment-alpha.png"


def _authority_path(state: str) -> Path:
    return (
        MOTION
        / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
    )


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("empty alpha mask")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _dominant(mask: np.ndarray) -> np.ndarray:
    remaining = mask.copy()
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(remaining)):
        if not remaining[y, x]:
            continue
        points: list[tuple[int, int]] = []
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        while stack:
            cy, cx = stack.pop()
            points.append((cy, cx))
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if (
                    0 <= ny < mask.shape[0]
                    and 0 <= nx < mask.shape[1]
                    and remaining[ny, nx]
                ):
                    remaining[ny, nx] = False
                    stack.append((ny, nx))
        components.append(points)
    if not components:
        raise ValueError("empty garment")
    output = np.zeros_like(mask)
    for y, x in max(components, key=len):
        output[y, x] = True
    return output


def shoe_bboxes(state: str) -> list[tuple[int, int, int, int]]:
    boxes = connected_shoe_bboxes(state)
    if len(boxes) == 2:
        return boxes
    shoes = _alpha(
        MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
    )
    output: list[tuple[int, int, int, int]] = []
    for start, stop in ((0, 128), (128, 256)):
        ys, xs = np.where(shoes[:, start:stop])
        output.append(
            (
                int(xs.min()) + start,
                int(ys.min()),
                int(xs.max()) + start + 1,
                int(ys.max()) + 1,
            )
        )
    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    source = Image.open(_source(state)).convert("RGBA")
    source_pixels = np.asarray(source)
    source_mask = _dominant(source_pixels[..., 3] > 12)
    source_box = _bbox(source_mask)
    authority = _alpha(_authority_path(state))
    target_box = _bbox(authority)

    cropped = source.crop(source_box)
    cropped_alpha = Image.fromarray(
        (source_mask * 255).astype(np.uint8)
    ).crop(source_box)
    target_size = (
        target_box[2] - target_box[0],
        target_box[3] - target_box[1],
    )
    resized = cropped.resize(target_size, Image.Resampling.LANCZOS)
    resized_alpha = cropped_alpha.resize(
        target_size,
        Image.Resampling.LANCZOS,
    )

    output = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    output[
        target_box[1] : target_box[3],
        target_box[0] : target_box[2],
        :3,
    ] = np.asarray(resized)[..., :3]
    output[
        target_box[1] : target_box[3],
        target_box[0] : target_box[2],
        3,
    ] = np.asarray(resized_alpha)

    waist_allowance = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(5)
        )
    ) > 0
    for y in range(286, 300):
        output[y, ~waist_allowance[y]] = 0
    for x0, shoe_top, x1, _shoe_bottom in shoe_bboxes(state):
        output[shoe_top + 16 :, x0:x1] = 0
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
            (208, 168), Image.Resampling.LANCZOS
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
        destination = OUTPUT_ROOT / f"{state}-v4.png"
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
        "itemId": "warm_sand_relaxed_pants",
        "version": "v4",
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
