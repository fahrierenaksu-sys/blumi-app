#!/usr/bin/env python3
"""Render every male bottom/shoe static pairing as a hem-contact QA matrix."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CANVAS_SIZE = (256, 384)
CONTACT_CROP = (72, 286, 184, 384)
CONTACT_ZOOM = 2
LABEL_HEIGHT = 40
CELL_PADDING = 8
CONTACT_SIZE = (
    (CONTACT_CROP[2] - CONTACT_CROP[0]) * CONTACT_ZOOM,
    (CONTACT_CROP[3] - CONTACT_CROP[1]) * CONTACT_ZOOM,
)
CELL_SIZE = (
    max(360, CONTACT_SIZE[0] + CELL_PADDING * 2),
    LABEL_HEIGHT + CONTACT_SIZE[1] + CELL_PADDING,
)
BACKGROUND_NAMES = ("checkerboard", "black")
SAFE_PNG_FILENAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,98}\.png")
SAFE_SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,47}")


@dataclass(frozen=True)
class CompatibilityMatrixResult:
    bottom_count: int
    shoe_count: int
    combination_count: int
    bottom_slugs: tuple[str, ...]
    shoe_slugs: tuple[str, ...]
    cell_size: tuple[int, int]
    output_path: Path


def _validate_safe_png_filename(filename: str) -> str:
    candidate = Path(filename)
    if (
        candidate.is_absolute()
        or candidate.name != filename
        or SAFE_PNG_FILENAME.fullmatch(filename) is None
    ):
        raise ValueError(
            "shoe layer filename must be a safe PNG filename without directories"
        )
    return filename


def _validate_slug(slug: str, category: str) -> str:
    if SAFE_SLUG.fullmatch(slug) is None:
        raise ValueError(f"unsafe {category} slug: {slug!r}")
    return slug


def _load_layer(path: Path, label: str) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"missing {label} layer: {path}")
    with Image.open(path) as opened:
        if opened.size != CANVAS_SIZE:
            raise ValueError(
                f"{label} layer must be 256x384; received "
                f"{opened.size[0]}x{opened.size[1]} at {path}"
            )
        if opened.mode != "RGBA":
            raise ValueError(
                f"{label} layer must use RGBA mode; received {opened.mode} at {path}"
            )
        opened.load()
        return opened.copy()


def _discover_layers(
    root: Path,
    *,
    category: str,
    layer_filename: str,
) -> tuple[tuple[str, Path], ...]:
    if not root.is_dir():
        raise ValueError(f"no {category} layers found under {root}")

    discovered = []
    for path in root.glob(f"*/rig/{layer_filename}"):
        slug = _validate_slug(path.parents[1].name, category.rstrip("s"))
        discovered.append((slug, path))
    discovered.sort(key=lambda item: (item[0].casefold(), item[0]))

    if not discovered:
        raise ValueError(f"no {category} layers found under {root}")
    return tuple(discovered)


def _compose_combination(
    base: Image.Image,
    face: Image.Image,
    shoe: Image.Image,
    bottom: Image.Image,
    top: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    composite = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    for layer in (base, face, shoe, bottom, top, hair):
        if layer.mode != "RGBA" or layer.size != CANVAS_SIZE:
            raise ValueError("composite layers must be 256x384 RGBA images")
        composite = Image.alpha_composite(composite, layer)
    return composite


def _checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    checker = Image.new("RGBA", size, (244, 240, 244, 255))
    draw = ImageDraw.Draw(checker)
    alternate = (211, 205, 211, 255)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (
                        x,
                        y,
                        min(x + square - 1, size[0] - 1),
                        min(y + square - 1, size[1] - 1),
                    ),
                    fill=alternate,
                )
    return checker


def _flatten(composite: Image.Image, background: str) -> Image.Image:
    if background == "checkerboard":
        flattened = _checkerboard(CANVAS_SIZE)
    elif background == "black":
        flattened = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 255))
    else:
        raise ValueError(f"unsupported background: {background}")
    flattened.alpha_composite(composite)
    return flattened


def _render_cell(
    composite: Image.Image,
    *,
    bottom_slug: str,
    shoe_slug: str,
    background: str,
) -> Image.Image:
    if background not in BACKGROUND_NAMES:
        raise ValueError(f"unsupported background: {background}")

    panel_color = (
        (250, 247, 250, 255)
        if background == "checkerboard"
        else (18, 18, 20, 255)
    )
    text_color = (
        (39, 32, 40, 255)
        if background == "checkerboard"
        else (248, 246, 248, 255)
    )
    cell = Image.new("RGBA", CELL_SIZE, panel_color)
    draw = ImageDraw.Draw(cell)
    font = ImageFont.load_default()
    draw.text(
        (CELL_PADDING, 5),
        f"bottom: {bottom_slug}",
        font=font,
        fill=text_color,
    )
    draw.text(
        (CELL_PADDING, 20),
        f"shoe: {shoe_slug}",
        font=font,
        fill=text_color,
    )

    closeup = _flatten(composite, background).crop(CONTACT_CROP)
    closeup = closeup.resize(CONTACT_SIZE, Image.Resampling.NEAREST)
    contact_x = (CELL_SIZE[0] - CONTACT_SIZE[0]) // 2
    cell.alpha_composite(closeup, (contact_x, LABEL_HEIGHT))
    return cell


def render_compatibility_matrix(
    candidate_bottom_root: Path,
    shoe_root: Path,
    *,
    canonical_base_path: Path,
    canonical_face_path: Path,
    canonical_top_path: Path,
    canonical_hair_path: Path,
    output_path: Path,
    shoe_layer_filename: str = "static.png",
    background: str = "checkerboard",
) -> CompatibilityMatrixResult:
    """Render a deterministic matrix with shoes as columns and bottoms as rows."""

    layer_filename = _validate_safe_png_filename(shoe_layer_filename)
    if background not in BACKGROUND_NAMES:
        raise ValueError(f"unsupported background: {background}")
    if output_path.suffix.lower() != ".png":
        raise ValueError("output path must use a .png filename")

    bottoms = _discover_layers(
        candidate_bottom_root,
        category="bottom",
        layer_filename="static.png",
    )
    shoes = _discover_layers(
        shoe_root,
        category="shoe",
        layer_filename=layer_filename,
    )
    base = _load_layer(canonical_base_path, "canonical base")
    face = _load_layer(canonical_face_path, "canonical face")
    top = _load_layer(canonical_top_path, "canonical top")
    hair = _load_layer(canonical_hair_path, "canonical hair")

    board = Image.new(
        "RGBA",
        (len(shoes) * CELL_SIZE[0], len(bottoms) * CELL_SIZE[1]),
        (0, 0, 0, 255),
    )
    for row, (bottom_slug, bottom_path) in enumerate(bottoms):
        bottom = _load_layer(bottom_path, f"bottom {bottom_slug}")
        for column, (shoe_slug, shoe_path) in enumerate(shoes):
            shoe = _load_layer(shoe_path, f"shoe {shoe_slug}")
            composite = _compose_combination(base, face, shoe, bottom, top, hair)
            cell = _render_cell(
                composite,
                bottom_slug=bottom_slug,
                shoe_slug=shoe_slug,
                background=background,
            )
            board.alpha_composite(
                cell,
                (column * CELL_SIZE[0], row * CELL_SIZE[1]),
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(output_path, format="PNG", optimize=True)
    return CompatibilityMatrixResult(
        bottom_count=len(bottoms),
        shoe_count=len(shoes),
        combination_count=len(bottoms) * len(shoes),
        bottom_slugs=tuple(slug for slug, _path in bottoms),
        shoe_slugs=tuple(slug for slug, _path in shoes),
        cell_size=CELL_SIZE,
        output_path=output_path,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Render all male bottom x shoe static combinations as a magnified "
            "hem/shoe compatibility matrix."
        )
    )
    parser.add_argument("--candidate-bottom-root", type=Path, required=True)
    parser.add_argument("--shoe-root", type=Path, required=True)
    parser.add_argument("--shoe-layer-filename", default="static.png")
    parser.add_argument("--canonical-base", type=Path, required=True)
    parser.add_argument("--canonical-face", type=Path, required=True)
    parser.add_argument("--canonical-top", type=Path, required=True)
    parser.add_argument("--canonical-hair", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--background", choices=BACKGROUND_NAMES, default="checkerboard")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    result = render_compatibility_matrix(
        args.candidate_bottom_root,
        args.shoe_root,
        canonical_base_path=args.canonical_base,
        canonical_face_path=args.canonical_face,
        canonical_top_path=args.canonical_top,
        canonical_hair_path=args.canonical_hair,
        output_path=args.output,
        shoe_layer_filename=args.shoe_layer_filename,
        background=args.background,
    )
    print(
        json.dumps(
            {
                "bottom_count": result.bottom_count,
                "shoe_count": result.shoe_count,
                "combination_count": result.combination_count,
                "output_path": str(result.output_path),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
