#!/usr/bin/env python3
"""Create two tapered Creative Utility cuffs that settle on individual shoes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v5 import _background, composite
from produce_creative_utility_bottom_rigged_v6 import (
    SOURCE,
    SOURCE_SHA256,
    build_candidate as build_v6_candidate,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v9/rig"
OUTPUT = RIG / "static-review-two-tapered-cuffs-rig-v9.png"
COMPOSITE = RIG / "composite-review-two-tapered-cuffs-rig-v9.png"
PROOF = REDESIGN / "creative-utility-bottom-two-tapered-cuffs-v9-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-two-tapered-cuffs-v9-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _nearest_native_rgb(original: np.ndarray, y: int, x: int, start: int, end: int) -> np.ndarray:
    visible = np.where(original[y, start:end, 3] > 24)[0] + start
    if len(visible):
        nearest = int(visible[np.abs(visible - x).argmin()])
        return original[y, nearest, :3]
    return np.asarray((76, 94, 48), dtype=np.uint8)


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("shoe-contact authority checksum drift")
    original = np.asarray(build_v6_candidate()).copy()
    output = original.copy()
    output[320:] = 0

    shapes = {
        320: ((98, 127), (129, 156)),
        321: ((99, 127), (129, 155)),
        322: ((100, 126), (130, 154)),
        323: ((101, 125), (131, 153)),
        324: ((104, 124), (132, 150)),
        325: ((108, 123), (134, 146)),
        326: ((111, 121), (136, 144)),
    }
    for y, legs in shapes.items():
        for start, end in legs:
            for x in range(start, end):
                output[y, x, :3] = _nearest_native_rgb(original, y, x, start, end)
                distance = min(x - start, end - 1 - x)
                output[y, x, 3] = 160 if distance == 0 else (232 if distance == 1 else 255)

    # Gentle central fold shading keeps the taper fabric-like rather than a
    # flat geometric bar while preserving separate left/right silhouettes.
    output[320:325, 121:125, :3] = (output[320:325, 121:125, :3].astype(np.float32) * 0.88).astype(np.uint8)
    output[320:325, 131:135, :3] = (output[320:325, 131:135, :3].astype(np.float32) * 0.88).astype(np.uint8)
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def render_proof(candidate: Image.Image, combined: Image.Image) -> None:
    full_size = (768, 1152)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    close = combined.crop((94, 307, 162, 340)).resize((816, 396), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("TWO TAPERED CUFFS · SHOE CONTACT", _background((816, 396)), close),
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
        "method": "v6-upper-rig-with-two-separate-tapered-native-texture-cuffs",
        "lockedUpperGeometryThroughRow": 319,
        "shoeContactRows": [325, 326],
        "removedDefects": ["detached-fragments", "internal-cuff-holes", "flat-horizontal-band", "geometric-loop"],
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
