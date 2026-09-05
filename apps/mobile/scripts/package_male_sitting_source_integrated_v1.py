#!/usr/bin/env python3
"""Build seated-bottom candidates from one continuous illustrated lower body.

The previous candidate package mixed a rectangular trouser crop with a second
shoe sprite.  At seated scale that produced a false seam, side spills, and
shoe overlap.  This candidate keeps every lower-body contact pixel (waist,
legs, hems, shoes) from one authored on-base source and locks only the
canonical face, hair, top, and outer hands around it.  It writes evidence
candidates only; runtime assets are deliberately untouched.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_male_bottom_motion_pose_native_v2 as v2


ROOT = v2.REPO_ROOT
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SOURCE_DIR = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v11-reillustrated/masters"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v12-source-integrated"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-six-source-integrated-seated-review-board.png"
CLOSEUPS = EVIDENCE / "male-bottom-six-source-integrated-seated-closeups.png"
MANIFEST = EVIDENCE / "male-bottom-six-source-integrated-seated-manifest.json"
CANVAS = (256, 384)
LOWER_START = 278

BASE = MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"
TOP = MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"

TARGETS = (
    "contemporary_resort_street_bottom",
    "refined_utility_cargo_shorts",
    "straight_utility_tailored_trousers",
    "monochrome_street_tailoring_bottom",
    "washed_baggy_denim",
    "colorblock_nylon_track_pants",
)
SOURCES = {
    "contemporary_resort_street_bottom": SOURCE_DIR / "contemporary-resort-street-bottom-sitting-master-v4-1024.png",
    "refined_utility_cargo_shorts": SOURCE_DIR / "refined-utility-cargo-shorts-sitting-master-v3-1024.png",
    "straight_utility_tailored_trousers": SOURCE_DIR / "straight-utility-tailored-trousers-sitting-master-v2-1024.png",
    "monochrome_street_tailoring_bottom": SOURCE_DIR / "monochrome-street-tailoring-bottom-sitting-master-v2-1024.png",
    "washed_baggy_denim": SOURCE_DIR / "washed-baggy-denim-sitting-master-v3-1024.png",
    "colorblock_nylon_track_pants": SOURCE_DIR / "colorblock-nylon-track-pants-sitting-master-v3-1024.png",
}


def _background_mask(rgb: np.ndarray) -> np.ndarray:
    """Return only pale, border-connected source backdrop pixels.

    This deliberately uses a tiny local flood-fill rather than importing the
    older packager (which pulls an unavailable SciPy dependency into this
    evidence-only utility).
    """
    height, width = rgb.shape[:2]
    border = np.concatenate((rgb[:24].reshape(-1, 3), rgb[-24:].reshape(-1, 3), rgb[:, :24].reshape(-1, 3), rgb[:, -24:].reshape(-1, 3)))
    reference = np.median(border, axis=0).astype(np.float32)
    distance = np.sqrt(np.sum((rgb.astype(np.float32) - reference) ** 2, axis=2))
    saturation = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    candidate = (distance <= 34.0) & (saturation <= 38) & (rgb.mean(axis=2) >= 215)
    result = np.zeros((height, width), dtype=bool)
    stack = [(0, x) for x in range(width)] + [(height - 1, x) for x in range(width)]
    stack += [(y, 0) for y in range(height)] + [(y, width - 1) for y in range(height)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= height or x < 0 or x >= width or result[y, x] or not candidate[y, x]:
            continue
        result[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    return result


def _checker(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, "#fff")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#dedade")
    return result


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    rgba = np.asarray(image).copy()
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


@lru_cache(maxsize=None)
def normalized_source(path: Path) -> Image.Image:
    """Remove source backdrop without interpolating transparent RGB into edges."""
    original = Image.open(path).convert("RGBA")
    if original.size != (1024, 1536):
        raise ValueError(f"{path}: expected a 1024x1536 master")
    rgba = np.asarray(original).copy()
    backdrop = _background_mask(rgba[..., :3])
    rgba[backdrop, :3] = 0
    rgba[backdrop, 3] = 0
    alpha = rgba[..., 3:4].astype(np.float32) / 255.0
    premultiplied = np.rint(rgba[..., :3].astype(np.float32) * alpha).astype(np.uint8)
    rgb_small = np.asarray(
        Image.fromarray(premultiplied).resize(CANVAS, Image.Resampling.LANCZOS), dtype=np.float32
    )
    alpha_small = np.asarray(
        Image.fromarray(rgba[..., 3]).resize(CANVAS, Image.Resampling.LANCZOS), dtype=np.float32
    )
    result = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    visible = alpha_small > 8
    result[..., 3] = np.where(visible, alpha_small, 0).astype(np.uint8)
    result[..., :3][visible] = np.clip(
        rgb_small[visible] * 255.0 / alpha_small[visible, None], 0, 255
    ).astype(np.uint8)
    return Image.fromarray(result)


def _canonical_upper() -> np.ndarray:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (load(BASE), load(FACE), load(TOP), load(HAIR)):
        result.alpha_composite(layer)
    return np.asarray(result).copy()


def compose(slug: str) -> Image.Image:
    if slug not in SOURCES:
        raise KeyError(slug)
    source = np.asarray(normalized_source(SOURCES[slug]))
    result = _canonical_upper()
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    source_visible = source[..., 3] > 8

    # The lower body is intentionally copied as one continuous authored asset.
    # There is no late shoe overlay, crop mask, forced leg slit, or cuff patch.
    integrated = source_visible & (rows >= LOWER_START)
    result[integrated] = source[integrated]

    # Keep canonical outer hands in front of bottoms; limit this to the hand
    # silhouette so it cannot carve into pockets or a trouser side contour.
    base = np.asarray(load(BASE))
    skin = (
        (base[..., 0] > base[..., 1] + 18)
        & (base[..., 1] >= base[..., 2] - 8)
        & (base[..., 0] > 150)
        & (base[..., 3] > 8)
    )
    hands = skin & (rows >= 278) & ((cols < 86) | (cols > 170))
    result[hands] = base[hands]
    result[result[..., 3] <= 8, :3] = 0
    result[result[..., 3] <= 8, 3] = 0
    return Image.fromarray(result)


def expected_outputs() -> dict[str, Path]:
    return {slug: OUTPUT_DIR / f"{slug}-source-integrated-seated-v1.png" for slug in TARGETS}


def _board(outputs: dict[str, Path]) -> None:
    columns, cell_w, cell_h = 3, 360, 430
    rows = (len(TARGETS) + columns - 1) // columns
    board = Image.new("RGB", (columns * cell_w, 90 + rows * cell_h), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title, subtitle in (
        (board, "BLUMI MALE · SITTING CONTACT REBUILD · 6 TARGETS", "one authored lower-body layer · no separate shoe overlay · candidate only"),
        (closeups, "BLUMI MALE · SITTING 4× CONTACT INSPECTION", "waist / inner legs / hem / shoes · candidate only"),
    ):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), subtitle, fill="#796976")
    for index, slug in enumerate(TARGETS):
        row, col = divmod(index, columns)
        x, y = col * cell_w, 90 + row * cell_h
        avatar = Image.open(outputs[slug]).convert("RGBA")
        panel = _checker((192, 288))
        panel.alpha_composite(avatar.resize((192, 288), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 84, y))
        ImageDraw.Draw(board).text((x + 18, y + 304), slug, fill="#382c37")
        contact = avatar.crop((70, 268, 186, 364)).resize((320, 264), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 20, y))
        ImageDraw.Draw(closeups).text((x + 18, y + 278), slug, fill="#382c37")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    board.save(BOARD, optimize=True)
    closeups.save(CLOSEUPS, optimize=True)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def produce() -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = expected_outputs()
    records = []
    for slug, source in SOURCES.items():
        candidate = compose(slug)
        candidate.save(outputs[slug], optimize=True)
        records.append({
            "slug": slug,
            "method": "single-source-integrated-lower-body-with-canonical-upper-lock",
            "source": {"path": str(source.relative_to(ROOT)), "sha256": _sha(source)},
            "candidate": {"path": str(outputs[slug].relative_to(ROOT)), "sha256": _sha(outputs[slug])},
            "candidateOnly": True,
        })
    _board(outputs)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "rejectedPreviousMethod": "rectangular-garment-mask-plus-separate-shoe-overlay",
        "canonicalUpper": [str(path.relative_to(ROOT)) for path in (BASE, TOP, FACE, HAIR)],
        "lowerStart": LOWER_START,
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUPS.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
