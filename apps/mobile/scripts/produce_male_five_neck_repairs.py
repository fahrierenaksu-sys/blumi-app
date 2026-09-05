#!/usr/bin/env python3
"""Repair five reported male collars on the continuous canonical neck."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw

from render_male_wardrobe_66_progress_board import (
    DEFAULT_CATALOG,
    DEFAULT_MANIFEST,
    DEFAULT_SELECTION,
    REPO_ROOT,
    resolve_authoritative_items,
)


ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
BASE = ROOM / "avatar_room_base_male_light_v1.png"
CONTINUOUS_FACE = (
    REDESIGN
    / "candidates/canonical/face/rig/"
    "face-male-warm-friendly-neck-continuity-v2.png"
)
HAIR = (
    REDESIGN
    / "candidates/hair/espresso_crop/rig/"
    "hair-front-review-natural-v3.png"
)
BOTTOM = (
    REDESIGN
    / "candidates/bottom/navy_straight_pants/rig/"
    "static-review-natural-v4.png"
)
SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
OUTPUT_BOARD = REDESIGN / "male-five-neck-continuity-v2-review-board.png"
OUTPUT_MANIFEST = REDESIGN / "male-five-neck-continuity-v2-manifest.json"
VERSION = "neck-continuity-v2"
CANVAS = (256, 384)

# Product-specific rear-plane removal portals. They reveal only the existing
# canonical body inside the collar; garment color/detail is never synthesized.
PRODUCTS: dict[str, dict] = {
    "cream_basic_tee": {
        "family": "tshirt_closed_crew",
        "portal": (),
        "method": "continuous-face-under-existing-clean-crew",
    },
    "diagonal_seam_zip_mock_neck": {
        "family": "hoodie_or_sweat_closed_neck",
        "portal": (),
        "fill_front": (
            (122, 215),
            (134, 215),
            (136, 224),
            (120, 224),
        ),
        "fillSourceBox": (116, 229, 132, 235),
        "fillShade": 0.9,
        "method": "closed-mock-neck-full-front-seat",
    },
    "soft_varsity_knit_jacket": {
        "family": "jacket_closed_high_neck",
        "portalBaseConstrained": False,
        "portal": (
            (114, 214),
            (142, 214),
            (142, 220),
            (135, 222),
            (133, 224),
            (123, 224),
            (121, 222),
            (114, 220),
        ),
        "method": "preserve-front-rib-shoulders-remove-rear-triangle",
    },
    "cropped_cocoa_moto_jacket": {
        "family": "jacket_closed_high_neck",
        "portalBaseConstrained": False,
        "portal": (
            (114, 214),
            (142, 214),
            (142, 220),
            (136, 222),
            (133, 224),
            (123, 224),
            (120, 222),
            (114, 220),
        ),
        "method": "preserve-moto-collar-sides-remove-inner-rear-disk",
    },
    "asymmetric_utility_overshirt": {
        "family": "jacket_closed_high_neck",
        "portal": (
            (124, 215),
            (132, 215),
            (133, 218),
            (133, 221),
            (131, 223),
            (125, 223),
            (123, 221),
            (123, 218),
        ),
        "method": "preserve-upright-front-sides-open-neck-core",
    },
}

REJECTED_IMAGEGEN = {
    "cream_basic_tee": (
        Path(
            "/Users/evrenevren/.codex/generated_images/"
            "019faa3e-dd78-7c91-bb0f-940dfceaff03/"
            "call_MgnBG4R7xhPxF18ghsUY7HFW.png"
        ),
        "adult-scale-and-baked-checkerboard",
    ),
    "diagonal_seam_zip_mock_neck": (
        Path(
            "/Users/evrenevren/.codex/generated_images/"
            "019faa3e-dd78-7c91-bb0f-940dfceaff03/"
            "call_3vWSYqsqfPpZYNmGYY8Wmycr.png"
        ),
        "adult-scale-and-baked-checkerboard",
    ),
    "soft_varsity_knit_jacket": (
        Path(
            "/Users/evrenevren/.codex/generated_images/"
            "019faa3e-dd78-7c91-bb0f-940dfceaff03/"
            "call_MlNxvG23RcfBcHfrdAA0tQUq.png"
        ),
        "adult-scale-and-baked-checkerboard",
    ),
    "cropped_cocoa_moto_jacket": (
        Path(
            "/Users/evrenevren/.codex/generated_images/"
            "019faa3e-dd78-7c91-bb0f-940dfceaff03/"
            "call_QVKUvAgTA29XpUtTuuQjouf8.png"
        ),
        "adult-scale-and-baked-checkerboard",
    ),
    "asymmetric_utility_overshirt": (
        Path(
            "/Users/evrenevren/.codex/generated_images/"
            "019faa3e-dd78-7c91-bb0f-940dfceaff03/"
            "call_pr34VkBLTr6bnR3cj2H4Drce.png"
        ),
        "adult-scale-and-baked-checkerboard",
    ),
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


def _live_items() -> dict[str, object]:
    items = resolve_authoritative_items(
        repository_root=REPO_ROOT,
        catalog_path=DEFAULT_CATALOG,
        manifest_path=DEFAULT_MANIFEST,
        selection_path=DEFAULT_SELECTION,
    )
    return {item.slug: item for item in items}


def load_selected_top(slug: str) -> Image.Image:
    if slug not in PRODUCTS:
        raise KeyError(slug)
    item = _live_items()[slug]
    if item.category != "top":
        raise ValueError(f"{slug} is not a live top")
    return _load(item.layer_path)


def _shape_mask(points: tuple[tuple[int, int], ...]) -> Image.Image:
    scale = 4
    mask = Image.new("L", (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    if points:
        ImageDraw.Draw(mask).polygon(
            tuple((x * scale, y * scale) for x, y in points),
            fill=255,
        )
    return mask.resize(CANVAS, Image.Resampling.LANCZOS)


def _portal_mask(
    points: tuple[tuple[int, int], ...],
    *,
    constrain_to_base: bool,
) -> Image.Image:
    mask = _shape_mask(points)
    if not constrain_to_base:
        return mask
    return ImageChops.multiply(mask, _load(BASE).getchannel("A"))


def _fill_front_from_native_sides(
    source: Image.Image,
    points: tuple[tuple[int, int], ...],
) -> Image.Image:
    """Close a front collar using only same-row native garment pixels."""
    if not points:
        return source.copy()
    mask = _shape_mask(points)
    source_pixels = np.asarray(source).copy()
    fill_pixels = np.zeros_like(source_pixels)
    minimum_x = min(x for x, _ in points)
    maximum_x = max(x for x, _ in points)
    minimum_y = min(y for _, y in points)
    maximum_y = max(y for _, y in points)
    for y in range(minimum_y, maximum_y + 1):
        left = next(
            (
                x
                for x in range(minimum_x - 1, 113, -1)
                if source_pixels[y, x, 3] >= 96
            ),
            None,
        )
        right = next(
            (
                x
                for x in range(maximum_x + 1, 143)
                if source_pixels[y, x, 3] >= 96
            ),
            None,
        )
        if left is None or right is None:
            continue
        span = max(1, right - left)
        for x in range(minimum_x, maximum_x + 1):
            weight = (x - left) / span
            fill_pixels[y, x] = np.rint(
                source_pixels[y, left] * (1.0 - weight)
                + source_pixels[y, right] * weight
            ).astype(np.uint8)
    fill = Image.fromarray(fill_pixels)
    return _clean(Image.composite(fill, source, mask))


def _fill_front_from_native_below(
    source: Image.Image,
    points: tuple[tuple[int, int], ...],
    *,
    source_offset: int,
    shade: float,
) -> Image.Image:
    """Seat a high collar with texture copied from its own intact front."""
    mask = _shape_mask(points)
    source_pixels = np.asarray(source).copy()
    fill_pixels = np.zeros_like(source_pixels)
    minimum_x = min(x for x, _ in points)
    maximum_x = max(x for x, _ in points)
    minimum_y = min(y for _, y in points)
    maximum_y = max(y for _, y in points)
    for y in range(minimum_y, maximum_y + 1):
        source_y = min(CANVAS[1] - 1, y + source_offset)
        for x in range(minimum_x, maximum_x + 1):
            native = source_pixels[source_y, x].copy()
            native[:3] = np.rint(native[:3] * shade).astype(np.uint8)
            fill_pixels[y, x] = native
    fill = Image.fromarray(fill_pixels)
    return _clean(Image.composite(fill, source, mask))


def _fill_front_from_native_patch(
    source: Image.Image,
    points: tuple[tuple[int, int], ...],
    *,
    source_box: tuple[int, int, int, int],
    shade: float,
) -> Image.Image:
    """Scale one clean native fabric patch into the collar front."""
    minimum_x = min(x for x, _ in points)
    maximum_x = max(x for x, _ in points)
    minimum_y = min(y for _, y in points)
    maximum_y = max(y for _, y in points)
    size = (maximum_x - minimum_x + 1, maximum_y - minimum_y + 1)
    patch = source.crop(source_box).resize(size, Image.Resampling.LANCZOS)
    patch_pixels = np.asarray(patch).copy()
    patch_pixels[..., :3] = np.rint(
        patch_pixels[..., :3] * shade
    ).astype(np.uint8)
    fill = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    fill.alpha_composite(Image.fromarray(patch_pixels), (minimum_x, minimum_y))
    return _clean(Image.composite(fill, source, _shape_mask(points)))


def build_repaired_top(slug: str) -> Image.Image:
    source = load_selected_top(slug)
    points = PRODUCTS[slug]["portal"]
    result = source.copy()
    if points:
        result.putalpha(
            ImageChops.subtract(
                result.getchannel("A"),
                _portal_mask(
                    points,
                    constrain_to_base=PRODUCTS[slug].get(
                        "portalBaseConstrained",
                        True,
                    ),
                ),
            )
        )
    fill_front = PRODUCTS[slug].get("fill_front", ())
    if fill_front:
        source_box = PRODUCTS[slug].get("fillSourceBox")
        if source_box is not None:
            result = _fill_front_from_native_patch(
                result,
                fill_front,
                source_box=source_box,
                shade=PRODUCTS[slug]["fillShade"],
            )
        else:
            source_offset = PRODUCTS[slug].get("fillSourceOffset")
        if source_box is None and source_offset is None:
            result = _fill_front_from_native_sides(result, fill_front)
        elif source_box is None:
            result = _fill_front_from_native_below(
                result,
                fill_front,
                source_offset=source_offset,
                shade=PRODUCTS[slug]["fillShade"],
            )
    return _clean(result)


def compose_repaired(slug: str) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        _load(BASE),
        _load(CONTINUOUS_FACE),
        _load(BOTTOM),
        _load(SHOES),
        build_repaired_top(slug),
        _load(HAIR),
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


def _output_paths(slug: str) -> tuple[Path, Path]:
    rig = REDESIGN / f"candidates/top/{slug}/rig"
    return (
        rig / f"static-review-{VERSION}.png",
        rig / f"composite-review-{VERSION}.png",
    )


def _render_board(composites: dict[str, Image.Image]) -> Image.Image:
    slugs = tuple(PRODUCTS)
    # Close-up evidence must remain fully visible; clipping can hide collar
    # defects and would make the approval board misleading.
    tile = (360, 704)
    board = Image.new(
        "RGBA",
        (tile[0] * len(slugs), tile[1]),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    crop = (96, 196, 160, 248)
    for index, slug in enumerate(slugs):
        x = index * tile[0]
        draw.text((x + 12, 12), slug, fill=(57, 41, 51, 255))
        full = _checkerboard(CANVAS)
        full.alpha_composite(composites[slug])
        board.alpha_composite(full, (x + 12, 42))
        close = composites[slug].crop(crop).resize(
            (320, 260),
            Image.Resampling.NEAREST,
        )
        close_bg = _checkerboard(close.size, 10)
        close_bg.alpha_composite(close)
        board.alpha_composite(close_bg, (x + 12, 430))
    return board


def produce() -> dict:
    selected_files: dict[str, dict] = {}
    composites: dict[str, Image.Image] = {}
    for slug in PRODUCTS:
        static_path, composite_path = _output_paths(slug)
        static_path.parent.mkdir(parents=True, exist_ok=True)
        top = build_repaired_top(slug)
        composite = compose_repaired(slug)
        top.save(static_path, optimize=True)
        composite.save(composite_path, optimize=True)
        composites[slug] = composite
        selected_files[slug] = {
            "family": PRODUCTS[slug]["family"],
            "method": PRODUCTS[slug]["method"],
            "static": {
                "path": _relative(static_path),
                "sha256": _sha256(static_path),
            },
            "composite": {
                "path": _relative(composite_path),
                "sha256": _sha256(composite_path),
            },
        }

    board = _render_board(composites)
    board.convert("RGB").save(OUTPUT_BOARD, optimize=True)
    rejected = {
        slug: {
            "path": path.as_posix(),
            "sha256": _sha256(path),
            "reason": reason,
        }
        for slug, (path, reason) in REJECTED_IMAGEGEN.items()
    }
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "explicitUserApproval": False,
        "canonicalFace": {
            "path": _relative(CONTINUOUS_FACE),
            "sha256": _sha256(CONTINUOUS_FACE),
        },
        "items": selected_files,
        "reviewBoard": {
            "path": _relative(OUTPUT_BOARD),
            "sha256": _sha256(OUTPUT_BOARD),
        },
        "rejectedImagegenAttempts": rejected,
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
