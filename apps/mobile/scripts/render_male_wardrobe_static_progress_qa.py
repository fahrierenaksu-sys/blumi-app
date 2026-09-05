#!/usr/bin/env python3
"""Render an internal static-fit board without weakening the final 54-item gate."""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CANVAS_SIZE = (256, 384)
CELL_SIZE = (360, 270)
FULL_BODY_SIZE = (128, 192)
CONTACT_CROP = (55, 145, 201, 330)
SHOE_CONTACT_CROP = (72, 286, 184, 384)
CONTACT_SIZE = (200, 224)


@dataclass(frozen=True)
class ProgressBoardResult:
    item_count: int
    slugs: tuple[str, ...]
    output_path: Path


def _checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (250, 247, 250, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, min(x + square - 1, size[0] - 1), min(y + square - 1, size[1] - 1)),
                    fill=(231, 226, 231, 255),
                )
    return image


def _flatten_on_checkerboard(image: Image.Image) -> Image.Image:
    background = _checkerboard(image.size)
    background.alpha_composite(image)
    return background


def _fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    fitted = image.copy()
    fitted.thumbnail(size, Image.Resampling.LANCZOS)
    return fitted


def _fit_closeup(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = min(size[0] / image.width, size[1] / image.height)
    fitted_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    return image.resize(fitted_size, Image.Resampling.LANCZOS)


def _render_cell(
    composite: Image.Image,
    slug: str,
    ordinal: int,
    *,
    contact_crop: tuple[int, int, int, int],
) -> Image.Image:
    cell = Image.new("RGBA", CELL_SIZE, (255, 248, 251, 255))
    draw = ImageDraw.Draw(cell)
    font = ImageFont.load_default()
    draw.text((10, 8), f"{ordinal:02d}  {slug}", font=font, fill=(47, 37, 48, 255))

    flattened = _flatten_on_checkerboard(composite)
    full_body = _fit(flattened, FULL_BODY_SIZE)
    cell.alpha_composite(full_body, (8, 34))

    contact = flattened.crop(contact_crop)
    contact = _fit_closeup(contact, CONTACT_SIZE)
    contact_x = 146 + (CONTACT_SIZE[0] - contact.width) // 2
    contact_y = 34 + (CONTACT_SIZE[1] - contact.height) // 2
    cell.alpha_composite(contact, (contact_x, contact_y))
    return cell


def render_progress_board(
    candidate_root: Path,
    output_path: Path,
    *,
    columns: int = 6,
    contact_region: str = "garment",
    composite_name: str = "composite.png",
) -> ProgressBoardResult:
    if columns < 1:
        raise ValueError("columns must be positive")
    contact_crops = {
        "garment": CONTACT_CROP,
        "shoe": SHOE_CONTACT_CROP,
    }
    if contact_region not in contact_crops:
        raise ValueError(f"unsupported contact region: {contact_region}")
    if Path(composite_name).name != composite_name or not composite_name.endswith(".png"):
        raise ValueError("composite name must be a PNG filename")

    composite_paths = sorted(candidate_root.glob(f"*/rig/{composite_name}"))
    if not composite_paths:
        raise ValueError(f"no static composites found under {candidate_root}")

    slugs = tuple(path.parents[1].name for path in composite_paths)
    rows = math.ceil(len(composite_paths) / columns)
    board = Image.new(
        "RGBA",
        (columns * CELL_SIZE[0], rows * CELL_SIZE[1]),
        (244, 237, 242, 255),
    )

    for index, (slug, path) in enumerate(zip(slugs, composite_paths)):
        composite = Image.open(path).convert("RGBA")
        if composite.size != CANVAS_SIZE:
            raise ValueError(f"{slug} composite must be 256x384; received {composite.size}")
        cell = _render_cell(
            composite,
            slug,
            index + 1,
            contact_crop=contact_crops[contact_region],
        )
        board.alpha_composite(
            cell,
            ((index % columns) * CELL_SIZE[0], (index // columns) * CELL_SIZE[1]),
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(output_path, optimize=True)
    return ProgressBoardResult(len(composite_paths), slugs, output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--contact-region", choices=("garment", "shoe"), default="garment")
    parser.add_argument("--composite-name", default="composite.png")
    args = parser.parse_args()
    result = render_progress_board(
        args.candidate_root,
        args.output,
        columns=args.columns,
        contact_region=args.contact_region,
        composite_name=args.composite_name,
    )
    print(f"Rendered {result.item_count} candidates to {result.output_path}")


if __name__ == "__main__":
    main()
