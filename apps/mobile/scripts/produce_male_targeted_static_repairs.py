#!/usr/bin/env python3
"""Produce three candidate-only male wardrobe repairs and close-up evidence.

This script intentionally leaves runtime assets untouched.  It repairs the
current review stack for the Pixel Heart top, Espresso Crop hair and Navy
Straight pants, writes versioned candidate siblings, and renders evidence for
independent visual review.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from produce_navy_straight_v2 import (
    build_master as build_navy_master,
    downsample_preview as downsample_navy_preview,
)
from register_male_keyed_rig_edit import (
    cleanup_alpha_components,
    extract_keyed_foreground,
    register_keyed_edit,
)


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
TOP_ROOT = REDESIGN / "candidates/top/pixel_heart_boxy_tee"
BOTTOM_ROOT = REDESIGN / "candidates/bottom/navy_straight_pants"
HAIR_ROOT = REDESIGN / "candidates/hair/espresso_crop"

BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
NEUTRAL_TOP = ROOM / "avatar_room_top_male_cream_basic_tee_v1.png"
NEUTRAL_BOTTOM = ROOM / "avatar_room_bottom_male_navy_straight_pants_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"

TOP_GENERATED = TOP_ROOT / "rig/generated-natural-v6.png"
TOP_GUIDE = TOP_ROOT / "rig/keyed-guide-4x.png"
BOTTOM_LOCAL_BODY_GUIDE = BOTTOM_ROOT / "rig/localized-body-guide-v6.png"
CANVAS = (256, 384)


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path.name}: expected {CANVAS}, got {image.size}")
    return _clean(image)


def build_bottom_localized_body_guide() -> Image.Image:
    """Expose the exact short canonical lower body without an old garment."""

    base_alpha = np.asarray(_load(BASE).getchannel("A"))
    keyed = np.zeros((CANVAS[1], CANVAS[0], 3), dtype=np.uint8)
    keyed[:] = (0, 255, 0)
    keyed[base_alpha > 16] = (255, 0, 255)
    crop = Image.fromarray(keyed).crop((80, 256, 176, 352))
    return crop.resize((1024, 1024), Image.Resampling.NEAREST)


def build_pixel_heart_top() -> Image.Image:
    """Register the v5 on-body redraw without rebuilding or stretching it."""

    with Image.open(TOP_GENERATED) as generated, Image.open(TOP_GUIDE) as guide:
        registered = register_keyed_edit(generated, guide)
    garment = cleanup_alpha_components(
        extract_keyed_foreground(registered),
        min_pixel_count=256,
    )
    preview = garment.resize(CANVAS, Image.Resampling.LANCZOS)
    pixels = np.asarray(preview).copy()
    alpha = pixels[..., 3]
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    pixels[..., 3] = alpha
    return _clean(Image.fromarray(pixels))


def build_espresso_hair_front() -> Image.Image:
    """Complete the front hair over the canonical face's exposed scalp arc."""

    hair = np.asarray(_load(HAIR)).copy()
    face = np.asarray(_load(FACE))
    source_alpha = hair[..., 3].copy()
    scalp = np.zeros(source_alpha.shape, dtype=bool)
    scalp[100:114] = face[100:114, :, 3] > 16
    missing = scalp & (source_alpha < 180)
    opaque_y, opaque_x = np.nonzero(source_alpha > 32)
    if len(opaque_x) == 0:
        raise ValueError("espresso crop hair source is empty")

    for y, x in np.argwhere(missing):
        candidate = (
            (opaque_y >= y)
            & (opaque_y <= y + 18)
            & (np.abs(opaque_x - x) <= 24)
        )
        candidate_indices = np.flatnonzero(candidate)
        if len(candidate_indices) == 0:
            candidate_indices = np.arange(len(opaque_x))
        distances = (
            (opaque_y[candidate_indices] - y) ** 2
            + (opaque_x[candidate_indices] - x) ** 2
        )
        nearest = candidate_indices[int(np.argmin(distances))]
        source_y = int(opaque_y[nearest])
        source_x = int(opaque_x[nearest])
        hair[y, x, :3] = hair[source_y, source_x, :3]
        hair[y, x, 3] = max(224, int(face[y, x, 3]))

    return _clean(Image.fromarray(hair))


def build_navy_straight_pants() -> Image.Image:
    """Use the geometry-locked 4x two-leg master selected for natural-v4."""

    return _clean(downsample_navy_preview(build_navy_master()))


def _compose(
    *,
    top: Image.Image,
    bottom: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BASE),
        _load(FACE),
        bottom,
        _load(SHOES),
        top,
        hair,
    ):
        output = Image.alpha_composite(output, layer)
    return _clean(output)


def _checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    output = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle(
                    (x, y, x + cell - 1, y + cell - 1),
                    fill=(229, 225, 228, 255),
                )
    return output


