#!/usr/bin/env python3
"""Rebuild seated-bottom candidates from garment-only seated shells.

This replaces the rejected "full lower-body overlay" and "rectangular garment
crop" approaches with a garment-shell workflow:

- source images contain only the seated garment on a chroma-key background
- the garment is fitted into an item-specific seated bbox
- canonical top and outer hands sit in front of the garment
- shoe contact order is item-family specific
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
CANVAS = (256, 384)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v17-contact-rebuild"
)
SOURCE_DIR = EVIDENCE / "sources"
ALPHA_DIR = SOURCE_DIR / "alpha"
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-three-v17-contact-rebuild-review-board.png"
CLOSEUPS = EVIDENCE / "male-bottom-three-v17-contact-rebuild-closeups.png"
MANIFEST = EVIDENCE / "male-bottom-three-v17-contact-rebuild-manifest.json"
CHROMA_HELPER = Path.home() / ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py"

BASE = MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"
TOP = MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"

ITEMS = {
    "colorblock_nylon_track_pants": {
        "family": "long",
        "source": SOURCE_DIR / "colorblock-nylon-track-pants-garment-v3-chroma.png",
        "alpha": ALPHA_DIR / "colorblock-nylon-track-pants-garment-v3-alpha.png",
        "target_box": (85, 268, 171, 349),
    },
    "refined_utility_cargo_shorts": {
        "family": "short",
        "source": SOURCE_DIR / "refined-utility-cargo-shorts-garment-v1-chroma.png",
        "alpha": ALPHA_DIR / "refined-utility-cargo-shorts-garment-v1-alpha.png",
        "target_box": (87, 281, 169, 320),
    },
    "contemporary_resort_street_bottom": {
        "family": "short",
        "source": SOURCE_DIR / "contemporary-resort-street-bottom-garment-v2-chroma.png",
        "alpha": ALPHA_DIR / "contemporary-resort-street-bottom-garment-v2-alpha.png",
        "target_box": (89, 281, 167, 320),
        "outer_color_cleanup": {
            "top_rows": 20,
            "left_cols": 20,
            "right_cols": 58,
            "min_saturation": 18,
        },
    },
}


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    rgba = np.asarray(image).copy()
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def ensure_alpha(chroma_source: Path, alpha_path: Path) -> None:
    if alpha_path.exists():
        return
    alpha_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(CHROMA_HELPER),
            "--input",
            str(chroma_source),
            "--out",
            str(alpha_path),
            "--auto-key",
            "border",
            "--soft-matte",
            "--transparent-threshold",
            "12",
            "--opaque-threshold",
            "220",
            "--despill",
        ],
        check=True,
    )


def crop_to_alpha_bbox(image: Image.Image) -> Image.Image:
    arr = np.asarray(image)
    ys, xs = np.where(arr[..., 3] > 8)
    if xs.size == 0 or ys.size == 0:
        raise ValueError("garment alpha is empty")
    return image.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def fit_garment_to_box(image: Image.Image, target_box: tuple[int, int, int, int]) -> Image.Image:
    crop = crop_to_alpha_bbox(image)
    x1, y1, x2, y2 = target_box
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    fitted = crop.resize((x2 - x1, y2 - y1), Image.Resampling.LANCZOS)
    result.alpha_composite(fitted, (x1, y1))
    return result


def trim_layer_to_polygon(image: Image.Image, polygon: tuple[tuple[int, int], ...]) -> Image.Image:
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(list(polygon), fill=255)
    rgba = np.asarray(image).copy()
    keep = np.asarray(mask) > 0
    rgba[~keep, :3] = 0
    rgba[~keep, 3] = 0
    return Image.fromarray(rgba)


def neutralize_outer_color_fragments(
    image: Image.Image,
    *,
    top_rows: int,
    left_cols: int,
    right_cols: int,
    min_saturation: int,
) -> Image.Image:
    rgba = np.asarray(image).copy()
    ys, xs = np.indices((CANVAS[1], CANVAS[0]))
    placed = rgba[..., 3] > 8
    saturation = rgba[..., :3].max(axis=2).astype(np.int16) - rgba[..., :3].min(axis=2).astype(np.int16)
    local_y = ys - ys[placed].min()
    local_x = xs - xs[placed].min()
    side = ((local_x < left_cols) | (local_x > right_cols)) & (local_y < top_rows)
    neutral_pool = placed & side & (saturation <= min_saturation)
    if not np.any(neutral_pool):
        return image
    neutral_rgb = np.median(rgba[..., :3][neutral_pool], axis=0).astype(np.uint8)
    recolor = placed & side & (saturation > min_saturation)
    rgba[recolor, :3] = neutral_rgb
    return Image.fromarray(rgba)


def seated_hands_overlay() -> Image.Image:
    base = np.asarray(load(BASE))
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    mask = (base[..., 3] > 8) & (rows >= 248) & (rows < 360)
    mask &= ((cols < 92) & (rows > 255)) | ((cols > 164) & (rows > 255))
    overlay = np.zeros_like(base)
    overlay[mask] = base[mask]
    return Image.fromarray(overlay)


def compose_layers(
    *,
    base: Image.Image,
    garment: Image.Image,
    top: Image.Image,
    hands: Image.Image,
    shoes: Image.Image,
    shoes_over_garment: bool,
) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(base)
    if shoes_over_garment:
        result.alpha_composite(garment)
        result.alpha_composite(shoes)
    else:
        result.alpha_composite(shoes)
        result.alpha_composite(garment)
    result.alpha_composite(top)
    result.alpha_composite(hands)
    return result


def canonical_avatar(garment: Image.Image, *, shoes_over_garment: bool) -> Image.Image:
    result = compose_layers(
        base=load(BASE),
        garment=garment,
        top=load(TOP),
        hands=seated_hands_overlay(),
        shoes=load(SHOES),
        shoes_over_garment=shoes_over_garment,
    )
    result.alpha_composite(load(FACE))
    result.alpha_composite(load(HAIR))
    return result


def expected_outputs() -> dict[str, Path]:
    return {slug: OUTPUT_DIR / f"{slug}-contact-rebuild-v17.png" for slug in ITEMS}


def _checker(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, "#fff")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#dedade")
    return result


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _board(outputs: dict[str, Path]) -> None:
    cols, cell_w, cell_h = 3, 360, 430
    board = Image.new("RGB", (cols * cell_w, 520), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title, subtitle in (
        (board, "BLUMI MALE · SITTING CONTACT REBUILD V17", "garment-only seated shells · top and hands locked in front · candidate only"),
        (closeups, "BLUMI MALE · SITTING V17 · 4× CONTACT CHECK", "waist / thighs / hem / shoe contact"),
    ):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), subtitle, fill="#796976")
    for index, slug in enumerate(ITEMS):
        x, y = index * cell_w, 90
        avatar = Image.open(outputs[slug]).convert("RGBA")
        panel = _checker((192, 288))
        panel.alpha_composite(avatar.resize((192, 288), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 84, y))
        ImageDraw.Draw(board).text((x + 16, y + 304), slug, fill="#382c37")
        contact = avatar.crop((70, 266, 186, 364)).resize((312, 264), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 24, y))
        ImageDraw.Draw(closeups).text((x + 16, y + 278), slug, fill="#382c37")
    board.save(BOARD, optimize=True)
    closeups.save(CLOSEUPS, optimize=True)


def produce() -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    outputs = expected_outputs()
    for slug, item in ITEMS.items():
        ensure_alpha(item["source"], item["alpha"])
        garment = fit_garment_to_box(
            Image.open(item["alpha"]).convert("RGBA"),
            item["target_box"],
        )
        if "trim_polygon" in item:
            garment = trim_layer_to_polygon(garment, item["trim_polygon"])
        if "outer_color_cleanup" in item:
            garment = neutralize_outer_color_fragments(garment, **item["outer_color_cleanup"])
        candidate = canonical_avatar(
            garment,
            shoes_over_garment=item["family"] == "short",
        )
        candidate.save(outputs[slug], optimize=True)
        records.append(
            {
                "slug": slug,
                "family": item["family"],
                "method": "garment-only-seated-shell-with-canonical-contact-stack",
                "source": str(item["source"].relative_to(ROOT)),
                "sourceSha256": _sha(item["source"]),
                "alpha": str(item["alpha"].relative_to(ROOT)),
                "alphaSha256": _sha(item["alpha"]),
                "targetBox": item["target_box"],
                "candidate": str(outputs[slug].relative_to(ROOT)),
                "candidateSha256": _sha(outputs[slug]),
            }
        )
    _board(outputs)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "replacedMethods": [
            "full-source-lower-body-overlay",
            "rectangular-garment-envelope-overlay",
        ],
        "method": "garment-only-seated-shell-with-canonical-contact-stack",
        "canonicalLayers": [
            str(BASE.relative_to(ROOT)),
            str(TOP.relative_to(ROOT)),
            str(SHOES.relative_to(ROOT)),
            str(FACE.relative_to(ROOT)),
            str(HAIR.relative_to(ROOT)),
        ],
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUPS.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
