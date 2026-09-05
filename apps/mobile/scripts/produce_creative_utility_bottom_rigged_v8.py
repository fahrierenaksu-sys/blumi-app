#!/usr/bin/env python3
"""Finalize Creative Utility with a solid two-piece cuff-to-shoe contact band."""

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
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v8/rig"
OUTPUT = RIG / "static-review-solid-cuff-contact-rig-v8.png"
COMPOSITE = RIG / "composite-review-solid-cuff-contact-rig-v8.png"
PROOF = REDESIGN / "creative-utility-bottom-solid-cuff-contact-v8-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-solid-cuff-contact-v8-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("shoe-contact authority checksum drift")
    output = np.asarray(build_v6_candidate()).copy()

    # Replace the authority's perforated last rows with two compact tapered
    # cuffs. They end exactly one row above the first visible shoe pixels.
    output[323:326, 96:160] = 0
    cuff_rows = (
        (323, (101, 127), (129, 155), (82, 101, 52)),
        (324, (102, 127), (129, 154), (76, 94, 48)),
        (325, (104, 127), (129, 152), (68, 85, 43)),
    )
    for y, left, right, color in cuff_rows:
        for start, end in (left, right):
            center = (start + end - 1) / 2.0
            radius = max((end - start) / 2.0, 1.0)
            for x in range(start, end):
                highlight = int(round(8.0 * (1.0 - abs(x - center) / radius)))
                output[y, x, :3] = (
                    color[0] + highlight,
                    color[1] + highlight,
                    color[2] + highlight // 2,
                )
                output[y, x, 3] = 255
    output[326:] = 0
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def render_proof(candidate: Image.Image, combined: Image.Image) -> None:
    full_size = (768, 1152)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    close = combined.crop((94, 307, 162, 338)).resize((816, 372), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("SOLID CUFF · NATURAL SHOE CONTACT", _background((816, 372)), close),
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
        "method": "v6-rig-with-solid-two-piece-cuff-band-and-fragment-removal",
        "lockedUpperGeometryThroughRow": 322,
        "shoeContactRow": 325,
        "removedDefects": ["pale-gap-band", "all-detached-pixels-below-contact-row"],
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
