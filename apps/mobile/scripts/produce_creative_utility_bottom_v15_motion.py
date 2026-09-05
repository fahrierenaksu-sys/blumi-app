#!/usr/bin/env python3
"""Build pose-native Creative Utility cargo motion from reviewed generated masters."""

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
    / "candidates/bottom/creative_utility_bottom_v15/generated"
)
OUTPUT_ROOT = REDESIGN / "creative-utility-bottom-v15-motion"
STATUS_OUTPUT_ROOT = (
    REDESIGN
    / "candidates/bottom/creative_utility_bottom/motion-v15"
)
STATIC_CANDIDATE = (
    REDESIGN
    / "candidates/bottom/creative_utility_bottom_v15/rig/"
    "static-review-pose-native-v15.png"
)
BOARD = REDESIGN / "creative-utility-bottom-v15-4w1s-board.png"
MANIFEST = REDESIGN / "creative-utility-bottom-v15-motion-manifest.json"

# F04 shares the same lower-body phase as F02 in the canonical male cycle.
# The dedicated F04 generation flattened that phase and is retained only as a
# rejected provenance artifact; the exact F02 pose-native garment is reused.
SOURCE_STATE = {
    "walking_front_f01": "walking_front_f01",
    "walking_front_f02": "walking_front_f02",
    "walking_front_f03": "walking_front_f03",
    "walking_front_f04": "walking_front_f02",
    "sitting_front_f01": "sitting_front_f01",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _generated_source(state: str) -> Path:
    return GENERATED_ROOT / f"{SOURCE_STATE[state]}-full-generated-alpha.png"


def _authority_alpha(state: str) -> np.ndarray:
    path = MOTION / f"room_avatar_bottom_male_navy_straight_pants_v1_{state}.png"
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24


def shoe_bboxes(state: str) -> list[tuple[int, int, int, int]]:
    boxes = connected_shoe_bboxes(state)
    if len(boxes) == 2:
        return boxes
    shoes = np.asarray(
        Image.open(
            MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png"
        ).convert("RGBA")
    )[..., 3] > 24
    split_boxes: list[tuple[int, int, int, int]] = []
    for half in (slice(0, 128), slice(128, 256)):
        ys, xs = np.where(shoes[:, half])
        if not len(xs):
            raise ValueError(f"{state}: missing shoe pixels for half {half.start}")
        offset = int(half.start)
        split_boxes.append(
            (
                int(xs.min()) + offset,
                int(ys.min()),
                int(xs.max()) + offset + 1,
                int(ys.max()) + 1,
            )
        )
    return split_boxes


def _keep_largest(mask: np.ndarray) -> np.ndarray:
    remaining = mask.copy()
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(remaining)):
        if not remaining[y, x]:
            continue
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        points: list[tuple[int, int]] = []
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
        raise ValueError("generated master contains no green garment")
    output = np.zeros_like(mask)
    for y, x in max(components, key=len):
        output[y, x] = True
    return output


def _extract_generated_garment(state: str) -> Image.Image:
    source = np.asarray(Image.open(_generated_source(state)).convert("RGBA"))
    red = source[..., 0].astype(np.int16)
    green = source[..., 1].astype(np.int16)
    blue = source[..., 2].astype(np.int16)
    alpha = source[..., 3]
    rows = np.arange(source.shape[0])[:, None]

    green_core = (
        (alpha > 16)
        & (rows >= 1000)
        & (green > red + 7)
        & (green > blue + 10)
    )
    expanded = np.asarray(
        Image.fromarray((green_core * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(9)
        )
    ) > 0
    garment_mask = _keep_largest(expanded & (alpha > 0) & (rows >= 1000))

    isolated = source.copy()
    isolated[..., 3] = np.where(garment_mask, alpha, 0).astype(np.uint8)
    isolated[isolated[..., 3] == 0, :3] = 0
    native = Image.fromarray(isolated).resize(CANVAS, Image.Resampling.LANCZOS)
    pixels = np.asarray(native).copy()
    pixels[pixels[..., 3] < 4] = 0
    pixels = _register_contacts(state, pixels)
    largest = _keep_largest(pixels[..., 3] > 0)
    pixels[~largest] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _register_contacts(state: str, pixels: np.ndarray) -> np.ndarray:
    output = pixels.copy()

    # The generated master intentionally extends under the top. Register only
    # the actual waist-contact band to the pose-specific canonical waist.
    authority = _authority_alpha(state)
    allowed_waist = np.asarray(
        Image.fromarray((authority * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(3)
        )
    ) > 0
    for y in range(286, 299):
        output[y, ~allowed_waist[y]] = 0

    return output


def build_frame(state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    return _extract_generated_garment(state)


def _solid(size: tuple[int, int], color: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", size, color)


def render_board(frames: dict[str, Image.Image]) -> None:
    cell_width = 272
    header = 42
    full_height = 320
    contact_height = 176
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
        full_bg = _checker(full.size)
        full_bg.alpha_composite(full)
        board.alpha_composite(full_bg, (x + 31, header))

        contact = combined.crop((76, 252, 180, 352)).resize(
            (208, 168), Image.Resampling.LANCZOS
        )
        checker = _checker(contact.size)
        checker.alpha_composite(contact)
        board.alpha_composite(checker, (x + 32, header + full_height + 4))

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
    STATUS_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames = {state: build_frame(state) for state in STATES}
    files: dict[str, dict[str, str]] = {}
    for state, frame in frames.items():
        destination = OUTPUT_ROOT / f"{state}.png"
        frame.save(destination, optimize=True)
        status_destination = STATUS_OUTPUT_ROOT / f"{state}-v15.png"
        frame.save(status_destination, optimize=True)
        files[state] = {
            "path": _relative(status_destination),
            "sha256": _sha256(status_destination),
        }
    files["static"] = {
        "path": _relative(STATIC_CANDIDATE),
        "sha256": _sha256(STATIC_CANDIDATE),
    }
    render_board(frames)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_motion_pending_visual_and_independent_review",
        "itemId": "creative_utility_bottom",
        "version": "v15",
        "candidateOnly": True,
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": "PENDING",
        "runtimePromoted": False,
        "states": list(STATES),
        "method": "pose-native-per-state-image-generation-plus-green-layer-extraction",
        "sourceState": SOURCE_STATE,
        "generatedMasters": {
            state: {
                "path": _relative(_generated_source(state)),
                "sha256": _sha256(_generated_source(state)),
            }
            for state in STATES
        },
        "frames": files,
        "board": {"path": _relative(BOARD), "sha256": _sha256(BOARD)},
        "independentReview": "PENDING",
        "userApproval": "PENDING",
        "replacesRejectedMotion": "creative-utility-bottom-v14-motion",
        "approvalRecord": (
            "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
            "creative-utility-bottom-v15-user-approval.json"
        ),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
