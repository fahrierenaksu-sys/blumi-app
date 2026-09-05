#!/usr/bin/env python3
"""Build Creative Utility trousers on the approved male relaxed rig.

The approved warm-sand relaxed trouser supplies the immutable alpha geometry.
The utility identity is painted inside that geometry only: no pasted garment,
warp, scaling, body replacement, silhouette expansion, or runtime overwrite.
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
RIG = REDESIGN / "candidates/bottom/creative_utility_bottom_v4/rig"
SOURCE = ROOM / "avatar_room_bottom_male_warm_sand_relaxed_pants_v1.png"
SOURCE_SHA256 = "527eea1c423c05b2370e4cc508cfb17098775992520562179405f395b9ac0344"
OUTPUT = RIG / "static-review-approved-relaxed-rig-v4.png"
COMPOSITE = RIG / "composite-review-approved-relaxed-rig-v4.png"
PROOF = REDESIGN / "creative-utility-bottom-approved-relaxed-rig-v4-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-approved-relaxed-rig-v4-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _palette_map(luminance: np.ndarray) -> np.ndarray:
    level = np.clip((luminance - 45.0) / 180.0, 0.0, 1.0)[..., None]
    shadow = np.asarray((35, 43, 27), dtype=np.float32)
    mid = np.asarray((72, 82, 47), dtype=np.float32)
    light = np.asarray((126, 130, 76), dtype=np.float32)
    lower = shadow + (mid - shadow) * np.minimum(level * 2.0, 1.0)
    upper = mid + (light - mid) * np.maximum(level * 2.0 - 1.0, 0.0)
    return np.where(level <= 0.5, lower, upper).clip(0, 255).astype(np.uint8)


def _paint_details(rgb: Image.Image, alpha: Image.Image) -> Image.Image:
    scale = 4
    art = rgb.resize((CANVAS[0] * scale, CANVAS[1] * scale), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(art, "RGBA")

    def line(points: list[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 1) -> None:
        draw.line([(x * scale, y * scale) for x, y in points], fill=fill, width=width * scale)

    def polygon(points: list[tuple[int, int]], fill: tuple[int, int, int, int]) -> None:
        draw.polygon([(x * scale, y * scale) for x, y in points], fill=fill)

    # Structured waistband and fly, kept below the tee contact line.
    polygon([(98, 287), (158, 287), (158, 292), (98, 292)], (30, 37, 24, 72))
    line([(99, 292), (157, 292)], (170, 166, 104, 90))
    line([(128, 292), (128, 309), (125, 313)], (28, 35, 23, 120))

    # Hip entry seams follow the body instead of creating detached pockets.
    line([(101, 294), (111, 300), (113, 306)], (31, 39, 24, 110))
    line([(155, 294), (145, 300), (143, 306)], (31, 39, 24, 110))
    line([(102, 295), (111, 301)], (151, 151, 87, 70))
    line([(154, 295), (145, 301)], (151, 151, 87, 70))

    # Low-profile cargo panels remain fully inside each leg volume.
    polygon([(101, 304), (115, 304), (116, 314), (102, 315)], (25, 34, 21, 48))
    polygon([(141, 304), (155, 304), (154, 315), (140, 314)], (25, 34, 21, 48))
    line([(102, 304), (115, 304), (116, 314), (102, 315), (102, 304)], (27, 35, 23, 115))
    line([(141, 304), (155, 304), (154, 315), (140, 314), (141, 304)], (27, 35, 23, 115))
    line([(103, 306), (114, 306)], (153, 150, 84, 64))
    line([(142, 306), (153, 306)], (153, 150, 84, 64))

    # Subtle vertical shaping and clean hems; no painted bridge at crotch.
    line([(116, 297), (118, 328)], (143, 143, 82, 42))
    line([(140, 297), (138, 328)], (143, 143, 82, 42))
    line([(105, 329), (124, 331)], (25, 32, 21, 100))
    line([(132, 331), (150, 329)], (25, 32, 21, 100))

    art = art.resize(CANVAS, Image.Resampling.LANCZOS)
    clipped = Image.new("RGB", CANVAS)
    clipped.paste(art, mask=alpha)
    return clipped


def build_candidate() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("approved relaxed rig checksum drift")
    source = Image.open(SOURCE).convert("RGBA")
    pixels = np.asarray(source).copy()
    rgb = pixels[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    visible = pixels[..., 3] > 0
    recolored = _palette_map(luminance)
    pixels[visible, :3] = recolored[visible]
    pixels[~visible, :3] = 0
    base = Image.fromarray(pixels)
    painted = _paint_details(base.convert("RGB"), source.getchannel("A"))
    candidate = Image.merge("RGBA", (*painted.split(), source.getchannel("A")))
    clean = np.asarray(candidate).copy()
    clean[clean[..., 3] == 0, :3] = 0
    return Image.fromarray(clean)


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
    contact = combined.crop((88, 276, 168, 344)).resize((560, 476), Image.Resampling.LANCZOS)
    panels: list[tuple[str, Image.Image]] = []
    for label, background, art in (
        ("RAW / CHECKER", _background(full_size), raw),
        ("RAW / BLACK", _background(full_size, dark=True), raw),
        ("CANONICAL FULL BODY", _background(full_size), full),
        ("WAIST · CROTCH · HEM · SHOE", _background((560, 476)), contact),
    ):
        background.alpha_composite(art)
        panels.append((label, background))
    header = 48
    board = Image.new(
        "RGBA",
        (sum(panel.width for _, panel in panels), max(panel.height for _, panel in panels) + header),
        (255, 248, 251, 255),
    )
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
        "family": "male_relaxed_utility_cargo",
        "rigAuthority": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "method": "approved-relaxed-alpha-authority-with-in-mask-olive-utility-reillustration",
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
