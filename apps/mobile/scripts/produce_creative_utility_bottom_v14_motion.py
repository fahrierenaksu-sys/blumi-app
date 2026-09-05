#!/usr/bin/env python3
"""Remove only detached alpha specks from independently approved V13 motion."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_v11_motion import REDESIGN, STATES, _authority_path, _checker
from produce_creative_utility_bottom_v13_motion import build_frame as build_v13_frame, compose


REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = REDESIGN / "creative-utility-bottom-v14-motion"
BOARD = REDESIGN / "creative-utility-bottom-v14-4w1s-board.png"
MANIFEST = REDESIGN / "creative-utility-bottom-v14-motion-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _keep_largest_component(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    remaining = pixels[..., 3] > 0
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(remaining)):
        if not remaining[y, x]:
            continue
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        component: list[tuple[int, int]] = []
        while stack:
            cy, cx = stack.pop()
            component.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < remaining.shape[0] and 0 <= nx < remaining.shape[1] and remaining[ny, nx]:
                    remaining[ny, nx] = False
                    stack.append((ny, nx))
        components.append(component)
    if not components:
        raise ValueError("motion frame has no garment component")
    keep = max(components, key=len)
    keep_mask = np.zeros(pixels.shape[:2], dtype=bool)
    for y, x in keep:
        keep_mask[y, x] = True
    pixels[~keep_mask] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def build_frame(state: str) -> Image.Image:
    frame = build_v13_frame(state)
    if state == "walking_front_f01":
        return frame.copy()
    return _keep_largest_component(frame)


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
        "status": "candidate_motion_pending_independent_delta_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "staticApproval": "USER_APPROVED_V11",
        "sourceMotionReview": "V13_PASS",
        "states": list(STATES),
        "method": "v13-motion-largest-connected-alpha-component-only",
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
