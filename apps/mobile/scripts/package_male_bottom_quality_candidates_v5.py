#!/usr/bin/env python3
"""Package four corrected male-bottom candidates for static visual review.

This script is candidate-only. It never writes runtime wardrobe or motion
assets. The straight candidate comes from the canonical system-v2 fit proof;
the colorblock candidate comes from a purpose-redrawn ImageGen master.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
BOTTOM_CANDIDATES = REDESIGN / "candidates/bottom"
STRAIGHT_SOURCE = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-27/"
    "straight-utility-tailored-v2/step-2-utility-tailored-preview-layer.png"
)
COLORBLOCK_SOURCE = (
    BOTTOM_CANDIDATES
    / "colorblock_nylon_track_pants/source-v5/"
    "colorblock-track-chibi-fit-v5-alpha.png"
)
WIDE_SOURCE = (
    BOTTOM_CANDIDATES
    / "wide_pleated_technical_trousers/source-v18/"
    "wide-pleated-natural-fit-v18-alpha.png"
)
STRAIGHT_SOURCE_SHA256 = (
    "c4276ac6d353291ba3a00308437633aeb6f865782d9213c9326cebbb5d323a6f"
)
COLORBLOCK_SOURCE_SHA256 = (
    "e03dc73376139327a74c468989f9a6481cd3037c2e91e262d891ad3735df74dd"
)
WIDE_SOURCE_SHA256 = (
    "6c50a27e56a66c2720da9facb80149217b40997d0d81663afc90e61730703fee"
)
CANVAS = (256, 384)
COLORBLOCK_BOX = (96, 286, 160, 339)
WIDE_BOX = (96, 286, 160, 339)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        return opened.convert("RGBA")


def _clean_hidden_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _verify_sources() -> None:
    sources = (
        (STRAIGHT_SOURCE, STRAIGHT_SOURCE_SHA256),
        (COLORBLOCK_SOURCE, COLORBLOCK_SOURCE_SHA256),
        (WIDE_SOURCE, WIDE_SOURCE_SHA256),
    )
    for path, expected in sources:
        actual = _sha256(path)
        if actual != expected:
            raise ValueError(f"candidate source drift: {path} ({actual})")


def build_straight_layer() -> Image.Image:
    """Return the approved straight-fit proof without its antialias overscan."""

    layer = _load(STRAIGHT_SOURCE)
    pixels = np.asarray(layer).copy()
    pixels[:286] = 0
    alpha = pixels[..., 3]
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    pixels[..., 3] = alpha
    pixels[alpha == 0, :3] = 0
    return Image.fromarray(pixels)


def build_colorblock_layer(source: Image.Image) -> Image.Image:
    """Register the purpose-redrawn track pant to the canonical chibi box."""

    rgba = _clean_hidden_rgb(source)
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("colorblock source has no visible garment")
    artwork = rgba.crop(bbox).resize(
        (
            COLORBLOCK_BOX[2] - COLORBLOCK_BOX[0],
            COLORBLOCK_BOX[3] - COLORBLOCK_BOX[1],
        ),
        Image.Resampling.LANCZOS,
    )
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(artwork, COLORBLOCK_BOX[:2])

    # The waistband must sit under the canonical test tee, not spike beside it.
    pixels = np.asarray(layer).copy()
    pixels[286:294, :99] = 0
    pixels[286:294, 157:] = 0
    for y in range(286, 294):
        source_band = pixels[y, 116:140]
        source_visible = source_band[source_band[:, 3] > 8, :3]
        if source_visible.size:
            purple = np.median(source_visible, axis=0).astype(np.uint8)
            visible = pixels[y, 99:157, 3] > 8
            pixels[y, 99:157, :3][visible] = purple
    for y in range(303, 339):
        half_gap = min(5, 1 + (y - 303) // 9)
        pixels[y, 128 - half_gap : 128 + half_gap] = 0
    alpha = pixels[..., 3]
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    pixels[..., 3] = alpha
    pixels[alpha == 0, :3] = 0
    return Image.fromarray(pixels)


def build_wide_layer(source: Image.Image) -> Image.Image:
    """Register a purpose-redrawn full-length relaxed trouser to the chibi rig."""

    rgba = _clean_hidden_rgb(source)
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("wide trouser source has no visible garment")
    artwork = rgba.crop(bbox).resize(
        (
            WIDE_BOX[2] - WIDE_BOX[0],
            WIDE_BOX[3] - WIDE_BOX[1],
        ),
        Image.Resampling.LANCZOS,
    )
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(artwork, WIDE_BOX[:2])
    pixels = np.asarray(layer).copy()
    pixels[286:294, :99] = 0
    pixels[286:294, 157:] = 0

    # Keep a real crotch bridge through y=302, then open a narrow monotonic V.
    for y in range(286, 303):
        neighbors = np.concatenate(
            (pixels[y, 120:126], pixels[y, 130:136]),
            axis=0,
        )
        visible = neighbors[neighbors[:, 3] > 8]
        if visible.size:
            fill = np.median(visible, axis=0).astype(np.uint8)
            fill[3] = 255
            pixels[y, 127:129] = fill
    for y in range(303, 339):
        half_gap = min(5, 1 + (y - 303) // 9)
        pixels[y, 128 - half_gap : 128 + half_gap] = 0

    alpha = pixels[..., 3]
    alpha[alpha < 8] = 0
    alpha[alpha > 247] = 255
    pixels[..., 3] = alpha
    pixels[alpha == 0, :3] = 0
    return Image.fromarray(pixels)


def _room(filename: str) -> Image.Image:
    layer = _load(ROOM / filename)
    if layer.size != CANVAS:
        raise ValueError(f"{filename} must use the canonical 256x384 rig")
    return layer


def _composite_bottom(
    layer: Image.Image,
    *,
    shoe_over_hem: bool = False,
) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    body_layers = (
        _room("avatar_room_base_male_light_v1.png"),
        _room("avatar_room_face_male_warm_friendly_v1.png"),
    )
    contact_layers = (
        (
            layer,
            _room("avatar_room_shoes_male_milk_tea_court_v1.png"),
        )
        if shoe_over_hem
        else (
            _room("avatar_room_shoes_male_milk_tea_court_v1.png"),
            layer,
        )
    )
    for current in (
        *body_layers,
        *contact_layers,
        _room("avatar_room_top_male_cream_basic_tee_v1.png"),
        _room("avatar_room_hair_front_male_espresso_crop_v1.png"),
    ):
        result = Image.alpha_composite(result, current)
    return result


def _checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    result = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(result)
    colors = ((255, 253, 254, 255), (227, 223, 227, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return result


def _review_row(label: str, composite: Image.Image) -> Image.Image:
    row = Image.new("RGBA", (1980, 384), (250, 244, 248, 255))
    draw = ImageDraw.Draw(row)
    draw.text((18, 16), label, fill=(64, 39, 52, 255), font=ImageFont.load_default())

    full = _checkerboard((256, 384))
    full.alpha_composite(composite)
    row.alpha_composite(full, (280, 0))
    crops = (
        ("WAIST", (88, 276, 168, 306), 6),
        ("CROTCH", (94, 294, 162, 327), 6),
        ("HEM / SHOE", (88, 318, 168, 352), 6),
    )
    x = 560
    for crop_label, crop, scale in crops:
        panel = composite.crop(crop).resize(
            ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale),
            Image.Resampling.NEAREST,
        )
        background = _checkerboard(panel.size)
        background.alpha_composite(panel)
        draw.text((x, 16), crop_label, fill=(64, 39, 52, 255))
        row.alpha_composite(background, (x, 42))
        x += panel.width + 24
    return row


def _write_review_board(
    destination: Path,
    wide: Image.Image,
    straight: Image.Image,
    colorblock: Image.Image,
) -> None:
    rows = (
        (
            "USER-APPROVED / charcoal_tapered_chinos",
            _load(
                BOTTOM_CANDIDATES
                / "charcoal_tapered_chinos/rig/composite-review-baseline-v3.png"
            ),
        ),
        (
            "IMAGEGEN V18 / wide_pleated_technical_trousers",
            wide,
        ),
        ("SYSTEM V2 / straight_utility_tailored_trousers", straight),
        ("IMAGEGEN V5 / colorblock_nylon_track_pants", colorblock),
    )
    board = Image.new("RGBA", (1980, 384 * len(rows)), (250, 244, 248, 255))
    for index, (label, composite) in enumerate(rows):
        board.alpha_composite(_review_row(label, composite), (0, index * 384))
    board.convert("RGB").save(destination, optimize=True)


def package_candidates(destination_root: Path) -> dict[str, Path]:
    _verify_sources()
    straight_layer = build_straight_layer()
    colorblock_layer = build_colorblock_layer(_load(COLORBLOCK_SOURCE))
    wide_layer = build_wide_layer(_load(WIDE_SOURCE))
    straight_composite = _composite_bottom(
        straight_layer,
        shoe_over_hem=True,
    )
    colorblock_composite = _composite_bottom(colorblock_layer)
    wide_composite = _composite_bottom(wide_layer)

    straight_rig = destination_root / "straight_utility_tailored_trousers/rig"
    colorblock_rig = destination_root / "colorblock_nylon_track_pants/rig"
    wide_rig = destination_root / "wide_pleated_technical_trousers/rig"
    straight_rig.mkdir(parents=True, exist_ok=True)
    colorblock_rig.mkdir(parents=True, exist_ok=True)
    wide_rig.mkdir(parents=True, exist_ok=True)
    outputs = {
        "straight_static": straight_rig / "static-review-system-v2.png",
        "straight_composite": straight_rig / "composite-review-system-v2.png",
        "colorblock_static": colorblock_rig / "static-review-natural-fit-v5.png",
        "colorblock_composite": colorblock_rig / "composite-review-natural-fit-v5.png",
        "wide_static": wide_rig / "static-review-natural-fit-v18.png",
        "wide_composite": wide_rig / "composite-review-natural-fit-v18.png",
        "review_board": destination_root / "male-bottom-four-repair-review-v5.png",
        "manifest": destination_root / "male-bottom-four-repair-manifest-v5.json",
    }
    straight_layer.save(outputs["straight_static"])
    straight_composite.save(outputs["straight_composite"])
    colorblock_layer.save(outputs["colorblock_static"])
    colorblock_composite.save(outputs["colorblock_composite"])
    wide_layer.save(outputs["wide_static"])
    wide_composite.save(outputs["wide_composite"])
    _write_review_board(
        outputs["review_board"],
        wide_composite,
        straight_composite,
        colorblock_composite,
    )
    manifest = {
        "schemaVersion": 1,
        "status": "candidate_only_pending_independent_review",
        "runtimePromoted": False,
        "sources": {
            str(STRAIGHT_SOURCE.relative_to(REPO)): STRAIGHT_SOURCE_SHA256,
            str(COLORBLOCK_SOURCE.relative_to(REPO)): COLORBLOCK_SOURCE_SHA256,
            str(WIDE_SOURCE.relative_to(REPO)): WIDE_SOURCE_SHA256,
        },
        "selections": {
            "charcoal_tapered_chinos": "user_approved_baseline_v3",
            "wide_pleated_technical_trousers": "natural_fit_v18",
            "straight_utility_tailored_trousers": "system_v2",
            "colorblock_nylon_track_pants": "natural_fit_v5",
        },
    }
    outputs["manifest"].write_text(json.dumps(manifest, indent=2) + "\n")
    return outputs


def main() -> None:
    outputs = package_candidates(BOTTOM_CANDIDATES)
    print(json.dumps({key: str(path.relative_to(REPO)) for key, path in outputs.items()}, indent=2))


if __name__ == "__main__":
    main()
