#!/usr/bin/env python3
"""Re-illustrate Creative Utility on a proven full-length utility rig."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v5/rig"
SOURCE = ROOM / "avatar_room_bottom_male_straight_utility_tailored_trousers_v1.png"
SOURCE_SHA256 = "6b97b5d6a53147f5d5431113eef678477eee2c94cfc568b42bface66c710e5fc"
OUTPUT = RIG / "static-review-full-length-utility-rig-v5.png"
COMPOSITE = RIG / "composite-review-full-length-utility-rig-v5.png"
PROOF = REDESIGN / "creative-utility-bottom-full-length-rig-v5-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-full-length-rig-v5-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("full-length utility rig checksum drift")
    source = np.asarray(Image.open(SOURCE).convert("RGBA"))
    output = source.copy()
    rgb = source[..., :3].astype(np.float32)
    alpha = source[..., 3]
    visible = alpha > 0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

    # Preserve every native seam, fold, pocket and highlight by remapping
    # luminance rather than repainting over the source texture.
    output[..., 0] = np.clip(18.0 + luminance * 0.43, 0, 255).astype(np.uint8)
    output[..., 1] = np.clip(24.0 + luminance * 0.50, 0, 255).astype(np.uint8)
    output[..., 2] = np.clip(12.0 + luminance * 0.27, 0, 255).astype(np.uint8)

    # Existing utility pocket panels receive a restrained tonal distinction,
    # still entirely inside the locked source alpha.
    pocket = visible & (rgb[..., 1] > rgb[..., 0] * 1.04)
    output[pocket, 0] = (output[pocket, 0].astype(np.float32) * 0.80).astype(np.uint8)
    output[pocket, 1] = (output[pocket, 1].astype(np.float32) * 0.88).astype(np.uint8)
    output[pocket, 2] = (output[pocket, 2].astype(np.float32) * 0.76).astype(np.uint8)
    output[~visible, :3] = 0
    return Image.fromarray(output)


def _load(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


def composite(candidate: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load("avatar_room_base_male_light_v1.png"),
        _load("avatar_room_face_male_warm_friendly_v1.png"),
        _load("avatar_room_shoes_male_milk_tea_court_v1.png"),
        candidate,
        _load("avatar_room_top_male_cream_basic_tee_v1.png"),
        _load("avatar_room_hair_front_male_espresso_crop_v1.png"),
    ):
        output = Image.alpha_composite(output, layer)
    return output


def _background(size: tuple[int, int], dark: bool = False) -> Image.Image:
    if dark:
        return Image.new("RGBA", size, (12, 13, 15, 255))
    output = Image.new("RGBA", size, (250, 247, 249, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], 14):
        for x in range(0, size[0], 14):
            if (x // 14 + y // 14) % 2:
                draw.rectangle((x, y, x + 13, y + 13), fill=(226, 222, 226, 255))
    return output


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
        ("WAIST · CROTCH · LEG · HEM · SHOE", _background((560, 476)), close),
    ):
        background.alpha_composite(art)
        panels.append((label, background))
    header = 48
    board = Image.new("RGBA", (sum(p.width for _, p in panels), 1200), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    x = 0
    for label, panel in panels:
        draw.text((x + 12, 16), label, fill=(58, 37, 48, 255))
        board.alpha_composite(panel, (x, header))
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
        "family": "male_full_length_utility_trouser",
        "rigAuthority": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "method": "full-length-utility-alpha-and-texture-authority-with-olive-luminance-reillustration",
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
