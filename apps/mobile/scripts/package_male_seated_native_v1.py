#!/usr/bin/env python3
"""Package the existing on-base seated masters without garment reshaping.

The seated masters are already naturally fitted full-avatar renders. The old
pipeline tried to recover a bottom layer with colour heuristics, which caused
skin, shoes, and garment pixels to be mixed. This candidate keeps the native
on-base render intact and performs only connected background removal,
downsampling, and evidence packaging. It is intentionally not a runtime layer
until the user approves the native composite direction.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_male_bottom_motion_pose_native_v2 as v2


ROOT = v2.REPO_ROOT
MASTERS = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6/item-masters"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v9-native"
)
OUTPUT_DIR = EVIDENCE / "native-seated-composites"
BOARD = EVIDENCE / "male-bottom-19-native-seated-review-board.png"
CLOSEUP_BOARD = EVIDENCE / "male-bottom-19-native-seated-contact-board.png"
MANIFEST = EVIDENCE / "male-bottom-19-native-seated-manifest.json"
CANVAS = (256, 384)
SCALE = 4


def _slug_to_master(slug: str) -> Path:
    stem = slug.replace("_", "-") + "-sitting-master"
    candidates = sorted(MASTERS.glob(f"{stem}-v*-1024.png"), reverse=True)
    if not candidates:
        raise FileNotFoundError(f"missing seated master for {slug}")
    return candidates[0]


def master_paths() -> dict[str, Path]:
    return {item.slug: _slug_to_master(item.slug) for item in v2.ITEMS}


def expected_outputs() -> dict[str, Path]:
    return {slug: OUTPUT_DIR / f"{slug}-native-seated-v1.png" for slug in master_paths()}


def _background_mask(rgb: np.ndarray) -> np.ndarray:
    height, width = rgb.shape[:2]
    border = np.concatenate(
        (rgb[:24].reshape(-1, 3), rgb[-24:].reshape(-1, 3), rgb[:, :24].reshape(-1, 3), rgb[:, -24:].reshape(-1, 3)),
        axis=0,
    )
    reference = np.median(border, axis=0).astype(np.float32)
    distance = np.sqrt(np.sum((rgb.astype(np.float32) - reference) ** 2, axis=2))
    saturation = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    bright = rgb.mean(axis=2)
    candidate = (distance <= 34.0) & (saturation <= 38) & (bright >= 215)
    labels, count = ndimage.label(candidate, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8))
    border_labels = set(np.unique(labels[0])) | set(np.unique(labels[-1])) | set(np.unique(labels[:, 0])) | set(np.unique(labels[:, -1]))
    border_labels.discard(0)
    if not border_labels:
        return np.zeros((height, width), dtype=bool)
    return np.isin(labels, list(border_labels))


def remove_background(master: Image.Image) -> Image.Image:
    if master.size != (CANVAS[0] * SCALE, CANVAS[1] * SCALE):
        raise ValueError(f"expected 1024x1536 seated master, got {master.size}")
    pixels = np.asarray(master.convert("RGBA")).copy()
    background = _background_mask(pixels[..., :3])
    pixels[background, 3] = 0
    pixels[background, :3] = 0
    downsampled = Image.fromarray(pixels).resize(CANVAS, Image.Resampling.LANCZOS)
    output = np.asarray(downsampled).copy()
    output[output[..., 3] <= 8, :3] = 0
    output[output[..., 3] <= 8, 3] = 0
    return Image.fromarray(output)


def _checker(size: tuple[int, int], cell: int = 16) -> Image.Image:
    result = Image.new("RGBA", size, "#fff")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#dedade")
    return result


def _board(outputs: dict[str, Path]) -> None:
    ordered = list(outputs.items())
    cols, cell_w, cell_h = 5, 250, 330
    board = Image.new("RGB", (cols * cell_w, 90 + ((len(ordered) + cols - 1) // cols) * cell_h), "#fff8fc")
    closeups = Image.new("RGB", (cols * cell_w, 90 + ((len(ordered) + cols - 1) // cols) * cell_h), "#fff8fc")
    for image, title in ((board, "BLUMI MALE · NATIVE SEATED COMPOSITES · 19 ITEMS"), (closeups, "BLUMI MALE · NATIVE SEATED CONTACT CHECK")):
        ImageDraw.Draw(image).text((18, 18), title, fill="#382c37")
        ImageDraw.Draw(image).text((18, 48), "on-base master preserved · background cleanup only · runtime closed", fill="#796976")
    for index, (slug, path) in enumerate(ordered):
        row, col = divmod(index, cols)
        x, y = col * cell_w, 90 + row * cell_h
        avatar = Image.open(path).convert("RGBA")
        panel = _checker((180, 270))
        panel.alpha_composite(avatar.resize((180, 270), Image.Resampling.LANCZOS))
        board.paste(panel.convert("RGB"), (x + 35, y))
        contact = avatar.crop((72, 268, 184, 354)).resize((224, 172), Image.Resampling.NEAREST)
        contact_bg = _checker(contact.size, 12)
        contact_bg.alpha_composite(contact)
        closeups.paste(contact_bg.convert("RGB"), (x + 13, y + 8))
        ImageDraw.Draw(board).text((x + 10, y + 278), slug, fill="#382c37")
        ImageDraw.Draw(closeups).text((x + 10, y + 190), slug, fill="#382c37")
    BOARD.parent.mkdir(parents=True, exist_ok=True)
    board.save(BOARD, optimize=True)
    closeups.save(CLOSEUP_BOARD, optimize=True)


def produce() -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = expected_outputs()
    records = []
    for slug, master in master_paths().items():
        output = outputs[slug]
        remove_background(Image.open(master)).save(output, optimize=True)
        records.append({
            "slug": slug,
            "source": {"path": str(master.relative_to(ROOT)), "sha256": hashlib.sha256(master.read_bytes()).hexdigest()},
            "candidate": {"path": str(output.relative_to(ROOT)), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "dimensions": "256x384", "format": "PNG RGBA"},
        })
    _board(outputs)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "recordType": "male_native_seated_composite_candidate",
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "preserve-native-on-base-seated-master-and-remove-connected-background",
        "canonicalBase": "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_male_light_v1.png",
        "items": records,
        "boards": [str(BOARD.relative_to(ROOT)), str(CLOSEUP_BOARD.relative_to(ROOT))],
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
