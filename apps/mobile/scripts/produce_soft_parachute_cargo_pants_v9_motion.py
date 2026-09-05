#!/usr/bin/env python3
"""Build candidate-only pose-native Soft Parachute cargo 4W+1S frames."""

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
GENERATED_ROOT = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants_v9/generated"
)
OUTPUT_ROOT = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants_v9/motion-v9"
)
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants/rig/"
    "static-review-premium-v8.png"
)
BOARD = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants_v9/"
    "soft-parachute-cargo-pants-v9-4w1s-board.png"
)
MANIFEST = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants_v9/"
    "soft-parachute-cargo-pants-v9-motion-manifest.json"
)
REVIEW = (
    REDESIGN
    / "candidates/bottom/soft_parachute_cargo_pants_v9/"
    "soft-parachute-cargo-pants-v9-independent-review.json"
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


def _full_generated_source(state: str) -> Path:
    return GENERATED_ROOT / f"{state}-full-generated-chroma.png"


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def _authority_path(state: str) -> Path:
    return (
        MOTION
        / f"room_avatar_bottom_male_soft_parachute_cargo_pants_v1_{state}.png"
    )


def _canonical_garment_bbox(state: str) -> tuple[int, int, int, int]:
    ys, xs = np.where(_alpha(_authority_path(state)))
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _generated_foreground(source: np.ndarray) -> np.ndarray:
    rgb = source[..., :3].astype(np.int16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Bright chroma green is the only background. The generous boundary keeps
    # soft garment edge pixels while rejecting green spill.
    chroma = (green > red + 30) & (green > blue + 30) & (green > 120)
    foreground = ~chroma
    foreground = np.asarray(
        Image.fromarray((foreground * 255).astype(np.uint8)).filter(
            ImageFilter.MedianFilter(3)
        )
    ) > 0
    return foreground


def _registered_generated_garment(state: str) -> np.ndarray:
    source = np.asarray(Image.open(_generated_source(state)).convert("RGB"))
    foreground = _generated_foreground(source)
    ys, xs = np.where(foreground)
    source_box = (
        int(xs.min()),
        int(ys.min()),
        int(xs.max()) + 1,
        int(ys.max()) + 1,
    )
    target_box = _canonical_garment_bbox(state)
    source_height = source_box[3] - source_box[1]
    waist_y = min(source_box[3] - 1, source_box[1] + source_height // 10)
    source_waist_x = np.where(foreground[waist_y])[0]
    authority = _alpha(_authority_path(state))
    target_waist_y, target_waist_x = np.where(authority[286:300])
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
        (target_width, target_height),
        Image.Resampling.LANCZOS,
    )
    crop_alpha = Image.fromarray((foreground * 255).astype(np.uint8)).crop(
        source_box
    ).resize(resized.size, Image.Resampling.LANCZOS)
    registered = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    registered[
        target_box[1] : target_box[3],
        target_left:target_right,
        :3,
    ] = np.asarray(resized)
    registered[
        target_box[1] : target_box[3],
        target_left:target_right,
        3,
    ] = np.asarray(crop_alpha)
    return registered


def shoe_bboxes(state: str) -> list[tuple[int, int, int, int]]:
    boxes = connected_shoe_bboxes(state)
    if len(boxes) == 2:
        return boxes
    shoes = _alpha(
        MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
    )
    output: list[tuple[int, int, int, int]] = []
    for half in (slice(0, 128), slice(128, 256)):
        ys, xs = np.where(shoes[:, half])
        offset = int(half.start)
        output.append(
            (
                int(xs.min()) + offset,
                int(ys.min()),
                int(xs.max()) + offset + 1,
                int(ys.max()) + 1,
            )
        )
    return output


def _keep_dominant_component(mask: np.ndarray) -> np.ndarray:
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
        raise ValueError("empty garment mask")
    dominant = np.zeros_like(mask)
    for y, x in max(components, key=len):
        dominant[y, x] = True
    return dominant


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    registered = _registered_generated_garment(state)
    rgb = registered[..., :3].astype(np.int16)
    chroma_residue = (
        (rgb[..., 1] > rgb[..., 0] + 18)
        & (rgb[..., 1] > rgb[..., 2] + 18)
    )
    registered[chroma_residue] = 0
    dominant = _keep_dominant_component(registered[..., 3] > 0)
    registered[~dominant] = 0
    authority = _alpha(_authority_path(state))
    waist_allowance = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(5)
        )
    ) > 0
    for y in range(286, 300):
        registered[y, ~waist_allowance[y]] = 0
    registered[registered[..., 3] == 0, :3] = 0
    return Image.fromarray(registered)


def _solid(
    size: tuple[int, int], color: tuple[int, int, int, int]
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
        destination = OUTPUT_ROOT / f"{state}-v9.png"
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
        "itemId": "soft_parachute_cargo_pants",
        "version": "v9",
        "candidateOnly": True,
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": review_verdict,
        "runtimePromoted": False,
        "states": list(STATES),
        "method": (
            "pose-native-per-state-generation-chroma-extraction-"
            "canonical-contact-envelope-registration"
        ),
        "staticCandidate": {
            "path": _relative(STATIC_CANDIDATE),
            "sha256": _sha256(STATIC_CANDIDATE),
        },
        "generatedMasters": {
            state: {
                "path": _relative(_full_generated_source(state)),
                "sha256": _sha256(_full_generated_source(state)),
                "provider": "openai-imagegen",
                "seed": "not_provided",
                "requestId": "not_provided",
            }
            for state in STATES
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
