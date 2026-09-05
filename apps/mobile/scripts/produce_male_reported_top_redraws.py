#!/usr/bin/env python3
"""Package two user-reported male tops as item-specific redraw candidates."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from render_male_wardrobe_54_progress_board import CANVAS, _checkerboard


REPO_ROOT = Path(__file__).resolve().parents[3]
REDESIGN = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
BODY = (
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
SHOES = (
    REPO_ROOT
    / "apps/mobile/src/features/avatarV2/assets/room/"
    "avatar_room_shoes_male_milk_tea_court_v1.png"
)
SOURCES = {
    "contemporary_resort_street_top": (
        REDESIGN
        / "candidates/top/contemporary_resort_street_top/rig/"
        "imagegen-master-alpha-v3.png"
    ),
    "modern_track_luxury_top": (
        REDESIGN
        / "candidates/top/modern_track_luxury_top/rig/"
        "imagegen-master-alpha-v4.png"
    ),
}
OUTPUTS = {
    "contemporary_resort_street_top": (
        REDESIGN
        / "candidates/top/contemporary_resort_street_top/rig/"
        "static-review-natural-fit-v3.png"
    ),
    "modern_track_luxury_top": (
        REDESIGN
        / "candidates/top/modern_track_luxury_top/rig/"
        "static-review-natural-fit-v4.png"
    ),
}
REVIEW_BOARD = REDESIGN / "male-reported-top-redraws-v4-review-board.png"
MANIFEST = REDESIGN / "male-reported-top-redraws-v4-manifest.json"


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


def _native(master: Image.Image) -> Image.Image:
    if master.size != (1024, 1536):
        raise ValueError(f"expected 1024x1536 master, received {master.size}")
    return _clean(master.resize(CANVAS, Image.Resampling.LANCZOS))


def build_resort() -> Image.Image:
    master = _load(SOURCES["contemporary_resort_street_top"], (1024, 1536))
    alpha = master.getchannel("A")
    cut = Image.new("L", master.size, 0)
    ImageDraw.Draw(cut).polygon(
        (
            (466, 850),
            (558, 850),
            (548, 884),
            (514, 962),
            (476, 882),
        ),
        fill=255,
    )
    alpha_pixels = np.asarray(alpha).copy()
    cut_pixels = np.asarray(cut)
    alpha_pixels[cut_pixels > 0] = 0
    pixels = np.asarray(master).copy()
    pixels[..., 3] = alpha_pixels
    return _native(Image.fromarray(pixels))


def build_track() -> Image.Image:
    master = _load(SOURCES["modern_track_luxury_top"], (1024, 1536))
    repaired = master.copy()
    draw = ImageDraw.Draw(repaired)
    # The generated inner collar was an opaque near-black cavity. Replace it
    # with the visible front fabric of a zipped high-neck tube. The canonical
    # neck terminates behind this front plane; no rear collar ring is rendered.
    collar = (
        (470, 858),
        (554, 858),
        (558, 870),
        (550, 888),
        (520, 896),
        (504, 896),
        (474, 888),
        (466, 870),
    )
    draw.polygon(collar, fill=(55, 59, 96, 255))
    draw.line(
        ((472, 860), (490, 854), (534, 854), (552, 860)),
        fill=(94, 99, 142, 255),
        width=6,
        joint="curve",
    )
    draw.line((512, 860, 512, 902), fill=(35, 37, 62, 255), width=8)
    draw.rounded_rectangle(
        (506, 866, 518, 894),
        radius=5,
        fill=(157, 91, 35, 255),
    )
    return _native(repaired)


def _compose(top: Image.Image) -> Image.Image:
    composite = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BODY),
        _load(BOTTOM),
        _load(SHOES),
        top,
        _load(HAIR),
    ):
        composite = Image.alpha_composite(composite, layer)
    return _clean(composite)


def _panel(slug: str, layer: Image.Image, profile: str) -> Image.Image:
    panel = Image.new("RGBA", (840, 760), (255, 248, 251, 255))
    draw = ImageDraw.Draw(panel)
    draw.text((20, 16), slug, fill=(48, 34, 44, 255))
    draw.text((20, 36), profile, fill=(116, 74, 96, 255))
    composite = _compose(layer)

    full = _checkerboard(CANVAS)
    full.alpha_composite(composite)
    panel.alpha_composite(full, (36, 78))

    close = composite.crop((76, 198, 180, 312)).resize(
        (520, 570),
        Image.Resampling.NEAREST,
    )
    close_bg = _checkerboard(close.size, square=20)
    close_bg.alpha_composite(close)
    panel.alpha_composite(close_bg, (300, 78))

    raw = layer.crop((70, 198, 186, 312)).resize(
        (232, 228),
        Image.Resampling.NEAREST,
    )
    raw_bg = _checkerboard(raw.size, square=16)
    raw_bg.alpha_composite(raw)
    panel.alpha_composite(raw_bg, (36, 472))
    draw.text((36, 448), "raw candidate layer", fill=(116, 74, 96, 255))
    return panel


def produce() -> dict:
    layers = {
        "contemporary_resort_street_top": build_resort(),
        "modern_track_luxury_top": build_track(),
    }
    profiles = {
        "contemporary_resort_street_top": (
            "shirt_open_camp_collar · canonical neck passes through front opening"
        ),
        "modern_track_luxury_top": (
            "hoodie_or_sweat_closed_neck · high collar wraps canonical neck"
        ),
    }
    board = Image.new("RGBA", (1680, 760), (244, 237, 242, 255))
    items = []
    for index, (slug, layer) in enumerate(layers.items()):
        output = OUTPUTS[slug]
        output.parent.mkdir(parents=True, exist_ok=True)
        layer.save(output, optimize=True)
        board.alpha_composite(_panel(slug, layer, profiles[slug]), (index * 840, 0))
        items.append(
            {
                "slug": slug,
                "profile": profiles[slug],
                "source": {
                    "path": _relative(SOURCES[slug]),
                    "sha256": _sha256(SOURCES[slug]),
                },
                "candidate": {
                    "path": _relative(output),
                    "sha256": _sha256(output),
                },
            }
        )

    board.convert("RGB").save(REVIEW_BOARD, optimize=True)
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "item-specific-imagegen-redraw-plus-alpha-registration",
        "items": items,
        "reviewBoard": {
            "path": _relative(REVIEW_BOARD),
            "sha256": _sha256(REVIEW_BOARD),
        },
        "explicitUserApproval": False,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    print(json.dumps(produce(), indent=2))


if __name__ == "__main__":
    main()
