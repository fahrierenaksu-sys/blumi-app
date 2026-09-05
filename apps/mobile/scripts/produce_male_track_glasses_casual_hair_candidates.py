#!/usr/bin/env python3
"""Rig and review the replacement track top, glasses, and casual male hairs."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
REDESIGN = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
MASTER_CANVAS = (1024, 1536)

BODY = REDESIGN / "candidates/canonical/body/rig/body-male-light-unified-v3.png"
APPROVED_HAIR = (
    REDESIGN
    / "candidates/hair/espresso_crop/rig/hair-front-review-natural-v3.png"
)
BOTTOM = (
    REDESIGN
    / "candidates/bottom/navy_straight_pants/rig/static-review-natural-v4.png"
)
CREAM_TOP = ROOM / "avatar_room_top_male_cream_basic_tee_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"

TOP_SOURCE = (
    REDESIGN
    / "candidates/top/modern_track_luxury_top/rig/imagegen-master-alpha-v5.png"
)
TOP_OUTPUT = (
    REDESIGN
    / "candidates/top/modern_track_luxury_top/rig/static-review-natural-fit-v5.png"
)

ACCESSORY_SOURCES = {
    slug: (
        REDESIGN
        / f"candidates/accessory/{slug}/rig/imagegen-master-alpha-v4.png"
    )
    for slug in (
        "slim_oval_glasses",
        "soft_rectangular_glasses",
        "translucent_wrap_glasses",
    )
}
ACCESSORY_OUTPUTS = {
    slug: (
        REDESIGN
        / f"candidates/accessory/{slug}/rig/static-review-natural-fit-v4.png"
    )
    for slug in ACCESSORY_SOURCES
}
GLASSES_TARGETS = {
    "slim_oval_glasses": (101, 161, 155, 175),
    "soft_rectangular_glasses": (102, 160, 154, 175),
    "translucent_wrap_glasses": (101, 160, 155, 176),
}

HAIR_SOURCES = {
    slug: (
        REDESIGN
        / f"candidates/hair/{slug}/rig/imagegen-master-alpha-v2.png"
    )
    for slug in (
        "casual_side_swept_crop",
        "casual_soft_messy_fringe",
        "casual_relaxed_short_waves",
    )
}
HAIR_OUTPUTS = {
    slug: REDESIGN / f"candidates/hair/{slug}/rig/hair-front-review-natural-v1.png"
    for slug in HAIR_SOURCES
}
HAIR_COLORS = {
    "casual_side_swept_crop": "natural soft black",
    "casual_soft_messy_fringe": "sandy blond",
    "casual_relaxed_short_waves": "kumral / light chestnut",
}
HAIR_ENVELOPE = (72, 102, 186, 199)

REVIEW_BOARD = REDESIGN / "male-track-glasses-casual-hair-v1-review-board.png"
MANIFEST = REDESIGN / "male-track-glasses-casual-hair-v1-manifest.json"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path, size: tuple[int, int] = CANVAS) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != size:
        raise ValueError(f"{path}: expected {size}, received {image.size}")
    return _clean(image)


def _fit_source(
    path: Path,
    target_box: tuple[int, int, int, int],
    *,
    preserve_aspect: bool,
) -> Image.Image:
    source = _load(path, MASTER_CANVAS)
    source_box = source.getchannel("A").getbbox()
    if source_box is None:
        raise ValueError(f"{path}: empty alpha")
    cropped = source.crop(source_box)
    width = target_box[2] - target_box[0]
    height = target_box[3] - target_box[1]
    if preserve_aspect:
        scale = min(width / cropped.width, height / cropped.height)
        size = (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        )
        x = target_box[0] + (width - size[0]) // 2
        y = target_box[1] + (height - size[1]) // 2
    else:
        size = (width, height)
        x, y = target_box[:2]
    fitted = cropped.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, (x, y))
    return _clean(output)


def build_track_top() -> Image.Image:
    source = _load(TOP_SOURCE, MASTER_CANVAS)
    return _clean(source.resize(CANVAS, Image.Resampling.LANCZOS))


def build_glasses(slug: str) -> Image.Image:
    if slug not in ACCESSORY_SOURCES:
        raise KeyError(slug)
    return _fit_source(
        ACCESSORY_SOURCES[slug],
        GLASSES_TARGETS[slug],
        preserve_aspect=False,
    )


def build_hair(slug: str) -> Image.Image:
    if slug not in HAIR_SOURCES:
        raise KeyError(slug)
    return _fit_source(
        HAIR_SOURCES[slug],
        HAIR_ENVELOPE,
        preserve_aspect=True,
    )


def _checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (252, 249, 251, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, x + square - 1, y + square - 1),
                    fill=(230, 226, 230, 255),
                )
    return image


def _compose(
    *,
    top: Image.Image | None = None,
    hair: Image.Image | None = None,
    accessory: Image.Image | None = None,
) -> Image.Image:
    composite = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BODY),
        _load(BOTTOM),
        _load(SHOES),
        top or _load(CREAM_TOP),
        hair or _load(APPROVED_HAIR),
        accessory,
    ):
        if layer is not None:
            composite = Image.alpha_composite(composite, layer)
    return _clean(composite)


def _panel(
    title: str,
    subtitle: str,
    composite: Image.Image,
    close_box: tuple[int, int, int, int],
) -> Image.Image:
    panel = Image.new("RGBA", (420, 760), (255, 248, 251, 255))
    draw = ImageDraw.Draw(panel)
    draw.text((16, 14), title, fill=(48, 34, 44, 255))
    draw.text((16, 35), subtitle, fill=(116, 74, 96, 255))
    full = _checkerboard(CANVAS)
    full.alpha_composite(composite)
    panel.alpha_composite(full, (82, 66))

    close = composite.crop(close_box).resize((360, 270), Image.Resampling.NEAREST)
    close_bg = _checkerboard(close.size, 10)
    close_bg.alpha_composite(close)
    panel.alpha_composite(close_bg, (30, 478))
    return panel


def _write_layer(path: Path, layer: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _clean(layer).save(path, optimize=True)


def produce() -> dict:
    top = build_track_top()
    glasses = {slug: build_glasses(slug) for slug in ACCESSORY_SOURCES}
    hairs = {slug: build_hair(slug) for slug in HAIR_SOURCES}

    _write_layer(TOP_OUTPUT, top)
    for slug, layer in glasses.items():
        _write_layer(ACCESSORY_OUTPUTS[slug], layer)
    for slug, layer in hairs.items():
        _write_layer(HAIR_OUTPUTS[slug], layer)

    panels = [
        _panel(
            "modern_track_luxury_top v5",
            "redrawn · closed high-neck · body-registered",
            _compose(top=top),
            (74, 200, 182, 310),
        )
    ]
    for slug, layer in glasses.items():
        panels.append(
            _panel(
                f"{slug} v4",
                "new geometry · canonical eye-line",
                _compose(accessory=layer),
                (82, 132, 174, 200),
            )
        )
    for slug, layer in hairs.items():
        panels.append(
            _panel(
                slug,
                f"{HAIR_COLORS[slug]} · skull-envelope fit",
                _compose(hair=layer),
                (62, 86, 194, 210),
            )
        )

    board = Image.new("RGBA", (1680, 1520), (244, 237, 242, 255))
    for index, panel in enumerate(panels):
        board.alpha_composite(panel, ((index % 4) * 420, (index // 4) * 760))
    board.convert("RGB").save(REVIEW_BOARD, optimize=True)

    items = [
        {
            "slug": "modern_track_luxury_top",
            "category": "top",
            "fitProfile": "closed_high_neck_track_jacket",
            "source": _relative(TOP_SOURCE),
            "candidate": _relative(TOP_OUTPUT),
        }
    ]
    items.extend(
        {
            "slug": slug,
            "category": "accessory",
            "fitProfile": "canonical_eye_line",
            "source": _relative(ACCESSORY_SOURCES[slug]),
            "candidate": _relative(ACCESSORY_OUTPUTS[slug]),
        }
        for slug in glasses
    )
    items.extend(
        {
            "slug": slug,
            "category": "hair",
            "color": HAIR_COLORS[slug],
            "fitProfile": "canonical_skull_envelope",
            "source": _relative(HAIR_SOURCES[slug]),
            "candidate": _relative(HAIR_OUTPUTS[slug]),
        }
        for slug in hairs
    )
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "explicitUserApproval": False,
        "method": "item-specific-imagegen-redraw-chroma-alpha-canonical-registration",
        "items": items,
        "reviewBoard": {
            "path": _relative(REVIEW_BOARD),
            "sha256": _sha256(REVIEW_BOARD),
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    print(json.dumps(produce(), indent=2))


if __name__ == "__main__":
    main()
