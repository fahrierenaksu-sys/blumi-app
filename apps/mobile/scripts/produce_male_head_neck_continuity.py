#!/usr/bin/env python3
"""Remove the canonical male face/base neck seam without changing identity."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
OUTPUT_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
    "candidates/canonical/face"
)
RIG = OUTPUT_ROOT / "rig"
REVIEW = OUTPUT_ROOT / "static-review-neck-continuity-v2"
FACE_OUTPUT = RIG / "face-male-warm-friendly-neck-continuity-v2.png"
COMPOSITE_OUTPUT = RIG / "composite-neck-continuity-v2.png"
PROOF_OUTPUT = REVIEW / "head-neck-body-continuity-v2-proof.png"
MANIFEST_OUTPUT = REVIEW / "head-neck-body-continuity-v2-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def build_continuous_face(
    base: Image.Image,
    face: Image.Image,
) -> Image.Image:
    if base.size != CANVAS or face.size != CANVAS:
        raise ValueError("canonical base and face must be 256x384")
    base = base.convert("RGBA")
    source = face.convert("RGBA")
    repaired = source.copy()
    base_pixels = base.load()
    source_pixels = source.load()
    repaired_pixels = repaired.load()

    # The face layer ends with a dark horizontal chin/neck outline at y221-222,
    # while the canonical body already contains the correct continuous neck
    # underneath. Reveal that existing body art only inside their shared alpha
    # overlap. Side/head contours and every facial pixel remain untouched.
    for y in range(221, 223):
        for x in range(CANVAS[0]):
            if (
                base_pixels[x, y][3] > 0
                and source_pixels[x, y][3] > 0
            ):
                repaired_pixels[x, y] = (0, 0, 0, 0)
    return repaired


def _checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (252, 249, 251, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle(
                    (x, y, x + cell - 1, y + cell - 1),
                    fill=(230, 226, 230, 255),
                )
    return image


def _render_proof(
    base: Image.Image,
    original_face: Image.Image,
    repaired_face: Image.Image,
) -> Image.Image:
    crop = (96, 196, 160, 238)
    scale = 8
    panel_size = (
        (crop[2] - crop[0]) * scale,
        (crop[3] - crop[1]) * scale,
    )
    original = Image.alpha_composite(base, original_face)
    repaired = Image.alpha_composite(base, repaired_face)
    panels = []
    for composite in (original, repaired):
        enlarged = composite.crop(crop).resize(
            panel_size,
            Image.Resampling.NEAREST,
        )
        panel = _checkerboard(panel_size)
        panel.alpha_composite(enlarged)
        panels.append(panel)
    header = 38
    board = Image.new(
        "RGBA",
        (panel_size[0] * 2, panel_size[1] + header),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    draw.text((12, 12), "BEFORE · split neck seam", fill=(74, 43, 62, 255))
    draw.text(
        (panel_size[0] + 12, 12),
        "AFTER · continuous canonical neck",
        fill=(74, 43, 62, 255),
    )
    board.alpha_composite(panels[0], (0, header))
    board.alpha_composite(panels[1], (panel_size[0], header))
    return board


def produce() -> dict:
    base = Image.open(BASE).convert("RGBA")
    face = Image.open(FACE).convert("RGBA")
    repaired = build_continuous_face(base, face)
    composite = Image.alpha_composite(base, repaired)
    proof = _render_proof(base, face, repaired)

    RIG.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    repaired.save(FACE_OUTPUT, optimize=True)
    composite.save(COMPOSITE_OUTPUT, optimize=True)
    proof.save(PROOF_OUTPUT, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "reveal-existing-canonical-body-inside-face-base-neck-overlap",
        "allowedEditRows": [221, 222],
        "inputs": {
            _relative(BASE): _sha256(BASE),
            _relative(FACE): _sha256(FACE),
        },
        "outputs": {
            _relative(FACE_OUTPUT): _sha256(FACE_OUTPUT),
            _relative(COMPOSITE_OUTPUT): _sha256(COMPOSITE_OUTPUT),
            _relative(PROOF_OUTPUT): _sha256(PROOF_OUTPUT),
        },
        "explicitUserApproval": False,
        "independentReview": "PENDING",
    }
    MANIFEST_OUTPUT.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    manifest = produce()
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "face": _relative(FACE_OUTPUT),
                "proof": _relative(PROOF_OUTPUT),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
