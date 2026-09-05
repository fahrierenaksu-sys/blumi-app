#!/usr/bin/env python3
"""Clean the Creative Utility cuff-to-shoe contact without changing its upper rig."""

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
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v7/rig"
OUTPUT = RIG / "static-review-clean-cuff-contact-rig-v7.png"
COMPOSITE = RIG / "composite-review-clean-cuff-contact-rig-v7.png"
PROOF = REDESIGN / "creative-utility-bottom-clean-cuff-contact-v7-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-clean-cuff-contact-v7-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _cuff_overlay() -> Image.Image:
    scale = 4
    overlay = Image.new("RGBA", (CANVAS[0] * scale, CANVAS[1] * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    def polygon(points: list[tuple[int, int]], fill: tuple[int, int, int, int]) -> None:
        draw.polygon([(x * scale, y * scale) for x, y in points], fill=fill)

    def line(points: list[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 1) -> None:
        draw.line([(x * scale, y * scale) for x, y in points], fill=fill, width=width * scale)

    left = [(100, 320), (126, 320), (126, 324), (123, 328), (104, 328), (100, 324)]
    right = [(129, 320), (155, 320), (155, 324), (152, 328), (133, 328), (129, 324)]
    polygon(left, (77, 96, 50, 255))
    polygon(right, (77, 96, 50, 255))

    # Soft native-style folds; no pale horizontal bar and no hanging cords.
    polygon([(101, 320), (109, 320), (106, 327), (103, 327)], (111, 127, 69, 78))
    polygon([(118, 320), (125, 320), (123, 327), (120, 327)], (42, 57, 31, 72))
    polygon([(130, 320), (137, 320), (135, 327), (133, 327)], (111, 127, 69, 78))
    polygon([(147, 320), (154, 320), (152, 327), (149, 327)], (42, 57, 31, 72))
    line([(102, 325), (124, 325)], (34, 48, 27, 105))
    line([(131, 325), (153, 325)], (34, 48, 27, 105))

    return overlay.resize(CANVAS, Image.Resampling.LANCZOS)


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("shoe-contact authority checksum drift")
    original = np.asarray(build_v6_candidate()).copy()
    base = original.copy()
    base[320:, :] = 0
    cleaned = Image.fromarray(base)
    cleaned = Image.alpha_composite(cleaned, _cuff_overlay())
    output = np.asarray(cleaned).copy()
    output[:320] = original[:320]
    # Resampling can produce subpixel residue; keep only the intentional cuff.
    output[329:, :] = 0
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def render_proof(candidate: Image.Image, combined: Image.Image) -> None:
    full_size = (768, 1152)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    close = combined.crop((94, 308, 162, 340)).resize((816, 384), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("CLEAN CUFF · SHOE CONTACT", _background((816, 384)), close),
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
        "method": "v6-upper-rig-with-redrawn-two-piece-clean-cuff-contact",
        "lockedUpperGeometryThroughRow": 319,
        "removedDefects": ["pale-horizontal-fragment", "left-dangling-strip", "center-dangling-strip", "right-dangling-strip"],
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
