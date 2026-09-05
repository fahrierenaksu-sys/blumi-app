#!/usr/bin/env python3
"""Package seated bottoms as garment-only overlays on the canonical base.

Unlike the rejected source-integrated approach, this never carries the source
avatar's arms, legs, or shoes into the candidate.  Those body parts remain the
canonical sitting rig; only the authored garment area is allowed through.
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
import package_male_sitting_source_integrated_v1 as source_pipeline


ROOT = source_pipeline.ROOT
ROOM = source_pipeline.ROOM
MOTION = source_pipeline.MOTION
CANVAS = source_pipeline.CANVAS
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v15-garment-only-overlay"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-six-v15-garment-only-review-board.png"
CLOSEUPS = EVIDENCE / "male-bottom-six-v15-garment-only-closeups.png"
MANIFEST = EVIDENCE / "male-bottom-six-v15-garment-only-manifest.json"
SHOE_LOCK_Y = 326
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"

MASTERS = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v14-hem-reillustration"
)
TARGETS = (
    "straight_utility_tailored_trousers",
    "colorblock_nylon_track_pants",
    "monochrome_street_tailoring_bottom",
    "washed_baggy_denim",
    "refined_utility_cargo_shorts",
    "contemporary_resort_street_bottom",
)
SOURCES = {
    "straight_utility_tailored_trousers": MASTERS / "straight-utility-tailored-trousers-seated-master-v4.png",
    "colorblock_nylon_track_pants": MASTERS / "colorblock-nylon-track-pants-seated-master-v5.png",
    "monochrome_street_tailoring_bottom": MASTERS / "monochrome-street-tailoring-bottom-seated-master-v4.png",
    "washed_baggy_denim": MASTERS / "washed-baggy-denim-seated-master-v5.png",
    "refined_utility_cargo_shorts": MASTERS / "refined-utility-cargo-shorts-seated-master-v5.png",
    "contemporary_resort_street_bottom": MASTERS / "contemporary-resort-street-bottom-seated-master-v6.png",
}
SHORTS = {"refined_utility_cargo_shorts", "contemporary_resort_street_bottom"}


def normalized_source(path: Path) -> Image.Image:
    return source_pipeline.normalized_source(path)


def canonical_underlay() -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (source_pipeline.load(source_pipeline.BASE), source_pipeline.load(source_pipeline.FACE), source_pipeline.load(source_pipeline.TOP), source_pipeline.load(source_pipeline.HAIR), source_pipeline.load(SHOES)):
        result.alpha_composite(layer)
    return result


def garment_mask(slug: str, source: np.ndarray) -> np.ndarray:
    """Item-family envelope that rejects the source avatar outside garment area."""
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    visible = source[..., 3] > 8
    if slug in SHORTS:
        # Garment stops before visible canonical lower legs. The curved lower
        # edge comes from the re-illustrated source, while this envelope only
        # prevents arms and shoes from crossing the composition boundary.
        envelope = (rows >= 282) & (rows < 315) & (cols >= 92) & (cols <= 164)
    else:
        # Long bottoms own the seated thigh and calf, but never source shoes.
        envelope = (rows >= 282) & (rows < SHOE_LOCK_Y) & (cols >= 92) & (cols <= 164)
    return visible & envelope


def compose(slug: str) -> Image.Image:
    if slug not in SOURCES:
        raise KeyError(slug)
    result = np.asarray(canonical_underlay()).copy()
    source = np.asarray(normalized_source(SOURCES[slug]))
    mask = garment_mask(slug, source)
    result[mask] = source[mask]
    result[result[..., 3] <= 8, :3] = 0
    result[result[..., 3] <= 8, 3] = 0
    return Image.fromarray(result)


def expected_outputs() -> dict[str, Path]:
    return {slug: OUTPUT_DIR / f"{slug}-garment-only-seated-v1.png" for slug in TARGETS}


def _checker(size: tuple[int, int], cell: int = 12) -> Image.Image:
    return source_pipeline._checker(size, cell)


def _board(outputs: dict[str, Path]) -> None:
    cols, cell_w, cell_h = 3, 360, 390
    board = Image.new("RGB", (cols * cell_w, 90 + cell_h * 2), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title, subtitle in (
        (board, "BLUMI MALE · SITTING V15 · GARMENT-ONLY OVERLAY", "canonical arms, legs and shoes locked · candidate only"),
        (closeups, "BLUMI MALE · SITTING V15 · 4× CONTACT CHECK", "no source arms, legs or shoes may leak into the composite"),
    ):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), subtitle, fill="#796976")
    for index, slug in enumerate(TARGETS):
        x, y = (index % cols) * cell_w, 90 + (index // cols) * cell_h
        avatar = Image.open(outputs[slug]).convert("RGBA")
        panel = _checker((192, 288))
        panel.alpha_composite(avatar.resize((192, 288), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 84, y))
        ImageDraw.Draw(board).text((x + 16, y + 304), slug, fill="#382c37")
        contact = avatar.crop((72, 268, 184, 360)).resize((312, 256), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 24, y))
        ImageDraw.Draw(closeups).text((x + 16, y + 270), slug, fill="#382c37")
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
            "method": "garment-only-semantic-overlay-on-canonical-sitting-rig",
            "source": str(source.relative_to(ROOT)),
            "sourceSha256": _sha(source),
            "candidate": str(outputs[slug].relative_to(ROOT)),
            "candidateOnly": True,
        })
    _board(outputs)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "rejectedMethod": "full-source-lower-body-overlay",
        "method": "garment-only-semantic-overlay-on-canonical-sitting-rig",
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUPS.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
