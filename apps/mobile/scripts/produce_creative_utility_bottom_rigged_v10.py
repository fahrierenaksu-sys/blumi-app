#!/usr/bin/env python3
"""Drape Creative Utility cuffs shallowly over each shoe tongue."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v5 import _background, composite
from produce_creative_utility_bottom_rigged_v6 import SOURCE, SOURCE_SHA256
from produce_creative_utility_bottom_rigged_v9 import build_candidate as build_v9_candidate


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v10/rig"
OUTPUT = RIG / "static-review-curved-shoe-drape-rig-v10.png"
COMPOSITE = RIG / "composite-review-curved-shoe-drape-rig-v10.png"
PROOF = REDESIGN / "creative-utility-bottom-curved-shoe-drape-v10-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-curved-shoe-drape-v10-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _texture_from_upper(original: np.ndarray, x: int, start: int, end: int) -> np.ndarray:
    row = original[324]
    visible = np.where(row[start:end, 3] > 24)[0] + start
    if len(visible):
        nearest = int(visible[np.abs(visible - x).argmin()])
        return row[nearest, :3]
    return np.asarray((74, 92, 47), dtype=np.uint8)


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("shoe-contact authority checksum drift")
    original = np.asarray(build_v9_candidate()).copy()
    output = original.copy()
    output[325:] = 0

    # Each side makes a shallow three-row curve over its own shoe tongue.
    drape = {
        325: ((106, 125), (131, 150)),
        326: ((108, 124), (132, 148)),
        327: ((111, 122), (135, 145)),
    }
    for y, legs in drape.items():
        for start, end in legs:
            center = (start + end - 1) / 2.0
            for x in range(start, end):
                rgb = _texture_from_upper(original, x, start, end).astype(np.float32)
                fold = 1.0 + 0.07 * (1.0 - abs(x - center) / max((end - start) / 2.0, 1.0))
                output[y, x, :3] = np.clip(rgb * fold, 0, 255).astype(np.uint8)
                edge = min(x - start, end - 1 - x)
                output[y, x, 3] = 144 if edge == 0 else (224 if edge == 1 else 255)

    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def render_proof(candidate: Image.Image, combined: Image.Image) -> None:
    full_size = (768, 1152)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    close = combined.crop((100, 314, 156, 341)).resize((896, 432), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("CURVED CUFF DRAPE · SHOE TONGUE", _background((896, 432)), close),
    ):
        background.alpha_composite(art)
        panels.append((label, background))
    board = Image.new("RGBA", (sum(p.width for _, p in panels), 1200), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    x = 0
    for label, panel in panels:
        draw.text((x + 12, 16), label, fill=(58, 37, 48, 255))
        board.alpha_composite(panel, (x, 48))
        x += panel.width
    board.convert("RGB").save(PROOF, optimize=True)


def produce() -> dict:
    candidate = build_candidate()
    combined = composite(candidate)
    RIG.mkdir(parents=True, exist_ok=True)
    candidate.save(OUTPUT, optimize=True)
    combined.save(COMPOSITE, optimize=True)
    render_proof(candidate, combined)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_static_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "family": "male_relaxed_utility_cargo",
        "rigAuthority": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "method": "v9-fit-with-two-shallow-curved-cuffs-draped-over-shoe-tongues",
        "lockedUpperGeometryThroughRow": 324,
        "shoeDrapeRows": [325, 326, 327],
        "candidate": {"path": _relative(OUTPUT), "sha256": _sha256(OUTPUT)},
        "composite": {"path": _relative(COMPOSITE), "sha256": _sha256(COMPOSITE)},
        "proof": {"path": _relative(PROOF), "sha256": _sha256(PROOF)},
        "independentReview": "PENDING",
        "explicitUserApproval": False,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
