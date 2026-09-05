#!/usr/bin/env python3
"""Re-illustrate Creative Utility trousers on a proven canonical cargo rig.

The alpha geometry comes from the approved same-family male cargo authority.
Only garment color/material art is re-authored; no external fashion image,
warp, scaling, body replacement, or runtime asset is used.
"""

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
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v3/rig"
SOURCE = ROOM / "avatar_room_bottom_male_soft_parachute_cargo_pants_v1.png"
SOURCE_SHA256 = "0dc3879ef6bca5c96e721f6ef6b266b5d0787a30b1962ce83880c7472dd2c64c"
OUTPUT = RIG / "static-review-canonical-cargo-rig-v3.png"
COMPOSITE = RIG / "composite-review-canonical-cargo-rig-v3.png"
PROOF = REDESIGN / "creative-utility-bottom-canonical-rig-v3-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-canonical-rig-v3-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _palette_map(luminance: np.ndarray, shadow: tuple[int, int, int], light: tuple[int, int, int]) -> np.ndarray:
    level = np.clip((luminance - 35.0) / 195.0, 0.0, 1.0)[..., None]
    low = np.asarray(shadow, dtype=np.float32)
    high = np.asarray(light, dtype=np.float32)
    return np.clip(low + (high - low) * level, 0, 255).astype(np.uint8)


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("canonical cargo authority checksum drift")
    pixels = np.asarray(Image.open(SOURCE).convert("RGBA")).copy()
    rgb = pixels[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    visible = pixels[..., 3] > 0

    # Existing cool pocket/panel artwork becomes a restrained darker utility
    # accent. The painterly luminance and stitching remain native to the rig.
    cool_panel = visible & (rgb[..., 2] > rgb[..., 0] * 1.03) & (rgb[..., 2] > rgb[..., 1] * 1.02)
    base = visible & ~cool_panel
    base_art = _palette_map(luminance, (47, 54, 25), (151, 145, 76))
    panel_art = _palette_map(luminance, (38, 47, 27), (111, 122, 68))
    pixels[base, :3] = base_art[base]
    pixels[cool_panel, :3] = panel_art[cool_panel]
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load_room(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


def composite(candidate: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layers = (
        _load_room("avatar_room_base_male_light_v1.png"),
        _load_room("avatar_room_face_male_warm_friendly_v1.png"),
        _load_room("avatar_room_shoes_male_milk_tea_court_v1.png"),
        candidate,
        _load_room("avatar_room_top_male_cream_basic_tee_v1.png"),
        _load_room("avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    for layer in layers:
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
    scale = 3
    full_size = (CANVAS[0] * scale, CANVAS[1] * scale)
    raw = candidate.resize(full_size, Image.Resampling.LANCZOS)
    full = combined.resize(full_size, Image.Resampling.LANCZOS)
    crop_box = (78, 268, 178, 352)
    crop_size = (500, 420)
    contact = combined.crop(crop_box).resize(crop_size, Image.Resampling.LANCZOS)
    panels: list[tuple[str, Image.Image]] = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("RAW / BLACK", _background(full_size, dark=True), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("WAIST · CROTCH · HEM", _background(crop_size), contact),
    ):
        background.alpha_composite(art)
        panels.append((label, background))
    header = 48
    width = sum(panel.width for _, panel in panels)
    height = max(panel.height for _, panel in panels) + header
    board = Image.new("RGBA", (width, height), (255, 248, 251, 255))
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
        "family": "male_cargo_parachute_track",
        "rigAuthority": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "method": "same-family-canonical-alpha-authority-with-new-olive-utility-material-art",
        "forbiddenOperations": ["external-fashion-paste", "warp", "body-resize", "runtime-overwrite"],
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
