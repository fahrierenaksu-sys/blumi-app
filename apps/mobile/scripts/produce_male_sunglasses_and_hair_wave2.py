#!/usr/bin/env python3
"""Rig wave-two male sunglasses and distinct casual hair candidates."""

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
TOP = ROOM / "avatar_room_top_male_cream_basic_tee_v1.png"
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"

SUNGLASSES_TARGETS = {
    "tortoiseshell_smoke_sunglasses": (94, 155, 162, 181),
    "matte_black_panto_sunglasses": (94, 155, 162, 181),
}
SUNGLASSES_OUTPUTS = {
    slug: (
        REDESIGN
        / f"candidates/accessory/{slug}/rig/static-review-natural-fit-v3.png"
    )
    for slug in SUNGLASSES_TARGETS
}

HAIR_TARGETS = {
    "copper_compact_quiff": (73, 102, 185, 195),
    "ash_blond_low_fade_crop": (72, 101, 185, 195),
    "blue_black_short_curls": (71, 101, 186, 196),
}
HAIR_COLORS = {
    "copper_compact_quiff": "copper-auburn",
    "ash_blond_low_fade_crop": "cool ash blond",
    "blue_black_short_curls": "deep blue-black",
}
HAIR_STYLES = {
    "copper_compact_quiff": "compact brushed-back quiff",
    "ash_blond_low_fade_crop": "casual textured side crop",
    "blue_black_short_curls": "short natural wave crop",
}
HAIR_SOURCES = {
    slug: REDESIGN / f"candidates/hair/{slug}/rig/imagegen-master-alpha-v3.png"
    for slug in HAIR_COLORS
}
HAIR_OUTPUTS = {
    slug: REDESIGN / f"candidates/hair/{slug}/rig/hair-front-review-natural-v3.png"
    for slug in HAIR_COLORS
}

REVIEW_BOARD = REDESIGN / "male-sunglasses-and-hair-wave2-v3-review-board.png"
MANIFEST = REDESIGN / "male-sunglasses-and-hair-wave2-v3-manifest.json"


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path, size: tuple[int, int] | None) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if size is not None and image.size != size:
        raise ValueError(f"{path}: expected {size}, received {image.size}")
    return _clean(image)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _fit(
    path: Path,
    target_box: tuple[int, int, int, int],
    *,
    preserve_aspect: bool,
) -> Image.Image:
    source = _load(path, None)
    source_box = source.getchannel("A").getbbox()
    if source_box is None:
        raise ValueError(f"{path}: empty source")
    cropped = source.crop(source_box)
    width = target_box[2] - target_box[0]
    height = target_box[3] - target_box[1]
    if preserve_aspect:
        scale = min(width / cropped.width, height / cropped.height)
        size = (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        )
        position = (
            target_box[0] + (width - size[0]) // 2,
            target_box[1] + (height - size[1]) // 2,
        )
    else:
        size = (width, height)
        position = target_box[:2]
    fitted = cropped.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, position)
    return _clean(output)


