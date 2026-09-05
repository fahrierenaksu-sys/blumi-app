#!/usr/bin/env python3
"""Normalize an ImageGen character sheet into a runtime atlas.

The image tool can present a gray checker even after a transparent-background
request.  We remove only edge-connected, bright neutral checker pixels; white
areas inside the character outline (shirt, socks, shoes) remain intact.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

CANVAS = (256, 384)
GRID = (4, 2)
VISIBLE_BOTTOM = 372
MIN_VISIBLE_ALPHA = 16


def is_checker_pixel(rgba: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = rgba
    return alpha > 0 and min(red, green, blue) >= 220 and max(red, green, blue) - min(red, green, blue) <= 22


def make_background_transparent(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        seen.add((x, y))
        if not is_checker_pixel(pixels[x, y]):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return rgba


def remove_low_alpha_pixels(image: Image.Image) -> Image.Image:
    """Drop generation fringe while preserving antialiased character edges."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    cleaned_alpha = alpha.point(lambda value: value if value >= MIN_VISIBLE_ALPHA else 0)
    rgba.putalpha(cleaned_alpha)
    return rgba


def keep_primary_component(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A")
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    largest_component: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y] == 0:
                continue
            component: set[tuple[int, int]] = set()
            queue: deque[tuple[int, int]] = deque([(x, y)])
            while queue:
                cx, cy = queue.popleft()
                if (cx, cy) in seen or not (0 <= cx < width and 0 <= cy < height):
                    continue
                seen.add((cx, cy))
                if pixels[cx, cy] == 0:
                    continue
                component.add((cx, cy))
                queue.extend(
                    ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1))
                )
            if len(component) > len(largest_component):
                largest_component = component

    output = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    source_pixels = rgba.load()
    output_pixels = output.load()
    for x, y in largest_component:
        output_pixels[x, y] = source_pixels[x, y]
    return output


def snap_sheet_to_grid(image: Image.Image, grid: tuple[int, int] = GRID) -> Image.Image:
    grid_columns, grid_rows = grid
    width, height = image.size
    target_width = width - (width % grid_columns)
    target_height = height - (height % grid_rows)
    if target_width == width and target_height == height:
        return image
    width_delta = width - target_width
    height_delta = height - target_height
    if width_delta > grid_columns or height_delta > grid_rows:
        raise ValueError(
            f"Expected a near-exact {grid_columns}x{grid_rows} grid, got {width}x{height}"
        )
    left = width_delta // 2
    top = height_delta // 2
    return image.crop((left, top, left + target_width, top + target_height))


def normalize_cell(cell: Image.Image) -> Image.Image:
    primary = keep_primary_component(remove_low_alpha_pixels(cell))
    alpha = primary.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Sprite cell contains no visible character pixels")
    cropped = primary.crop(bounds)
    source_width, source_height = cropped.size
    scale = min(224 / source_width, 338 / source_height)
    resized = cropped.resize((round(source_width * scale), round(source_height * scale)), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = round((CANVAS[0] - resized.width) / 2)
    y = VISIBLE_BOTTOM - resized.height
    output.alpha_composite(resized, (x, y))
    return output


def build_atlas(
    source: Path,
    destination: Path,
    grid: tuple[int, int] = GRID,
) -> None:
    grid_columns, grid_rows = grid
    if grid_columns < 1 or grid_rows < 1:
        raise ValueError("Grid dimensions must be positive")
    source_image = snap_sheet_to_grid(Image.open(source).convert("RGBA"), grid)
    width, height = source_image.size
    transparent = make_background_transparent(source_image)
    cell_width, cell_height = width // grid_columns, height // grid_rows
    atlas = Image.new(
        "RGBA",
        (CANVAS[0] * grid_columns, CANVAS[1] * grid_rows),
        (0, 0, 0, 0),
    )
    for row in range(grid_rows):
        for column in range(grid_columns):
            cell = transparent.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            atlas.alpha_composite(normalize_cell(cell), (column * CANVAS[0], row * CANVAS[1]))
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--columns", type=int, default=GRID[0])
    parser.add_argument("--rows", type=int, default=GRID[1])
    args = parser.parse_args()
    build_atlas(args.source, args.destination, grid=(args.columns, args.rows))


if __name__ == "__main__":
    main()
