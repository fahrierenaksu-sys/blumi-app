#!/usr/bin/env python3
"""Build one canonical male head-neck-body layer with a natural joint."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
OUTPUT_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
    "candidates/canonical/body"
)
RIG = OUTPUT_ROOT / "rig"
REVIEW = OUTPUT_ROOT / "static-review-unified-v3"
BODY_OUTPUT = RIG / "body-male-light-unified-v3.png"
PROOF_OUTPUT = REVIEW / "head-neck-body-unified-v3-proof.png"
MANIFEST_OUTPUT = REVIEW / "head-neck-body-unified-v3-manifest.json"
CANVAS = (256, 384)
JOINT_POLYGON = (
    (112, 214),
    (143, 214),
    (143, 218),
    (145, 220),
    (148, 223),
    (151, 226),
    (154, 229),
    (155, 232),
    (157, 236),
    (158, 240),
    (98, 240),
    (99, 236),
    (100, 232),
    (101, 229),
    (104, 226),
    (107, 223),
    (110, 220),
    (112, 218),
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _joint_mask() -> Image.Image:
    scale = 4
    mask = Image.new("L", (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        tuple((x * scale, y * scale) for x, y in JOINT_POLYGON),
        fill=255,
    )
    return mask.resize(CANVAS, Image.Resampling.LANCZOS)


def _skin_bridge(base: Image.Image) -> Image.Image:
    base_pixels = np.asarray(base.convert("RGBA"))
    bridge = np.zeros_like(base_pixels)
    for y in range(212, 242):
        source_y = max(223, y)
        center = base_pixels[source_y, 128, :3].astype(float)
        for x in range(96, 161):
            edge_distance = abs(x - 128) / 32
            shade = 1.0 - 0.018 * min(1.0, edge_distance)
            bridge[y, x, :3] = np.rint(center * shade).astype(np.uint8)
            bridge[y, x, 3] = 255
    return Image.fromarray(bridge)


def build_unified_body(
    base: Image.Image,
    face: Image.Image,
) -> Image.Image:
    if base.size != CANVAS or face.size != CANVAS:
        raise ValueError("canonical base and face must be 256x384")
    canonical_base = base.convert("RGBA")
    canonical_face = face.convert("RGBA")

    bridged_base = Image.composite(
        _skin_bridge(canonical_base),
        canonical_base,
        _joint_mask(),
    )
    repaired_face = canonical_face.copy()
    base_pixels = bridged_base.load()
    face_pixels = repaired_face.load()
    # Remove the lower face outline only where the new continuous body exists.
    # The jaw, facial features, ears, and all pixels above the joint are kept.
    for y in range(218, 223):
        for x in range(96, 161):
            if base_pixels[x, y][3] > 0 and face_pixels[x, y][3] > 0:
                face_pixels[x, y] = (0, 0, 0, 0)

    return _clean(Image.alpha_composite(bridged_base, repaired_face))


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
    original: Image.Image,
    unified: Image.Image,
) -> Image.Image:
    crop = (92, 188, 164, 244)
    scale = 6
    close_size = (
        (crop[2] - crop[0]) * scale,
        (crop[3] - crop[1]) * scale,
    )
    board = Image.new(
        "RGBA",
        (close_size[0] * 2, close_size[1] + 48),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    draw.text((12, 14), "BEFORE · separate face/base joint", fill=(65, 42, 55, 255))
    draw.text(
        (close_size[0] + 12, 14),
        "AFTER · one unified body layer",
        fill=(65, 42, 55, 255),
    )
    for index, image in enumerate((original, unified)):
        close = image.crop(crop).resize(
            close_size,
            Image.Resampling.NEAREST,
        )
        panel = _checkerboard(close_size)
        panel.alpha_composite(close)
        board.alpha_composite(panel, (index * close_size[0], 48))
    return board


def produce() -> dict:
    base = Image.open(BASE).convert("RGBA")
    face = Image.open(FACE).convert("RGBA")
    original = Image.alpha_composite(base, face)
    unified = build_unified_body(base, face)
    proof = _render_proof(original, unified)

    RIG.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    unified.save(BODY_OUTPUT, optimize=True)
    proof.convert("RGB").save(PROOF_OUTPUT, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "single-layer-head-neck-body-with-trapezius-bridge",
        "inputs": {
            _relative(BASE): _sha256(BASE),
            _relative(FACE): _sha256(FACE),
        },
        "outputs": {
            _relative(BODY_OUTPUT): _sha256(BODY_OUTPUT),
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
                "body": _relative(BODY_OUTPUT),
                "proof": _relative(PROOF_OUTPUT),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
