#!/usr/bin/env python3
"""Localize an ImageGen wardrobe edit while preserving rig registration."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from PIL import Image


KEY_GREEN = (0, 255, 0)


def _validated_size(
    value: Sequence[int],
    *,
    label: str,
) -> tuple[int, int]:
    if len(value) != 2:
        raise ValueError(f"{label} must contain two dimensions")
    width, height = value
    if any(
        not isinstance(dimension, int) or isinstance(dimension, bool)
        for dimension in value
    ):
        raise ValueError(f"{label} dimensions must be integers")
    if width <= 0 or height <= 0:
        raise ValueError(f"{label} dimensions must be positive")
    return width, height


def _validated_box(
    value: Sequence[int],
    *,
    canvas_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    if len(value) != 4:
        raise ValueError("registered edit box must contain four coordinates")
    if any(
        not isinstance(coordinate, int) or isinstance(coordinate, bool)
        for coordinate in value
    ):
        raise ValueError("registered edit box coordinates must be integers")

    left, top, right, bottom = value
    width = right - left
    height = bottom - top
    if width <= 0 or height <= 0:
        raise ValueError("registered edit box dimensions must be positive")

    canvas_width, canvas_height = canvas_size
    if left < 0 or top < 0 or right > canvas_width or bottom > canvas_height:
        raise ValueError("registered edit box must be within the canvas")
    if width != height:
        raise ValueError("registered edit crop must be square")
    return left, top, right, bottom


def extract_registered_crop(
    source: Image.Image,
    box: tuple[int, int, int, int],
    *,
    target_size: int = 1024,
) -> Image.Image:
    if not isinstance(target_size, int) or isinstance(target_size, bool):
        raise ValueError("target size must be an integer")
    if target_size <= 0:
        raise ValueError("target size must be positive")
    validated_box = _validated_box(box, canvas_size=source.size)
    crop = source.convert("RGB").crop(validated_box)
    return crop.resize((target_size, target_size), Image.Resampling.NEAREST)


def restore_registered_crop(
    generated_crop: Image.Image,
    full_size: tuple[int, int],
    box: tuple[int, int, int, int],
    *,
    transparent_background: bool = False,
) -> Image.Image:
    validated_full_size = _validated_size(full_size, label="full canvas")
    validated_box = _validated_box(box, canvas_size=validated_full_size)
    width = validated_box[2] - validated_box[0]
    height = validated_box[3] - validated_box[1]
    mode = "RGBA" if transparent_background else "RGB"
    background = (0, 0, 0, 0) if transparent_background else KEY_GREEN
    restored = Image.new(mode, validated_full_size, background)
    localized = generated_crop.convert("RGBA").resize(
        (width, height),
        Image.Resampling.LANCZOS,
    )
    destination = (validated_box[0], validated_box[1])
    if transparent_background:
        restored.paste(localized, destination)
    else:
        restored.paste(
            localized.convert("RGB"),
            destination,
            localized.getchannel("A"),
        )
    return restored


def parse_box(value: str) -> tuple[int, int, int, int]:
    try:
        parts = tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("box must be x0,y0,x1,y1") from error
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("box must be x0,y0,x1,y1")
    return parts


def parse_size(value: str) -> tuple[int, int]:
    try:
        parts = tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("size must be width,height") from error
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("size must be width,height")
    return parts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="operation", required=True)

    extract = subparsers.add_parser("extract")
    extract.add_argument("--input", required=True, type=Path)
    extract.add_argument("--output", required=True, type=Path)
    extract.add_argument("--box", required=True, type=parse_box)
    extract.add_argument("--target-size", type=int, default=1024)

    restore = subparsers.add_parser("restore")
    restore.add_argument("--input", required=True, type=Path)
    restore.add_argument("--output", required=True, type=Path)
    restore.add_argument("--box", required=True, type=parse_box)
    restore.add_argument("--full-size", type=parse_size, default=(1024, 1536))
    restore.add_argument("--transparent-background", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.input)
    if args.operation == "extract":
        output = extract_registered_crop(source, args.box, target_size=args.target_size)
    else:
        output = restore_registered_crop(
            source,
            args.full_size,
            args.box,
            transparent_background=args.transparent_background,
        )
    output.save(args.output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
