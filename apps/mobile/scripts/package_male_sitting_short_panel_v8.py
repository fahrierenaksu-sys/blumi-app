#!/usr/bin/env python3
"""Rebuild the two rejected seated shorts with a connected panel method.

V7 attempted to repair holes by copying the source pixel at that coordinate.
The source is an on-base render, so those coordinates can be leg skin; that is
how the user-facing candidates turned into horizontal torn bands. V8 defines
the seated front geometry first, then transfers only item pixels and fills the
remaining interior with a softly shaded item palette.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import package_male_sitting_remaining_wave_v1 as v7


ROOT = v7.ROOT
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v8"
)
CANDIDATES = EVIDENCE / "candidates"
CANVAS = v7.CANVAS


TARGETS = {
    "technical_sport_shorts": {
        "palette": np.array([28, 60, 154], dtype=np.int16),
        "highlight": np.array([54, 81, 177], dtype=np.int16),
        "pattern": lambda rgb: (rgb[..., 0] > rgb[..., 1] + 34)
        & (rgb[..., 0] > rgb[..., 2] + 20)
        & (rgb[..., 0] < 250),
    },
    "contemporary_resort_street_bottom": {
        "palette": np.array([241, 226, 196], dtype=np.int16),
        "highlight": np.array([249, 236, 211], dtype=np.int16),
        "pattern": lambda rgb: (
            ((rgb[..., 1] > rgb[..., 0] + 3) & (rgb[..., 2] > rgb[..., 0] + 3))
            | ((rgb[..., 0] > rgb[..., 1] + 18) & (rgb[..., 0] > rgb[..., 2] + 20))
        ),
    },
}

SEATED_END_ROWS = {
    # A sport short needs a lower seated hem than the resort cut. It ends two
    # pixels above the first canonical shoe row, preserving clearance while
    # removing the brief-like high cut called out in the V7 review.
    "technical_sport_shorts": 326,
    "contemporary_resort_street_bottom": 320,
}


def _smooth_item_color(profile: v7.Profile, source: np.ndarray, row: int, col: int) -> np.ndarray:
    spec = TARGETS[profile.slug]
    palette = spec["palette"]
    highlight = spec["highlight"]
    # A restrained two-dimensional cloth light keeps the filled panel from
    # becoming a flat sticker while remaining stable across every sitting row.
    vertical = (row - 296) / 24.0
    horizontal = abs(col - 128) / 38.0
    shade = 0.92 + 0.08 * (1.0 - vertical) + 0.035 * (1.0 - horizontal)
    color = palette * shade + (highlight - palette) * max(0.0, 0.65 - horizontal) * 0.18
    return np.clip(np.rint(color), 0, 255).astype(np.uint8)


def _copy_authored_pixel(profile: v7.Profile, source: np.ndarray, mask: np.ndarray, row: int, col: int) -> np.ndarray | None:
    if not mask[row, col]:
        return None
    pixel = source[row, col, :3].astype(np.int16)
    # Never transfer warm skin or the pink background even if anti-aliasing
    # caused the material selector to touch their edge.
    skin_like = (pixel[0] > 205) and (pixel[0] > pixel[1] + 22) and (pixel[1] > pixel[2] + 8)
    if skin_like:
        return None
    return np.clip(pixel, 0, 255).astype(np.uint8)


def _geometry(profile: v7.Profile, row: int) -> tuple[int, int, int, int]:
    # (left outer, left inner, right inner, right outer). The first rows are a
    # connected pelvis; below the seated crotch fold the legs open naturally.
    progress = np.clip((row - 296) / float(SEATED_END_ROWS[profile.slug] - 296), 0.0, 1.0)
    left_outer = round(94 - 3 * progress)
    right_outer = round(161 + 3 * progress)
    if profile.slug == "contemporary_resort_street_bottom":
        left_outer = round(93 - 2 * progress)
        right_outer = round(162 + 2 * progress)
    if row < profile.short_gap_start:
        return left_outer, 127, 130, right_outer
    return left_outer, 127, 130, right_outer


def build_candidate(profile: v7.Profile) -> Image.Image:
    if profile.slug not in TARGETS:
        raise ValueError(f"V8 only owns the rejected short panels: {profile.slug}")
    source = np.asarray(v7.load(profile.master).resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    mask = v7._material_mask(profile, source)
    target = np.zeros_like(source)

    # Preserve the authored waistband/contact rows, but exclude any warm skin
    # pixels that may have been selected by the anti-aliased source edge.
    for row in range(283, 297):
        for col in range(84, 172):
            pixel = _copy_authored_pixel(profile, source, mask, row, col)
            if pixel is not None:
                target[row, col, :3] = pixel
                target[row, col, 3] = 255

    # Build a single front-facing seated garment surface. Existing material
    # pixels (including item piping/graphics) win; all remaining pixels use the
    # same item's smooth color field, never a shared silhouette or another SKU.
    end_row = SEATED_END_ROWS[profile.slug]
    for row in range(296, end_row + 1):
        left_outer, left_inner, right_inner, right_outer = _geometry(profile, row)
        for col in range(left_outer, right_outer + 1):
            if row >= profile.short_gap_start and left_inner <= col < right_inner:
                continue
            authored = _copy_authored_pixel(profile, source, mask, row, col)
            if authored is not None:
                color = authored
            else:
                color = _smooth_item_color(profile, source, row, col)
            target[row, col, :3] = color
            target[row, col, 3] = 255

        # Restore authored pattern/piping pixels that sit just outside the
        # broad material selector, but only inside this product's geometry.
        rgb = source[row, :, :3].astype(np.int16)
        pattern = TARGETS[profile.slug]["pattern"](rgb)
        for col in range(left_outer, right_outer + 1):
            if row >= profile.short_gap_start and left_inner <= col < right_inner:
                continue
            if pattern[col]:
                pattern_pixel = source[row, col, :3].astype(np.int16)
                skin_like = (
                    (pattern_pixel[0] > 205)
                    and (pattern_pixel[0] > pattern_pixel[1] + 22)
                    and (pattern_pixel[1] > pattern_pixel[2] + 8)
                )
                if not skin_like:
                    target[row, col, :3] = source[row, col, :3]
                    target[row, col, 3] = 255

    # Natural seated shoe clearance: shorts end above the shoe crowns and keep
    # the canonical three-pixel leg opening.
    target[end_row + 1 :] = 0
    target[profile.short_gap_start : end_row + 1, 127:130] = 0

    alpha_mask = v7._keep_largest_component(target[..., 3] > 24)
    target[~alpha_mask] = 0
    target[target[..., 3] == 0, :3] = 0
    return Image.fromarray(target)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def produce() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    for profile in v7.PROFILES:
        if profile.slug not in TARGETS:
            continue
        candidate = CANDIDATES / f"{profile.slug}-sitting-candidate-v2.png"
        composite = EVIDENCE / f"{profile.slug.replace('_', '-')}-canonical-sitting-v2.png"
        board = EVIDENCE / f"{profile.slug.replace('_', '-')}-sitting-v2-review-board.png"
        manifest = EVIDENCE / f"{profile.slug.replace('_', '-')}-sitting-v2-manifest.json"
        bottom = build_candidate(profile)
        bottom.save(candidate, optimize=True)
        composed = v7.canonical_composite(bottom)
        composed.save(composite, optimize=True)
        _write_board(profile, bottom, composed, board)
        manifest.write_text(json.dumps({
            "schemaVersion": 1,
            "recordType": "male_wardrobe_sitting_candidate",
            "assetId": f"blumi-avatar-bottom-{profile.slug.replace('_', '-')}-sitting-v2.0",
            "itemId": profile.slug,
            "fitFamily": profile.fit_family,
            "status": "candidate_pending_independent_review_and_user_approval",
            "candidateOnly": True,
            "runtimePromoted": False,
            "source": {"path": str(profile.master.relative_to(ROOT)), "sha256": _sha256(profile.master), "method": "item-specific-seated-front-geometry-v8"},
            "candidate": {"path": str(candidate.relative_to(ROOT)), "sha256": _sha256(candidate), "dimensions": "256x384", "format": "PNG RGBA"},
            "evidence": {"compositePath": str(composite.relative_to(ROOT)), "compositeSha256": _sha256(composite), "reviewBoardPath": str(board.relative_to(ROOT)), "reviewBoardSha256": _sha256(board)},
            "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
        }, indent=2) + "\n", encoding="utf-8")


def _write_board(profile: v7.Profile, bottom: Image.Image, composite: Image.Image, path: Path) -> None:
    board = Image.new("RGB", (1200, 850), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((28, 18), f"{profile.label.upper()} · SITTING V2", font=v7._font(28, True), fill="#382c37")
    draw.text((28, 56), "connected seated front geometry · item-specific · runtime closed", font=v7._font(18), fill="#796976")
    for x, label, background in ((30, "FULL COMPOSITE", "#211b22"), (320, "RAW / CHECKER", None), (610, "RAW / DARK", "#211b22")):
        panel = v7._checkerboard(CANVAS) if background is None else Image.new("RGB", CANVAS, background)
        layer = composite if x == 30 else bottom
        panel.paste(layer, (0, 0), layer)
        board.paste(panel, (x, 120))
        draw.text((x, 92), label, font=v7._font(18), fill="#382c37")
    contact = composite.crop((84, 288, 172, 326)).resize((704, 304), Image.Resampling.NEAREST)
    board.paste(contact, (250, 500), contact)
    draw.text((250, 470), "8x SEATED PANEL / SHOE CLEARANCE", font=v7._font(18), fill="#382c37")
    path.parent.mkdir(parents=True, exist_ok=True)
    board.save(path, optimize=True)


if __name__ == "__main__":
    produce()
