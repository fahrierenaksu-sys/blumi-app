#!/usr/bin/env python3
"""Build a family-aware seated candidate for the eleven failed bottom items.

The native seated masters remain the source of truth for the eight items that
already passed review.  The rejected eleven are rebuilt from their approved
transparent standing garment layers: the waist/crotch hinge is mapped as one
piece, then each physical leg is mapped independently onto the canonical
seated thigh anchors.  Shoes are composited last so hems cannot cover them.
This is candidate-only and never writes runtime assets.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_male_bottom_motion_pose_native_v2 as v2
from package_male_seated_native_v1 import _checker, _slug_to_master, remove_background


ROOT = v2.REPO_ROOT
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
V9 = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v9-native/native-seated-composites"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v10-reflow"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-19-reflow-seated-review-board.png"
CLOSEUP_BOARD = EVIDENCE / "male-bottom-19-reflow-seated-contact-board.png"
MANIFEST = EVIDENCE / "male-bottom-19-reflow-seated-manifest.json"
CANVAS = (256, 384)

BASE = MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"
TOP = MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"

FAILED_ITEMS = (
    "mid_blue_straight_jeans",
    "straight_utility_tailored_trousers",
    "warm_sand_deconstructed_trousers",
    "warm_sand_relaxed_pants",
    "monochrome_street_tailoring_bottom",
    "contemporary_resort_street_bottom",
    "washed_baggy_denim",
    "creative_utility_bottom",
    "soft_parachute_cargo_pants",
    "colorblock_nylon_track_pants",
    "refined_utility_cargo_shorts",
)
ITEMS = v2.ITEMS


@dataclass(frozen=True)
class ReflowProfile:
    slug: str
    family: str
    target_left: int
    target_right: int
    waist_y: int
    hinge_y: int
    hem_y: int


PROFILES = {
    "mid_blue_straight_jeans": ReflowProfile("mid_blue_straight_jeans", "straight", 88, 168, 282, 307, 335),
    "straight_utility_tailored_trousers": ReflowProfile("straight_utility_tailored_trousers", "straight", 87, 169, 281, 307, 335),
    "warm_sand_deconstructed_trousers": ReflowProfile("warm_sand_deconstructed_trousers", "straight", 86, 170, 280, 307, 335),
    "warm_sand_relaxed_pants": ReflowProfile("warm_sand_relaxed_pants", "relaxed", 84, 172, 279, 306, 337),
    "monochrome_street_tailoring_bottom": ReflowProfile("monochrome_street_tailoring_bottom", "relaxed", 86, 170, 280, 306, 336),
    "contemporary_resort_street_bottom": ReflowProfile("contemporary_resort_street_bottom", "shorts", 90, 166, 281, 303, 325),
    "washed_baggy_denim": ReflowProfile("washed_baggy_denim", "relaxed", 84, 172, 279, 306, 337),
    "creative_utility_bottom": ReflowProfile("creative_utility_bottom", "cargo", 84, 172, 279, 305, 336),
    "soft_parachute_cargo_pants": ReflowProfile("soft_parachute_cargo_pants", "cargo", 83, 173, 279, 305, 336),
    "colorblock_nylon_track_pants": ReflowProfile("colorblock_nylon_track_pants", "cargo", 84, 172, 280, 306, 336),
    "refined_utility_cargo_shorts": ReflowProfile("refined_utility_cargo_shorts", "shorts", 89, 167, 281, 303, 325),
}


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    pixels = np.asarray(image).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def static_path(slug: str) -> Path:
    return ROOM / f"avatar_room_bottom_male_{slug}_v1.png"


def _resize_crop(source: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    crop = source.crop(box)
    return crop.resize(size, Image.Resampling.LANCZOS)


def reflow_bottom(profile: ReflowProfile) -> Image.Image:
    source = load(static_path(profile.slug))
    pixels = np.asarray(source)
    alpha = pixels[..., 3] > 24
    ys, xs = np.where(alpha)
    sx0, sx1 = int(xs.min()), int(xs.max()) + 1
    sy0, sy1 = int(ys.min()), int(ys.max()) + 1
    center = 128
    source_hinge = sy0 + round((sy1 - sy0) * 0.42)
    target_center = 128
    target_hinge = profile.hinge_y
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))

    # Preserve the authored waist, fly and upper pocket details as one hinge.
    upper = _resize_crop(
        source,
        (sx0, sy0, sx1, source_hinge),
        (profile.target_right - profile.target_left, target_hinge - profile.waist_y),
    )
    output.alpha_composite(upper, (profile.target_left, profile.waist_y))

    # Reflow each physical leg independently; this is what prevents a walking
    # rectangle from becoming a skirt-like seated blob.
    source_left = (sx0, source_hinge, center, sy1)
    source_right = (center, source_hinge, sx1, sy1)
    left_target = (profile.target_left, target_hinge, target_center - 2, profile.hem_y)
    right_target = (target_center + 2, target_hinge, profile.target_right, profile.hem_y)
    for source_box, target_box in ((source_left, left_target), (source_right, right_target)):
        target_w = max(1, target_box[2] - target_box[0])
        target_h = max(1, target_box[3] - target_box[1])
        leg = _resize_crop(source, source_box, (target_w, target_h))
        output.alpha_composite(leg, (target_box[0], target_box[1]))

    pixels = np.asarray(output).copy()
    # Eliminate any accidental bridge at the intentional seated leg opening.
    pixels[target_hinge : profile.hem_y + 2, target_center - 2 : target_center + 2] = 0
    pixels[pixels[..., 3] <= 8, :3] = 0
    pixels[pixels[..., 3] <= 8, 3] = 0
    return Image.fromarray(pixels)


def composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    # Shoes last is intentional: a hem may touch the shoe, but never cover it.
    for layer in (load(BASE), load(FACE), bottom, load(TOP), load(HAIR), load(SHOES)):
        result.alpha_composite(layer)
    return result


def expected_outputs() -> dict[str, Path]:
    return {item.slug: OUTPUT_DIR / f"{item.slug}-reflow-seated-v1.png" for item in v2.ITEMS}


def _board(outputs: dict[str, Path]) -> None:
    ordered = list(outputs.items())
    cols, cell_w, cell_h = 5, 250, 330
    board = Image.new("RGB", (cols * cell_w, 90 + ((len(ordered) + cols - 1) // cols) * cell_h), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title in ((board, "BLUMI MALE · FAMILY-AWARE SITTING REFLOW · 19 ITEMS"), (closeups, "BLUMI MALE · REFLOW CONTACT CHECK")):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), "approved standing garment reflow · shoes last · runtime closed", fill="#796976")
    for index, (slug, path) in enumerate(ordered):
        row, col = divmod(index, cols)
        x, y = col * cell_w, 90 + row * cell_h
        avatar = Image.open(path).convert("RGBA")
        panel = _checker((180, 270))
        panel.alpha_composite(avatar.resize((180, 270), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 35, y))
        contact = avatar.crop((76, 268, 180, 354)).resize((224, 172), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 13, y + 8))
        ImageDraw.Draw(board).text((x + 10, y + 278), slug, fill="#382c37")
        ImageDraw.Draw(closeups).text((x + 10, y + 190), slug, fill="#382c37")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    board.save(BOARD, optimize=True)
    closeups.save(CLOSEUP_BOARD, optimize=True)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def produce() -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = expected_outputs()
    records = []
    for item in v2.ITEMS:
        if item.slug in FAILED_ITEMS:
            candidate = composite(reflow_bottom(PROFILES[item.slug]))
            method = "family-aware-standing-layer-reflow-with-shoes-last"
            source = static_path(item.slug)
        else:
            candidate = load(V9 / f"{item.slug}-native-seated-v1.png")
            method = "carry-forward-independent-pass-from-v9-native-seated"
            source = _slug_to_master(item.slug)
        candidate.save(outputs[item.slug], optimize=True)
        records.append({
            "slug": item.slug,
            "method": method,
            "source": {"path": str(source.relative_to(ROOT)), "sha256": _sha(source)},
            "candidate": {"path": str(outputs[item.slug].relative_to(ROOT)), "sha256": _sha(outputs[item.slug]), "dimensions": "256x384", "format": "PNG RGBA"},
            "candidateOnly": True,
        })
    _board(outputs)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "recordType": "male_family_aware_seated_reflow_candidate",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "failedItemsRebuilt": list(FAILED_ITEMS),
        "canonicalBase": str(BASE.relative_to(ROOT)),
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUP_BOARD.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
