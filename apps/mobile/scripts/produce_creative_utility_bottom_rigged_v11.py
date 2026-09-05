#!/usr/bin/env python3
"""Reduce Creative Utility side volume by one pixel without changing contacts."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v5 import _background, composite
from produce_creative_utility_bottom_rigged_v6 import SOURCE, SOURCE_SHA256
from produce_creative_utility_bottom_rigged_v10 import build_candidate as build_v10_candidate


REPO_ROOT = Path(__file__).resolve().parents[3]
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v11/rig"
OUTPUT = RIG / "static-review-subtle-volume-reduction-rig-v11.png"
COMPOSITE = RIG / "composite-review-subtle-volume-reduction-rig-v11.png"
PROOF = REDESIGN / "creative-utility-bottom-subtle-volume-reduction-v11-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-subtle-volume-reduction-v11-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("shoe-contact authority checksum drift")
    output = np.asarray(build_v10_candidate()).copy()
    for y in range(300, 320):
        visible = np.where(output[y, :, 3] > 24)[0]
        if len(visible) < 3:
            continue
        left, right = int(visible.min()), int(visible.max())
        output[y, left] = 0
        output[y, right] = 0
        output[y, left + 1, 3] = min(int(output[y, left + 1, 3]), 220)
        output[y, right - 1, 3] = min(int(output[y, right - 1, 3]), 220)
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def render_proof(before: Image.Image, candidate: Image.Image, combined: Image.Image) -> None:
    before_full = composite(before).resize((768, 1152), Image.Resampling.LANCZOS)
    after_full = combined.resize((768, 1152), Image.Resampling.LANCZOS)
    close = combined.crop((88, 292, 168, 340)).resize((800, 480), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("V10 / BEFORE", _background((768, 1152)), before_full),
        ("V11 / SUBTLE SIDE REDUCTION", _background((768, 1152)), after_full),
        ("WAIST LOCKED · SHOE DRAPE LOCKED", _background((800, 480)), close),
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
    before = build_v10_candidate()
    candidate = build_candidate()
    combined = composite(candidate)
    RIG.mkdir(parents=True, exist_ok=True)
    candidate.save(OUTPUT, optimize=True)
    combined.save(COMPOSITE, optimize=True)
    render_proof(before, candidate, combined)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_static_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "family": "male_relaxed_utility_cargo",
        "rigAuthority": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "method": "v10-shoe-drape-with-one-pixel-side-volume-reduction",
        "trimRows": [300, 319],
        "trimPerSidePixels": 1,
        "lockedContacts": ["waist", "center-gap", "curved-shoe-drape"],
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
