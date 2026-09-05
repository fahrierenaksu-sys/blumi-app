#!/usr/bin/env python3
"""Re-anchor the three reported male glasses to the canonical eye line."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
PREMIUM = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/"
    "candidate-layers/static"
)
REDESIGN = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
UNIFIED_BODY = (
    REDESIGN
    / "candidates/canonical/body/rig/body-male-light-unified-v3.png"
)
HAIR = (
    REDESIGN
    / "candidates/hair/espresso_crop/rig/hair-front-review-natural-v3.png"
)
BOTTOM = (
    REDESIGN
    / "candidates/bottom/navy_straight_pants/rig/static-review-natural-v4.png"
)
TOP = ROOM / "avatar_room_top_male_cream_basic_tee_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
OUTPUT_BOARD = REDESIGN / "male-glasses-natural-fit-v3-review-board.png"
OUTPUT_MANIFEST = REDESIGN / "male-glasses-natural-fit-v3-manifest.json"
CANVAS = (256, 384)
PROFILES = {
    "slim_oval_glasses": {
        "targetBox": (103, 157, 153, 181),
        "method": "slim-oval-eye-line-seat",
    },
    "soft_rectangular_glasses": {
        "targetBox": (104, 158, 152, 182),
        "method": "soft-rectangle-eye-line-seat",
    },
    "translucent_wrap_glasses": {
        "targetBox": (101, 157, 155, 180),
        "method": "translucent-wrap-eye-line-seat",
    },
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return _clean(image)


def load_source(slug: str) -> Image.Image:
    if slug not in PROFILES:
        raise KeyError(slug)
    return _load(PREMIUM / f"{slug}.png")


def build_repaired_glasses(slug: str) -> Image.Image:
    source = load_source(slug)
    source_box = source.getchannel("A").getbbox()
    if source_box is None:
        raise ValueError(f"{slug}: empty source")
    target_box = PROFILES[slug]["targetBox"]
    target_size = (
        target_box[2] - target_box[0],
        target_box[3] - target_box[1],
    )
    fitted = source.crop(source_box).resize(
        target_size,
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, (target_box[0], target_box[1]))
    return _clean(output)


def compose_repaired(slug: str) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(UNIFIED_BODY),
        _load(BOTTOM),
        _load(SHOES),
        _load(TOP),
        _load(HAIR),
        build_repaired_glasses(slug),
    ):
        output = Image.alpha_composite(output, layer)
    return _clean(output)


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


def _output_path(slug: str) -> Path:
    return (
        REDESIGN
        / f"candidates/accessory/{slug}/rig/"
        "static-review-natural-fit-v3.png"
    )


def _render_board(composites: dict[str, Image.Image]) -> Image.Image:
    tile = (420, 700)
    board = Image.new(
        "RGBA",
        (tile[0] * len(PROFILES), tile[1]),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    for index, slug in enumerate(PROFILES):
        x = index * tile[0]
        draw.text((x + 12, 14), slug, fill=(55, 39, 49, 255))
        full = _checkerboard(CANVAS)
        full.alpha_composite(composites[slug])
        board.alpha_composite(full, (x + 82, 44))
        close = composites[slug].crop((84, 132, 172, 202)).resize(
            (352, 280),
            Image.Resampling.NEAREST,
        )
        close_panel = _checkerboard(close.size, 10)
        close_panel.alpha_composite(close)
        board.alpha_composite(close_panel, (x + 34, 430))
    return board


def produce() -> dict:
    items = {}
    composites = {}
    for slug in PROFILES:
        output = _output_path(slug)
        output.parent.mkdir(parents=True, exist_ok=True)
        repaired = build_repaired_glasses(slug)
        repaired.save(output, optimize=True)
        composites[slug] = compose_repaired(slug)
        items[slug] = {
            "method": PROFILES[slug]["method"],
            "targetBox": list(PROFILES[slug]["targetBox"]),
            "source": {
                "path": _relative(PREMIUM / f"{slug}.png"),
                "sha256": _sha256(PREMIUM / f"{slug}.png"),
            },
            "candidate": {
                "path": _relative(output),
                "sha256": _sha256(output),
            },
        }

    board = _render_board(composites)
    board.convert("RGB").save(OUTPUT_BOARD, optimize=True)
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "unifiedBody": {
            "path": _relative(UNIFIED_BODY),
            "sha256": _sha256(UNIFIED_BODY),
        },
        "items": items,
        "reviewBoard": {
            "path": _relative(OUTPUT_BOARD),
            "sha256": _sha256(OUTPUT_BOARD),
        },
        "explicitUserApproval": False,
    }
    OUTPUT_MANIFEST.write_text(
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
                "itemCount": len(manifest["items"]),
                "reviewBoard": manifest["reviewBoard"]["path"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
