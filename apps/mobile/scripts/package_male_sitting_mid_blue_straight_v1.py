#!/usr/bin/env python3
"""Package the Mid Blue Straight Jeans canonical sitting candidate.

The source is an item-specific 4x on-base master. Deterministic processing is
limited to material extraction, canonical registration, alpha cleanup, and the
item's seated shoe-contact visibility role. Runtime assets are never written.
"""

from __future__ import annotations

from collections import deque
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
MASTER = EVIDENCE / "item-masters/mid-blue-straight-jeans-sitting-master-v1-1024.png"
OUTPUT = EVIDENCE / (
    "candidates/room_avatar_bottom_male_mid_blue_straight_jeans_v1_"
    "sitting_front_f01-candidate-v1.png"
)
COMPOSITE = EVIDENCE / "mid-blue-straight-jeans-canonical-sitting-v1.png"
REVIEW_BOARD = EVIDENCE / "mid-blue-straight-jeans-sitting-v1-review-board.png"
MANIFEST = EVIDENCE / "mid-blue-straight-jeans-sitting-v1-manifest.json"
BASE = MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
TOP = MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
CANVAS = (256, 384)
SCALE = 4
GARMENT_ZONE = (76, 270, 180, 345)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _keep_largest_component(mask: np.ndarray) -> np.ndarray:
    seen = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for row, col in zip(*np.where(mask & ~seen)):
        if seen[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        seen[row, col] = True
        component: list[tuple[int, int]] = []
        while queue:
            current_row, current_col = queue.popleft()
            component.append((current_row, current_col))
            for row_delta, col_delta in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row = current_row + row_delta
                next_col = current_col + col_delta
                if (
                    0 <= next_row < mask.shape[0]
                    and 0 <= next_col < mask.shape[1]
                    and mask[next_row, next_col]
                    and not seen[next_row, next_col]
                ):
                    seen[next_row, next_col] = True
                    queue.append((next_row, next_col))
        components.append(component)

    result = np.zeros_like(mask, dtype=bool)
    if components:
        component = max(components, key=len)
        component_rows, component_cols = zip(*component)
        result[np.asarray(component_rows), np.asarray(component_cols)] = True
    return result


def extract_bottom(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError("Expected a 1024x1536 item-specific seated master")

    source = np.asarray(master).copy()
    rows_4x, cols_4x = np.indices(source.shape[:2])
    red, green, blue = (source[..., channel].astype(np.int16) for channel in range(3))
    denim = (
        (cols_4x >= GARMENT_ZONE[0] * SCALE)
        & (cols_4x < GARMENT_ZONE[2] * SCALE)
        & (rows_4x >= GARMENT_ZONE[1] * SCALE)
        & (rows_4x < GARMENT_ZONE[3] * SCALE)
        & (blue > red + 25)
        & (blue > green + 5)
        & (red < 130)
        & (green < 175)
    )
    isolated = np.zeros_like(source)
    isolated[denim] = source[denim]
    registered = np.asarray(
        Image.fromarray(isolated).resize(CANVAS, Image.Resampling.LANCZOS)
    ).copy()

    # Straight-family first-contact rows follow the canonical tee envelope.
    top_alpha = np.asarray(load(TOP))[..., 3]
    # Row 295 is the first clean, continuous authored denim span. Earlier
    # pixels are mostly occluded by the master tee and downsample into thin
    # vertical remnants, so using them would create antenna-like waist tabs.
    hidden_waist_template = registered[295].copy()
    for row in range(283, 288):
        top_columns = np.where(top_alpha[row] > 24)[0]
        if not len(top_columns):
            continue
        left = max(0, int(top_columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(top_columns.max()) + 1)
        # The on-base master correctly hides these pixels beneath the tee.
        # Extend the first authored denim row upward only inside that hidden
        # contact envelope so the layer remains structurally joined without
        # inventing any visible waist artwork.
        registered[row, left : right + 1] = hidden_waist_template[left : right + 1]
        registered[row, :left] = 0
        registered[row, right + 1 :] = 0

    # Use the master-authored denim shape, but expose each canonical shoe's
    # tongue/laces through a widening center opening. Side contact narrows on
    # every lower row so the hem reads as a curved jean cuff, not square tabs.
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    shoe_alpha = np.asarray(load(SHOES))[..., 3] > 24
    contact_depth = rows - 329
    contact_rows = (rows >= 329) & (rows <= 333)
    left_distance = np.abs(cols - 110)
    right_distance = np.abs(cols - 146)
    opening_threshold = 8 + (2 * contact_depth)
    left_contact = (cols < 128) & (left_distance >= opening_threshold) & (left_distance <= 18)
    right_contact = (cols >= 128) & (right_distance >= opening_threshold) & (right_distance <= 18)
    allowed_shoe_contact = contact_rows & (left_contact | right_contact)

    registered[shoe_alpha & ~allowed_shoe_contact] = 0
    registered[334:] = 0
    # Separate the thighs from the natural crotch break downward. Keeping the
    # upper pelvis joined preserves one atomic garment layer.
    registered[318:338, 128] = 0
    registered[329:338, 127:130] = 0

    # Remove near-opaque resampling residue at the intentional shoe contact.
    contact_alpha = registered[..., 3]
    opaque_contact = allowed_shoe_contact & (contact_alpha >= 220)
    registered[opaque_contact, 3] = 255

    alpha_mask = _keep_largest_component(registered[..., 3] > 24)
    registered[~alpha_mask] = 0
    registered[registered[..., 3] == 0, :3] = 0
    return Image.fromarray(registered)


def canonical_composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (load(BASE), load(FACE), load(SHOES), bottom, load(TOP), load(HAIR)):
        result.alpha_composite(layer)
    return result


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    path = Path("/System/Library/Fonts/Supplemental") / name
    return ImageFont.truetype(str(path), size)


def _checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "#ffffff")
    pixels = image.load()
    for row in range(size[1]):
        for col in range(size[0]):
            if ((row // cell) + (col // cell)) % 2:
                pixels[col, row] = (222, 218, 222)
    return image


def review_board(bottom: Image.Image, composite: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1200, 850), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text(
        (28, 18),
        "MID BLUE STRAIGHT JEANS · SITTING V1 CANDIDATE",
        font=_font(28, True),
        fill="#382c37",
    )
    draw.text(
        (28, 56),
        "item-specific 4x master · canonical 256x384 · runtime promotion closed",
        font=_font(18),
        fill="#796976",
    )

    full_panel = Image.new("RGB", CANVAS, "#211b22")
    full_panel.paste(composite, (0, 0), composite)
    board.paste(full_panel, (30, 120))
    draw.text((30, 92), "FULL COMPOSITE", font=_font(18), fill="#382c37")

    raw_checker = _checkerboard(CANVAS)
    raw_checker.paste(bottom, (0, 0), bottom)
    board.paste(raw_checker, (320, 120))
    draw.text((320, 92), "RAW / CHECKER", font=_font(18), fill="#382c37")

    raw_dark = Image.new("RGB", CANVAS, "#211b22")
    raw_dark.paste(bottom, (0, 0), bottom)
    board.paste(raw_dark, (610, 120))
    draw.text((610, 92), "RAW / DARK", font=_font(18), fill="#382c37")

    waist = composite.crop((88, 278, 168, 312)).resize((400, 170), Image.Resampling.NEAREST)
    contact = composite.crop((84, 321, 172, 350)).resize((528, 174), Image.Resampling.NEAREST)
    board.paste(waist, (30, 590), waist)
    board.paste(contact, (520, 590), contact)
    draw.text(
        (30, 555), "5x WAIST / SEATED THIGHS", font=_font(18), fill="#382c37"
    )
    draw.text(
        (520, 555), "6x HEM / SHOE CONTACT", font=_font(18), fill="#382c37"
    )
    return board


def _write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": "blumi-avatar-bottom-mid-blue-straight-jeans-sitting-v1.0",
        "itemId": "mid_blue_straight_jeans",
        "fitFamily": "male_straight",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "source": {
            "path": str(MASTER.relative_to(ROOT)),
            "sha256": sha256(MASTER),
            "origin": "generated_in_project",
            "toolProvider": "not_provided",
            "modelOrEngine": "not_provided",
            "requestOrJobId": "not_provided",
            "seed": "not_provided",
        },
        "candidate": {
            "path": str(OUTPUT.relative_to(ROOT)),
            "sha256": sha256(OUTPUT),
            "dimensions": "256x384",
            "format": "PNG RGBA",
        },
        "evidence": {
            "compositePath": str(COMPOSITE.relative_to(ROOT)),
            "compositeSha256": sha256(COMPOSITE),
            "reviewBoardPath": str(REVIEW_BOARD.relative_to(ROOT)),
            "reviewBoardSha256": sha256(REVIEW_BOARD),
            "focusedTest": "python3 -m unittest test_package_male_sitting_mid_blue_straight_v1.py",
        },
        "continuityLocks": {
            "canonicalBase": str(BASE.relative_to(ROOT)),
            "neutralTop": str(TOP.relative_to(ROOT)),
            "neutralShoes": str(SHOES.relative_to(ROOT)),
            "waistTolerancePerSidePx": 1,
            "contactRows": "329-333",
        },
        "approval": {
            "independentReviewVerdict": "PENDING",
            "explicitUserApproval": False,
        },
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def produce() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bottom = extract_bottom(load(MASTER))
    bottom.save(OUTPUT, optimize=True)
    composite = canonical_composite(bottom)
    composite.save(COMPOSITE, optimize=True)
    review_board(bottom, composite).save(REVIEW_BOARD, optimize=True)
    _write_manifest()


if __name__ == "__main__":
    produce()
