#!/usr/bin/env python3
"""Create a clean candidate for the Creative Utility male bottom.

The accepted fabric volume is preserved. Only the contaminated outer purple
fringe and disconnected pixels below the intended hem are removed.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
SOURCE = ROOM / "avatar_room_bottom_male_creative_utility_bottom_v1.png"
SOURCE_SHA256 = "906fe4693bf0a6caf700a8a472af7e7bf86afc893ab4b5f88ba9e02d0e03a970"
OUTPUT = (
    REDESIGN
    / "candidates/bottom/creative_utility_bottom/rig/static-review-edge-clean-v2.png"
)
PROOF = REDESIGN / "creative-utility-bottom-edge-clean-v2-proof.png"
MANIFEST = REDESIGN / "creative-utility-bottom-edge-clean-v2-manifest.json"
CANVAS = (256, 384)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def clean_bottom() -> Image.Image:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("creative utility source checksum drift")
    pixels = np.asarray(Image.open(SOURCE).convert("RGBA")).copy()
    yy, xx = np.indices(pixels.shape[:2])
    red = pixels[..., 0].astype(np.int16)
    green = pixels[..., 1].astype(np.int16)
    blue = pixels[..., 2].astype(np.int16)
    visible = pixels[..., 3] > 0
    outer = ((xx <= 110) | (xx >= 146)) & (yy >= 282) & (yy <= 325)
    purple = (red > 120) & (blue > 150) & (red > green)
    fringe = outer & visible

    luminance = (
        0.2126 * pixels[..., 0]
        + 0.7152 * pixels[..., 1]
        + 0.0722 * pixels[..., 2]
    )
    value = np.clip((luminance - 70.0) / 150.0, 0.0, 1.0)[..., None]
    shadow = np.asarray((54, 96, 145), dtype=np.float32)
    light = np.asarray((137, 190, 224), dtype=np.float32)
    blue_edge = np.clip(shadow + (light - shadow) * value, 0, 255).astype(np.uint8)
    pixels[fringe, :3] = blue_edge[fringe]

    # Rebuild one continuous front-view inner-leg V. The source contained
    # semi-opaque checker-like strips inside the opening, which read as tears.
    scale = 4
    gap = Image.new("L", (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    gap_draw = ImageDraw.Draw(gap)
    gap_draw.polygon(
        [
            (126 * scale, 303 * scale),
            (130 * scale, 303 * scale),
            (141 * scale, 326 * scale),
            (115 * scale, 326 * scale),
        ],
        fill=255,
    )
    gap = gap.resize(CANVAS, Image.Resampling.LANCZOS)
    pixels[..., 3] = np.minimum(pixels[..., 3], 255 - np.asarray(gap))

    # The intended shorts hem ends before y326. Everything below is detached
    # source residue, not fabric or a drawstring.
    pixels[326:, :] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _checkerboard(size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGBA", size, (250, 247, 249, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], 14):
        for x in range(0, size[0], 14):
            if (x // 14 + y // 14) % 2:
                draw.rectangle((x, y, x + 13, y + 13), fill=(228, 224, 228, 255))
    return output


def _composite(bottom: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for path in (
        ROOM / "avatar_room_base_male_light_v1.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png",
        bottom,
        ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png",
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        layer = path if isinstance(path, Image.Image) else Image.open(path).convert("RGBA")
        output = Image.alpha_composite(output, layer)
    return output


def _proof(cleaned: Image.Image) -> None:
    crop = (78, 266, 178, 340)
    panel_size = (500, 370)
    board = Image.new("RGBA", (panel_size[0] * 3, panel_size[1] + 44), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    sources = (
        ("BEFORE", Image.open(SOURCE).convert("RGBA")),
        ("CLEAN LAYER", cleaned),
        ("CANONICAL COMPOSITE", _composite(cleaned)),
    )
    for index, (label, image) in enumerate(sources):
        preview = image.crop(crop).resize(panel_size, Image.Resampling.NEAREST)
        background = _checkerboard(panel_size)
        background.alpha_composite(preview)
        x = index * panel_size[0]
        board.alpha_composite(background, (x, 44))
        draw.text((x + 12, 14), label, fill=(56, 38, 48, 255))
    board.convert("RGB").save(PROOF, optimize=True)


def produce() -> dict:
    cleaned = clean_bottom()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(OUTPUT, optimize=True)
    _proof(cleaned)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_static_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "source": {"path": _relative(SOURCE), "sha256": SOURCE_SHA256},
        "candidate": {"path": _relative(OUTPUT), "sha256": _sha256(OUTPUT)},
        "proof": {"path": _relative(PROOF), "sha256": _sha256(PROOF)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
