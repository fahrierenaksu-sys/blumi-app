#!/usr/bin/env python3
"""Expand a clean profile reaction atlas with deterministic alpha-safe inbetweens.

ImageGen sheets are intentionally kept as the source of truth for identity. This
small post-process only creates midpoint frames between adjacent, already QA'd
frames. It uses premultiplied-alpha blending so transparent pixels never become
white or dark halos during the runtime atlas crop.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

CANVAS = (256, 384)
SOURCE_GRID = (4, 3)
OUTPUT_GRID = (4, 4)
DEFAULT_INSERT_AFTER = (0, 3, 5, 8)


def _frames_from_atlas(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    rgba = image.convert("RGBA")
    expected_size = (CANVAS[0] * columns, CANVAS[1] * rows)
    if rgba.size != expected_size:
        raise ValueError(f"Expected atlas {expected_size[0]}x{expected_size[1]}, got {rgba.size[0]}x{rgba.size[1]}")
    return [
        rgba.crop((column * CANVAS[0], row * CANVAS[1], (column + 1) * CANVAS[0], (row + 1) * CANVAS[1]))
        for row in range(rows)
        for column in range(columns)
    ]


def _premultiplied_blend(first: Image.Image, second: Image.Image, weight: float = 0.5) -> Image.Image:
    if first.size != CANVAS or second.size != CANVAS:
        raise ValueError("Inbetween frames must use the 256x384 canvas")
    if not 0 < weight < 1:
        raise ValueError("Blend weight must be between 0 and 1")

    first_array = np.asarray(first.convert("RGBA"), dtype=np.float32) / 255.0
    second_array = np.asarray(second.convert("RGBA"), dtype=np.float32) / 255.0
    first_alpha = first_array[..., 3:4]
    second_alpha = second_array[..., 3:4]
    alpha = first_alpha * (1.0 - weight) + second_alpha * weight
    rgb = (
        first_array[..., :3] * first_alpha * (1.0 - weight)
        + second_array[..., :3] * second_alpha * weight
    )
    rgb = np.divide(rgb, alpha, out=np.zeros_like(rgb), where=alpha > 1e-6)
    output = np.concatenate((rgb, alpha), axis=-1)
    return Image.fromarray(np.clip(np.round(output * 255.0), 0, 255).astype(np.uint8))


def build_inbetween_atlas(
    source: Path,
    destination: Path,
    insert_after: tuple[int, ...] = DEFAULT_INSERT_AFTER,
) -> None:
    frames = _frames_from_atlas(Image.open(source), *SOURCE_GRID)
    invalid = [index for index in insert_after if index < 0 or index >= len(frames) - 1]
    if invalid:
        raise ValueError(f"Inbetween indices must target a frame with a following frame: {invalid}")
    if len(set(insert_after)) != len(insert_after):
        raise ValueError("Inbetween indices must be unique")

    expanded: list[Image.Image] = []
    for index, frame in enumerate(frames):
        expanded.append(frame)
        if index in insert_after:
            expanded.append(_premultiplied_blend(frame, frames[index + 1]))

    expected_count = OUTPUT_GRID[0] * OUTPUT_GRID[1]
    if len(expanded) != expected_count:
        raise ValueError(f"Expected exactly {expected_count} output frames, got {len(expanded)}")

    atlas = Image.new("RGBA", (CANVAS[0] * OUTPUT_GRID[0], CANVAS[1] * OUTPUT_GRID[1]), (0, 0, 0, 0))
    for index, frame in enumerate(expanded):
        column = index % OUTPUT_GRID[0]
        row = index // OUTPUT_GRID[0]
        atlas.alpha_composite(frame, (column * CANVAS[0], row * CANVAS[1]))
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--insert-after", type=int, nargs="+", default=list(DEFAULT_INSERT_AFTER))
    args = parser.parse_args()
    build_inbetween_atlas(args.source, args.destination, tuple(args.insert_after))


if __name__ == "__main__":
    main()