def _draw_sunglasses_master(slug: str) -> Image.Image:
    if slug not in SUNGLASSES_TARGETS:
        raise KeyError(slug)

    scale = 4
    width = 68 * scale
    height = 26 * scale
    master = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(master)

    if slug == "tortoiseshell_smoke_sunglasses":
        rim = (92, 52, 29, 255)
        rim_light = (190, 119, 50, 235)
        lens = (54, 40, 31, 205)
        lens_highlight = (255, 220, 164, 55)
    else:
        rim = (31, 36, 39, 255)
        rim_light = (96, 105, 108, 210)
        lens = (28, 38, 40, 215)
        lens_highlight = (202, 227, 226, 48)

    def box(left: int, top: int, right: int, bottom: int) -> tuple[int, ...]:
        return tuple(value * scale for value in (left, top, right, bottom))

    # Short complete temples terminate under the hair layer instead of hanging
    # down the cheeks. The two fronts, bridge and hinges remain one frame.
    draw.rounded_rectangle(box(0, 8, 8, 12), radius=2 * scale, fill=rim)
    draw.rounded_rectangle(box(60, 8, 68, 12), radius=2 * scale, fill=rim)
    draw.rounded_rectangle(box(4, 3, 31, 24), radius=8 * scale, fill=rim)
    draw.rounded_rectangle(box(37, 3, 64, 24), radius=8 * scale, fill=rim)
    draw.rounded_rectangle(box(7, 6, 28, 21), radius=6 * scale, fill=lens)
    draw.rounded_rectangle(box(40, 6, 61, 21), radius=6 * scale, fill=lens)
    draw.arc(box(28, 6, 40, 16), 205, 335, fill=rim, width=3 * scale)
    draw.rounded_rectangle(box(4, 8, 8, 14), radius=2 * scale, fill=rim_light)
    draw.rounded_rectangle(box(60, 8, 64, 14), radius=2 * scale, fill=rim_light)
    draw.arc(box(6, 4, 29, 21), 190, 330, fill=rim_light, width=scale)
    draw.arc(box(39, 4, 62, 21), 210, 350, fill=rim_light, width=scale)
    draw.arc(box(9, 7, 24, 17), 195, 300, fill=lens_highlight, width=scale)
    draw.arc(box(42, 7, 57, 17), 195, 300, fill=lens_highlight, width=scale)
    return master


def build_sunglasses(slug: str) -> Image.Image:
    target = SUNGLASSES_TARGETS[slug]
    master = _draw_sunglasses_master(slug)
    fitted = master.resize((68, 26), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, target[:2])
    return _clean(output)


def build_hair(slug: str) -> Image.Image:
    if slug not in HAIR_SOURCES:
        raise KeyError(slug)
    return _fit(HAIR_SOURCES[slug], HAIR_TARGETS[slug], preserve_aspect=True)


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
    hair: Image.Image | None = None,
    sunglasses: Image.Image | None = None,
) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BODY, CANVAS),
        _load(BOTTOM, CANVAS),
        _load(SHOES, CANVAS),
        _load(TOP, CANVAS),
        sunglasses,
        hair or _load(APPROVED_HAIR, CANVAS),
    ):
        if layer is not None:
            output = Image.alpha_composite(output, layer)
    return _clean(output)


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


def _save(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _clean(image).save(path, optimize=True)


def produce() -> dict:
    sunglasses = {slug: build_sunglasses(slug) for slug in SUNGLASSES_TARGETS}
    hairs = {slug: build_hair(slug) for slug in HAIR_SOURCES}
    for slug, layer in sunglasses.items():
        _save(SUNGLASSES_OUTPUTS[slug], layer)
    for slug, layer in hairs.items():
        _save(HAIR_OUTPUTS[slug], layer)

    panels = []
    for slug, layer in sunglasses.items():
        panels.append(
            _panel(
                slug,
                "sunglasses · complete frame · +12% lens scale",
                _compose(sunglasses=layer),
                (82, 132, 174, 200),
            )
        )
    for slug, layer in hairs.items():
        panels.append(
            _panel(
                slug,
                f"{HAIR_COLORS[slug]} · {HAIR_STYLES[slug]}",
                _compose(hair=layer),
                (62, 86, 194, 210),
            )
        )
    board = Image.new("RGBA", (2100, 760), (244, 237, 242, 255))
    for index, panel in enumerate(panels):
        board.alpha_composite(panel, (index * 420, 0))
    board.convert("RGB").save(REVIEW_BOARD, optimize=True)

    items = [
        *(
            {
                "slug": slug,
                "category": "accessory",
                "role": "sunglasses",
                "source": _relative(Path(__file__).resolve()),
                "productionMethod": "deterministic_4x_complete_frame",
                "candidate": _relative(SUNGLASSES_OUTPUTS[slug]),
            }
            for slug in sunglasses
        ),
        *(
            {
                "slug": slug,
                "category": "hair",
                "color": HAIR_COLORS[slug],
                "source": _relative(HAIR_SOURCES[slug]),
                "candidate": _relative(HAIR_OUTPUTS[slug]),
            }
            for slug in hairs
        ),
    ]
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "explicitUserApproval": False,
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