def _fit_closeup(
    image: Image.Image,
    crop: tuple[int, int, int, int],
    *,
    max_size: tuple[int, int],
) -> Image.Image:
    cropped = image.crop(crop)
    scale = min(
        max_size[0] / cropped.width,
        max_size[1] / cropped.height,
    )
    size = (
        max(1, int(round(cropped.width * scale))),
        max(1, int(round(cropped.height * scale))),
    )
    return cropped.resize(size, Image.Resampling.NEAREST)


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _manifest_filename(item_id: str, review_version: str) -> str:
    return f"{item_id}-{review_version}-manifest.json"


def _write_manifest(
    root: Path,
    *,
    item_id: str,
    review_version: str,
    files: list[Path],
) -> None:
    manifest = {
        "schemaVersion": 1,
        "itemId": item_id,
        "candidateOnly": True,
        "runtimePromoted": False,
        "independentReviewVerdict": "PENDING",
        "explicitUserApproval": False,
        "files": {
            path.relative_to(REPO).as_posix(): _hash(path)
            for path in files
        },
    }
    path = root / _manifest_filename(item_id, review_version)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _render_review_board(
    top_composite: Image.Image,
    hair_composite: Image.Image,
    pants_composite: Image.Image,
    output: Path,
) -> None:
    panels = (
        ("PIXEL HEART · NECK/SHOULDER/WAIST", top_composite, (76, 205, 180, 307)),
        ("ESPRESSO CROP · SCALP ARC", hair_composite, (64, 92, 192, 178)),
        ("NAVY STRAIGHT · WAIST/CROTCH/SHOE", pants_composite, (88, 278, 168, 354)),
    )
    tile = (520, 620)
    board = Image.new("RGBA", (tile[0] * 3, tile[1]), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    for index, (label, composite, crop) in enumerate(panels):
        x = index * tile[0]
        draw.text((x + 18, 18), label, font=font, fill=(57, 41, 51, 255))
        full = _checkerboard((256, 384))
        full.alpha_composite(composite)
        board.alpha_composite(full, (x + 20, 58))
        close = _fit_closeup(composite, crop, max_size=(200, 420))
        close_bg = _checkerboard(close.size, 10)
        close_bg.alpha_composite(close)
        board.alpha_composite(close_bg, (x + 300, 58))
    board.convert("RGB").save(output, optimize=True)


def write_outputs() -> None:
    top = build_pixel_heart_top()
    hair = build_espresso_hair_front()
    pants = build_navy_straight_pants()

    top_rig = TOP_ROOT / "rig"
    bottom_rig = BOTTOM_ROOT / "rig"
    hair_rig = HAIR_ROOT / "rig"
    top_review = TOP_ROOT / "static-review-natural-v6"
    bottom_review = BOTTOM_ROOT / "static-review-natural-v4"
    hair_review = HAIR_ROOT / "static-review-natural-v3"
    for directory in (
        top_rig,
        bottom_rig,
        hair_rig,
        top_review,
        bottom_review,
        hair_review,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    top_path = top_rig / "static-review-natural-v6.png"
    pants_path = bottom_rig / "static-review-natural-v4.png"
    hair_path = hair_rig / "hair-front-review-natural-v3.png"
    top.save(top_path, optimize=True)
    pants.save(pants_path, optimize=True)
    hair.save(hair_path, optimize=True)

    top_composite = _compose(top=top, bottom=pants, hair=hair)
    hair_composite = _compose(top=_load(NEUTRAL_TOP), bottom=pants, hair=hair)
    pants_composite = _compose(
        top=_load(NEUTRAL_TOP),
        bottom=pants,
        hair=hair,
    )
    top_composite_path = top_rig / "composite-review-natural-v6.png"
    pants_composite_path = bottom_rig / "composite-review-natural-v4.png"
    hair_composite_path = hair_rig / "composite-review-natural-v3.png"
    top_composite.save(top_composite_path, optimize=True)
    pants_composite.save(pants_composite_path, optimize=True)
    hair_composite.save(hair_composite_path, optimize=True)

    evidence = REDESIGN / "targeted-natural-v6-review-board.png"
    _render_review_board(top_composite, hair_composite, pants_composite, evidence)
    _write_manifest(
        top_review,
        item_id="pixel_heart_boxy_tee",
        review_version="natural-v6",
        files=[top_path, top_composite_path, evidence],
    )
    _write_manifest(
        bottom_review,
        item_id="navy_straight_pants",
        review_version="natural-v4",
        files=[pants_path, pants_composite_path, evidence],
    )
    _write_manifest(
        hair_review,
        item_id="espresso_crop_hair_front",
        review_version="natural-v3",
        files=[hair_path, hair_composite_path, evidence],
    )
    print(evidence)


if __name__ == "__main__":
    write_outputs()
