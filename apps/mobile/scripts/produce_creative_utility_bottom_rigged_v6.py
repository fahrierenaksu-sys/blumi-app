#!/usr/bin/env python3
"""Creative Utility trousers using the user-selected natural shoe contact rig."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from produce_creative_utility_bottom_rigged_v5 import _background, composite


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v6/rig"
SOURCE = ROOM / "avatar_room_bottom_male_soft_parachute_cargo_pants_v1.png"
SOURCE_SHA256 = "0dc3879ef6bca5c96e721f6ef6b266b5d0787a30b1962ce83880c7472dd2c64c"
OUTPUT = RIG / "static-review-natural-shoe-contact-rig-v6.png"
COMPOSITE = RIG / "composite-review-natural-shoe-contact-rig-v6.png"
PROOF = REDESIGN / "creative-utility-bottom-natural-shoe-contact-v6-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-natural-shoe-contact-v6-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("user-selected shoe-contact rig checksum drift")
    source = np.asarray(Image.open(SOURCE).convert("RGBA"))
    output = source.copy()
    rgb = source[..., :3].astype(np.float32)
    alpha = source[..., 3]
    visible = alpha > 0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

    # Luminance mapping retains the native folds, gathered cuffs, pockets and
    # shoe-contact shading instead of painting a separate garment on top.
    output[..., 0] = np.clip(17.0 + luminance * 0.48, 0, 255).astype(np.uint8)
    output[..., 1] = np.clip(24.0 + luminance * 0.55, 0, 255).astype(np.uint8)
    output[..., 2] = np.clip(12.0 + luminance * 0.30, 0, 255).astype(np.uint8)

    # Preserve the source's blue utility panels as quieter tonal olive panels.
    panels = visible & (rgb[..., 2] > rgb[..., 0] * 1.03) & (rgb[..., 2] > rgb[..., 1] * 1.02)
    output[panels, 0] = (output[panels, 0].astype(np.float32) * 0.76).astype(np.uint8)
    output[panels, 1] = (output[panels, 1].astype(np.float32) * 0.84).astype(np.uint8)
    output[panels, 2] = (output[panels, 2].astype(np.float32) * 0.72).astype(np.uint8)
    output[~visible, :3] = 0
    return Image.fromarray(output)


def render_proof(candidate: Image.Image, combined: Image.Image) -> None:
    full_size = (768, 1152)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    close = combined.crop((88, 276, 168, 344)).resize((560, 476), Image.Resampling.LANCZOS)
    panels = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("RAW / BLACK", _background(full_size, True), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("WAIST · TWO LEGS · CUFF · SHOE", _background((560, 476)), close),
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
        "method": "user-selected-natural-shoe-contact-rig-with-olive-luminance-reillustration",
        "lockedContacts": ["waist", "two-leg-gap", "gathered-cuff", "shoe-top"],
        "forbiddenOperations": ["external-fashion-paste", "warp", "body-resize", "silhouette-change", "runtime-overwrite"],
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
