#!/usr/bin/env python3
"""Candidate-only seated masters for the male bottom wardrobe.

Walk frames are already approved.  This producer treats sitting as a distinct
front-facing pose: an approved standing garment contributes its waistband,
material and item design, while each seated thigh is rebuilt on the canonical
sitting base.  It never fills an artificial centre block and never reuses the
old full-garment affine transform.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from repair_male_bottom_motion_pose_native_v2 import (
    CANVAS,
    ITEMS,
    MOTION,
    REPO_ROOT,
    ROOM,
    _checker,
    _load,
    _shoes,
)


SITTING_STATE = "sitting_front_f01"
EVIDENCE = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-sitting-pose-native-v3"
)
WALK_EVIDENCE = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-motion-pose-native-v2"
)
BOARD = EVIDENCE / "male-bottom-sitting-pose-native-v3-review-board.png"
CONTACT_BOARD = EVIDENCE / "male-bottom-sitting-pose-native-v3-contact-board.png"
MANIFEST = EVIDENCE / "male-bottom-sitting-pose-native-v3-manifest.json"
BASE = _load(MOTION / f"room_avatar_base_male_light_v1_{SITTING_STATE}.png")


def _family_volume(item_family: str) -> int:
    return {"slim": 0, "straight": 1, "relaxed": 3, "cargo": 3, "shorts": 0}[item_family]


def _source_start_y(item_family: str) -> int:
    return {"slim": 300, "straight": 300, "relaxed": 299, "cargo": 299, "shorts": 300}[item_family]


def _side_base_mask(side: str) -> np.ndarray:
    """Extract only the seated thigh; hands/arms are outside the bounded zone."""
    alpha = np.asarray(BASE)[..., 3]
    mask = np.zeros(alpha.shape, dtype=bool)
    if side == "left":
        x0, x1 = 90, 128
    else:
        x0, x1 = 128, 166
    mask[298:337, x0:x1] = alpha[298:337, x0:x1] > 24
    return mask


def _expand_outward(mask: np.ndarray, side: str, pixels: int) -> np.ndarray:
    """Add controlled garment volume on the outer thigh contour only."""
    if pixels == 0:
        return mask
    expanded = mask.copy()
    for y in range(298, 337):
        xs = np.where(mask[y])[0]
        if not len(xs):
            continue
        if side == "left":
            expanded[y, max(0, int(xs.min()) - pixels) : int(xs.max()) + 1] = True
        else:
            expanded[y, int(xs.min()) : min(CANVAS[0], int(xs.max()) + pixels + 1)] = True
    return expanded


def seated_leg_masks(item) -> tuple[np.ndarray, np.ndarray]:
    """Canonical two-thigh coverage masks for a particular garment family."""
    volume = _family_volume(item.family)
    return (
        _expand_outward(_side_base_mask("left"), "left", volume),
        _expand_outward(_side_base_mask("right"), "right", volume),
    )


def _source_side_crop(static: Image.Image, side: str, start_y: int) -> Image.Image:
    alpha = np.asarray(static)[..., 3] > 24
    x_slice = slice(0, 128) if side == "left" else slice(128, 256)
    ys, xs = np.where(alpha[start_y:, x_slice])
    if not len(xs):
        raise ValueError(f"{side}: no source garment pixels below y={start_y}")
    x0 = int(xs.min()) + x_slice.start
    x1 = int(xs.max()) + x_slice.start + 1
    y0 = int(ys.min()) + start_y
    y1 = int(ys.max()) + start_y + 1
    return static.crop((x0, y0, x1, y1))


def _opaque_material_texture(source: Image.Image) -> Image.Image:
    """Remove transparent-RGB holes before material is mapped into a new pose."""
    pixels = np.asarray(source.convert("RGBA")).copy()
    rgb = pixels[..., :3]
    known = pixels[..., 3] > 24
    # Transparent pixels in a PNG are allowed to contain black/green residue.
    # They must never become visible after an independently authored alpha mask.
    for _ in range(max(source.size)):
        if known.all():
            break
        filled = np.zeros_like(known)
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            source_known = np.zeros_like(known)
            source_rgb = np.zeros_like(rgb)
            y_src = slice(max(0, -dy), min(known.shape[0], known.shape[0] - dy))
            x_src = slice(max(0, -dx), min(known.shape[1], known.shape[1] - dx))
            y_dst = slice(max(0, dy), min(known.shape[0], known.shape[0] + dy))
            x_dst = slice(max(0, dx), min(known.shape[1], known.shape[1] + dx))
            source_known[y_dst, x_dst] = known[y_src, x_src]
            source_rgb[y_dst, x_dst] = rgb[y_src, x_src]
            take = ~known & source_known & ~filled
            rgb[take] = source_rgb[take]
            filled[take] = True
        known |= filled
    if not known.all():
        raise ValueError("unable to fill transparent material texture")
    return Image.fromarray(rgb, "RGB")


def _paint_leg(static: Image.Image, target_mask: np.ndarray, side: str, start_y: int) -> np.ndarray:
    """Fit one garment leg to its own seated thigh silhouette, never a whole body warp."""
    ys, xs = np.where(target_mask)
    if not len(xs):
        raise ValueError(f"{side}: empty seated target")
    target_box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    source = _source_side_crop(static, side, start_y)
    texture = _opaque_material_texture(source).resize(
        (target_box[2] - target_box[0], target_box[3] - target_box[1]),
        Image.Resampling.LANCZOS,
    )
    output = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    texture_pixels = np.asarray(texture)
    output[target_box[1] : target_box[3], target_box[0] : target_box[2], :3] = texture_pixels
    visible = target_mask
    output[..., 3][visible] = 255
    output[~visible] = 0
    output[output[..., 3] == 0, :3] = 0
    return output


def build_sitting_frame(item) -> Image.Image:
    # Shorts passed V2 review and their exposed-leg construction is already
    # correct. Keeping their exact approved candidate avoids needless drift.
    if item.family == "shorts":
        return _load(WALK_EVIDENCE / item.slug / f"{SITTING_STATE}.png")

    static = _load(item.static_path)
    start_y = _source_start_y(item.family)
    static_pixels = np.asarray(static).copy()
    output = np.zeros_like(static_pixels)
    # Preserve the approved upper garment, including the real waistband and
    # crotch artwork. The two legs overlap this by three rows to avoid seams.
    upper = np.indices(static_pixels.shape[:2])[0] < start_y + 3
    output[upper & (static_pixels[..., 3] > 0)] = static_pixels[upper & (static_pixels[..., 3] > 0)]
    for side, mask in zip(("left", "right"), seated_leg_masks(item)):
        leg = _paint_leg(static, mask, side, start_y)
        present = leg[..., 3] > 0
        output[present] = leg[present]
    output[output[..., 3] == 0, :3] = 0
    return Image.fromarray(output)


def validate_sitting_frame(item, frame: Image.Image) -> list[str]:
    pixels = np.asarray(frame.convert("RGBA"))
    errors: list[str] = []
    if np.any(pixels[pixels[..., 3] == 0, :3]):
        errors.append("transparent RGB residue")
    if item.family == "shorts":
        return errors
    static = np.asarray(_load(item.static_path))
    start_y = _source_start_y(item.family)
    locked = (static[..., 3] > 24)
    locked[start_y - 3 :] = False
    if not np.array_equal(pixels[locked], static[locked]):
        errors.append("approved waist/crotch artwork changed")
    for name, mask in zip(("left", "right"), seated_leg_masks(item)):
        if int((pixels[..., 3] > 24)[mask].sum()) / int(mask.sum()) < 0.92:
            errors.append(f"{name} seated thigh under-covered")
    # Garment cannot run across the toe; its visible lower edge may overlap
    # only the shoe throat. This protects the accepted shoe-contact contract.
    shoes = np.asarray(_shoes(SITTING_STATE))[..., 3] > 24
    if int(((pixels[..., 3] > 24) & shoes & (np.indices(shoes.shape)[0] > 337)).sum()) > 2:
        errors.append("hem covers shoe toe")
    return errors


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(
            f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}", size
        )
    except OSError:
        return ImageFont.load_default()


def _compose(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        BASE,
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _load(MOTION / f"room_avatar_top_male_powder_blue_crew_tee_v1_{SITTING_STATE}.png"),
        _shoes(SITTING_STATE),
        bottom,
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    ):
        result.alpha_composite(layer)
    return result


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _render_boards(frames: dict[str, Image.Image]) -> None:
    columns, cell_w, cell_h = 5, 208, 232
    rows = (len(ITEMS) + columns - 1) // columns
    board = Image.new("RGBA", (columns * cell_w, 52 + rows * cell_h), (255, 248, 251, 255))
    contact = Image.new("RGBA", board.size, (255, 248, 251, 255))
    for image, title in ((board, "BLUMI MALE BOTTOMS · SEATED POSE-NATIVE V3"), (contact, "BLUMI MALE BOTTOMS · SEATED CONTACT QA · V3")):
        ImageDraw.Draw(image).text((16, 16), title, font=_font(18, True), fill=(62, 43, 54, 255))
    for index, item in enumerate(ITEMS):
        x, y = (index % columns) * cell_w, 52 + (index // columns) * cell_h
        composite = _compose(frames[item.slug])
        full = composite.resize((138, 207), Image.Resampling.LANCZOS)
        full_bg = _checker(full.size)
        full_bg.alpha_composite(full)
        board.alpha_composite(full_bg, (x + 35, y + 18))
        crop = composite.crop((76, 270, 180, 354)).resize((184, 148), Image.Resampling.NEAREST)
        crop_bg = _checker(crop.size)
        crop_bg.alpha_composite(crop)
        contact.alpha_composite(crop_bg, (x + 12, y + 18))
        for image, label_y in ((board, y + 5), (contact, y + 172)):
            ImageDraw.Draw(image).text((x + 8, label_y), item.slug, font=_font(9, True), fill=(62, 43, 54, 255))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(BOARD, optimize=True)
    contact.convert("RGB").save(CONTACT_BOARD, optimize=True)


def produce() -> dict:
    frames = {item.slug: build_sitting_frame(item) for item in ITEMS}
    records = []
    for item in ITEMS:
        frame = frames[item.slug]
        errors = validate_sitting_frame(item, frame)
        if errors:
            raise ValueError(f"{item.slug}: {'; '.join(errors)}")
        destination = EVIDENCE / item.slug / f"{SITTING_STATE}.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        frame.save(destination, optimize=True)
        records.append(
            {
                "slug": item.slug,
                "family": item.family,
                "frame": {"path": _relative(destination), "sha256": _sha256(destination)},
            }
        )
    _render_boards(frames)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_only_pending_visual_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "approvedWalkingSource": _relative(WALK_EVIDENCE / "male-bottom-pose-native-v2-4w1s-board.png"),
        "method": "family_specific_seated_thigh_masters_on_canonical_male_sitting_base",
        "state": SITTING_STATE,
        "items": records,
        "boards": [
            {"path": _relative(BOARD), "sha256": _sha256(BOARD)},
            {"path": _relative(CONTACT_BOARD), "sha256": _sha256(CONTACT_BOARD)},
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
