#!/usr/bin/env python3
"""Build seated proof candidates directly from authored on-base masters.

This is an evidence-only reset for the three seated items whose extracted
bottom-only candidates still looked cut, pasted, or side-spilling. It keeps
the authored seated anatomy intact by using the approved on-base masters as the
review surface instead of forcing another bottom-layer extraction pass.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
CANVAS = (256, 384)
SOURCE_DIR = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v11-reillustrated/masters"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v18-master-native"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD_PATH = EVIDENCE / "male-bottom-three-master-native-review-board.png"
CLOSEUPS_PATH = EVIDENCE / "male-bottom-three-master-native-closeups.png"
MANIFEST = EVIDENCE / "male-bottom-three-master-native-manifest.json"

SOURCES = {
    "colorblock_nylon_track_pants": SOURCE_DIR / "colorblock-nylon-track-pants-sitting-master-v3-1024.png",
    "refined_utility_cargo_shorts": SOURCE_DIR / "refined-utility-cargo-shorts-sitting-master-v3-1024.png",
    "contemporary_resort_street_bottom": SOURCE_DIR / "contemporary-resort-street-bottom-sitting-master-v4-1024.png",
}

CLEANUPS = {
    "contemporary_resort_street_bottom": {
        "target_boxes": ((80, 266, 118, 292), (138, 266, 176, 292)),
        "sample_box": (104, 264, 152, 304),
        "min_saturation": 20,
    }
}


def _background_mask(rgb: np.ndarray) -> np.ndarray:
    height, width = rgb.shape[:2]
    border = np.concatenate(
        (
            rgb[:24].reshape(-1, 3),
            rgb[-24:].reshape(-1, 3),
            rgb[:, :24].reshape(-1, 3),
            rgb[:, -24:].reshape(-1, 3),
        )
    )
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


def normalized_master(path: Path) -> Image.Image:
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
        Image.fromarray(premultiplied).resize(CANVAS, Image.Resampling.LANCZOS),
        dtype=np.float32,
    )
    alpha_small = np.asarray(
        Image.fromarray(rgba[..., 3]).resize(CANVAS, Image.Resampling.LANCZOS),
        dtype=np.float32,
    )
    result = np.zeros((CANVAS[1], CANVAS[0], 4), dtype=np.uint8)
    visible = alpha_small > 8
    result[..., 3] = np.where(visible, alpha_small, 0).astype(np.uint8)
    result[..., :3][visible] = np.clip(
        rgb_small[visible] * 255.0 / alpha_small[visible, None],
        0,
        255,
    ).astype(np.uint8)
    return Image.fromarray(result)


def neutralize_saturated_spill(
    image: Image.Image,
    *,
    target_boxes: tuple[tuple[int, int, int, int], ...],
    sample_box: tuple[int, int, int, int],
    min_saturation: int,
) -> Image.Image:
    rgba = np.asarray(image).copy()
    x1, y1, x2, y2 = sample_box
    sample = rgba[y1:y2, x1:x2]
    sat = sample[..., :3].max(axis=2).astype(np.int16) - sample[..., :3].min(axis=2).astype(np.int16)
    neutral = sample[(sample[..., 3] > 8) & (sat <= min_saturation)]
    if neutral.size == 0:
        return image
    neutral_rgb = np.median(neutral[:, :3], axis=0).astype(np.uint8)
    for tx1, ty1, tx2, ty2 in target_boxes:
        region = rgba[ty1:ty2, tx1:tx2]
        region_sat = region[..., :3].max(axis=2).astype(np.int16) - region[..., :3].min(axis=2).astype(np.int16)
        skin_like = (
            (region[..., 0].astype(np.int16) > region[..., 1].astype(np.int16) + 12)
            & (region[..., 0].astype(np.int16) > region[..., 2].astype(np.int16) + 12)
            & (region[..., 0] > 140)
        )
        recolor = (region[..., 3] > 8) & (region_sat > min_saturation) & ~skin_like
        region[recolor, :3] = neutral_rgb
        rgba[ty1:ty2, tx1:tx2] = region
    return Image.fromarray(rgba)


def expected_outputs() -> dict[str, Path]:
    return {slug: OUTPUT_DIR / f"{slug}-master-native-seated-v18.png" for slug in SOURCES}


def _checker(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, "#fff")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#dedade")
    return result


def build_boards(previews: dict[str, Image.Image]) -> tuple[Image.Image, Image.Image]:
    cols, cell_w = 3, 360
    board = Image.new("RGB", (cols * cell_w, 520), "#fff8fc")
    closeups = Image.new("RGB", board.size, "#fff8fc")
    for canvas, title, subtitle in (
        (
            board,
            "BLUMI MALE · SITTING MASTER-NATIVE V18",
            "direct on-base seated proofs · no runtime promotion · extraction deferred",
        ),
        (
            closeups,
            "BLUMI MALE · SITTING MASTER-NATIVE V18 · 4× CONTACT CHECK",
            "waist / thighs / hem / shoe contact",
        ),
    ):
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 18), title, fill="#382c37")
        draw.text((18, 48), subtitle, fill="#796976")
    for index, slug in enumerate(SOURCES):
        x, y = index * cell_w, 90
        avatar = previews[slug]
        panel = _checker((192, 288))
        panel.alpha_composite(avatar.resize((192, 288), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 84, y))
        ImageDraw.Draw(board).text((x + 16, y + 304), slug, fill="#382c37")
        contact = avatar.crop((70, 250, 186, 364)).resize((312, 304), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 24, y))
        ImageDraw.Draw(closeups).text((x + 16, y + 318), slug, fill="#382c37")
    return board, closeups


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def produce() -> dict:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = expected_outputs()
    previews: dict[str, Image.Image] = {}
    records = []
    for slug, source in SOURCES.items():
        avatar = normalized_master(source)
        if slug in CLEANUPS:
            avatar = neutralize_saturated_spill(avatar, **CLEANUPS[slug])
        avatar.save(outputs[slug], optimize=True)
        previews[slug] = avatar
        records.append(
            {
                "slug": slug,
                "method": "master-native-seated-proof",
                "source": str(source.relative_to(ROOT)),
                "sourceSha256": _sha(source),
                "candidate": str(outputs[slug].relative_to(ROOT)),
                "candidateSha256": _sha(outputs[slug]),
            }
        )
    board, closeups = build_boards(previews)
    board.save(BOARD_PATH, optimize=True)
    closeups.save(CLOSEUPS_PATH, optimize=True)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "replacedMethods": [
            "rectangular-garment-envelope-overlay",
            "garment-only-seated-shell-with-canonical-contact-stack",
        ],
        "method": "master-native-seated-proof",
        "items": records,
        "boards": [
            str(BOARD_PATH.relative_to(ROOT)),
            str(CLOSEUPS_PATH.relative_to(ROOT)),
        ],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
