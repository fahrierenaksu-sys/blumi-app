#!/usr/bin/env python3
"""Package AI re-illustrated seated masters as candidate composites.

The re-illustration is done on the canonical seated avatar. This packager only
removes the source backdrop, restores the canonical upper body/arms, keeps the
generated garment's authored folds and details, and places the approved shoes
last. It never writes runtime assets.
"""

from __future__ import annotations

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
SOURCE_DIR = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v11-reillustrated/masters"
)
V9 = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v9-native/native-seated-composites"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v11-reillustrated"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-19-reillustrated-seated-review-board.png"
CLOSEUP_BOARD = EVIDENCE / "male-bottom-19-reillustrated-seated-contact-board.png"
MANIFEST = EVIDENCE / "male-bottom-19-reillustrated-seated-manifest.json"
CANVAS = (256, 384)

BASE = MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"
TOP = MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"

REILLUSTRATED = {
    "mid_blue_straight_jeans": SOURCE_DIR / "mid-blue-straight-jeans-sitting-master-v3-1024.png",
    "straight_utility_tailored_trousers": SOURCE_DIR / "straight-utility-tailored-trousers-sitting-master-v2-1024.png",
    "warm_sand_deconstructed_trousers": SOURCE_DIR / "warm-sand-deconstructed-trousers-sitting-master-v2-1024.png",
    "warm_sand_relaxed_pants": SOURCE_DIR / "warm-sand-relaxed-pants-sitting-master-v2-1024.png",
    "monochrome_street_tailoring_bottom": SOURCE_DIR / "monochrome-street-tailoring-bottom-sitting-master-v2-1024.png",
    "contemporary_resort_street_bottom": SOURCE_DIR / "contemporary-resort-street-bottom-sitting-master-v4-1024.png",
    "washed_baggy_denim": SOURCE_DIR / "washed-baggy-denim-sitting-master-v3-1024.png",
    "creative_utility_bottom": SOURCE_DIR / "creative-utility-bottom-sitting-master-v2-1024.png",
    "soft_parachute_cargo_pants": SOURCE_DIR / "soft-parachute-cargo-pants-sitting-master-v3-1024.png",
    "colorblock_nylon_track_pants": SOURCE_DIR / "colorblock-nylon-track-pants-sitting-master-v3-1024.png",
    "refined_utility_cargo_shorts": SOURCE_DIR / "refined-utility-cargo-shorts-sitting-master-v3-1024.png",
}


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    pixels = np.asarray(image).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _without_bottom() -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (load(BASE), load(FACE), load(TOP), load(HAIR), load(SHOES)):
        result.alpha_composite(layer)
    return result


def _geometry(slug: str) -> tuple[int, int, int, int, int]:
    """Return waist, hem, left/right body envelope, and center-gap start."""
    if slug in {"contemporary_resort_street_bottom", "refined_utility_cargo_shorts"}:
        return (280, 319, 88, 168, 307)
    if slug in {"warm_sand_relaxed_pants", "washed_baggy_denim", "creative_utility_bottom", "soft_parachute_cargo_pants", "colorblock_nylon_track_pants"}:
        return (278, 340, 83, 173, 313)
    return (280, 338, 86, 170, 313)


def _garment_mask(slug: str) -> np.ndarray:
    waist, hem, left, right, gap_start = _geometry(slug)
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    mask = (rows >= waist) & (rows < hem) & (cols >= left) & (cols <= right)
    # Do not carve a fixed center slit into the generated garment. The
    # re-illustrated master owns its inseam/leg-gap geometry; forcing a
    # five-pixel transparent strip here exposed the canonical skin layer as
    # an artificial orange/white vertical bar in every seated composite.
    # Hands sit above the garment in the canonical base. Keep their outer
    # silhouettes locked instead of letting a generated crop cover them.
    mask &= ~((rows >= 286) & (cols < 91))
    mask &= ~((rows >= 286) & (cols > 165))
    return mask


def canonicalize_generated(slug: str, source: Path) -> Image.Image:
    generated = np.asarray(remove_background(Image.open(source)))
    if generated.shape[:2] != (CANVAS[1], CANVAS[0]):
        raise ValueError(f"{source}: failed to normalize generated seated master")
    underlay = np.asarray(_without_bottom()).copy()
    result = underlay.copy()
    garment = _garment_mask(slug)
    alpha = generated[..., 3] > 24
    result[garment & alpha] = generated[garment & alpha]

    # Reassert canonical arms/hands from the base at the outer contact zone.
    base = np.asarray(load(BASE))
    skin = (
        (base[..., 0] > base[..., 1] + 18)
        & (base[..., 1] >= base[..., 2] - 8)
        & (base[..., 0] > 150)
    )
    rows, cols = np.indices(skin.shape)
    arms = skin & (rows >= 270) & ((cols < 94) | (cols > 162))
    result[arms] = base[arms]
    # Start from the canonical shoe layer so the asset has a stable base
    # contract, then restore the re-illustrated source's lower contact. The
    # source contains the authored cuff/skin/shoe transition; forcing the
    # canonical shoes over it created a straight horizontal seam at every
    # ankle. Keep the source contact inside the body envelope so hands and
    # the canonical upper body remain locked.
    shoe = np.asarray(load(SHOES))
    shoe_alpha = shoe[..., 3] > 24
    # The authored shoe sprites contain a one-pixel-wide top bridge that reads
    # as a horizontal bar when composited over a seated hem. Drop only the
    # first two anti-aliased rows; the full shoe silhouette remains intact.
    shoe_alpha[329:331, :] = False
    result[shoe_alpha] = shoe[shoe_alpha]
    # Long-bottom masters own a small cuff-to-shoe overlap; preserve only
    # those lower cuff rows. Shorts keep the canonical exposed skin/shoe
    # transition and only borrow source shoe pixels below it.
    shorts = {"contemporary_resort_street_bottom", "refined_utility_cargo_shorts"}
    contact_start = 336 if slug in shorts else 328
    contact = alpha & (rows >= contact_start) & (rows < 360) & (cols >= 92) & (cols <= 164)
    result[contact] = generated[contact]
    result[result[..., 3] <= 8, :3] = 0
    result[result[..., 3] <= 8, 3] = 0
    return Image.fromarray(result)


def expected_outputs() -> dict[str, Path]:
    return {item.slug: OUTPUT_DIR / f"{item.slug}-reillustrated-seated-v1.png" for item in v2.ITEMS}


def _board(outputs: dict[str, Path]) -> None:
    ordered = list(outputs.items())
    cols, cell_w, cell_h = 5, 250, 330
    board = Image.new("RGB", (cols * cell_w, 90 + ((len(ordered) + cols - 1) // cols) * cell_h), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title in ((board, "BLUMI MALE · RE-ILLUSTRATED SITTING · 19 ITEMS"), (closeups, "BLUMI MALE · RE-ILLUSTRATED CONTACT CHECK")):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), "canonical base restored · authored garment preserved · shoes last · runtime closed", fill="#796976")
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
        if item.slug in REILLUSTRATED:
            candidate = canonicalize_generated(item.slug, REILLUSTRATED[item.slug])
            source = REILLUSTRATED[item.slug]
            method = "ai-reillustrated-on-seated-base-with-canonical-body-restored"
        else:
            candidate = load(V9 / f"{item.slug}-native-seated-v1.png")
            source = _slug_to_master(item.slug)
            method = "carry-forward-v9-independent-pass"
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
        "recordType": "male_reillustrated_seated_composite_candidate",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "reillustratedItems": list(REILLUSTRATED),
        "canonicalBase": str(BASE.relative_to(ROOT)),
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUP_BOARD.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
