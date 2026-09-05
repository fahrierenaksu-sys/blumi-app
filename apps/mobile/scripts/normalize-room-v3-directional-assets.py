#!/usr/bin/env python3
"""Normalize four-direction Room V3 assets onto a shared RGBA canvas."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

try:
    from PIL import Image, UnidentifiedImageError
except ImportError as error:  # pragma: no cover - depends on the caller's environment
    raise SystemExit(
        "Pillow is required. Install it with `python3 -m pip install pillow`."
    ) from error


ALPHA_THRESHOLD = 8
DIRECTIONS = ("front", "back", "left", "right")


@dataclass(frozen=True)
class Frame:
    direction: str
    source: Path
    output: Path
    source_size: tuple[int, int]
    source_bounds: tuple[int, int, int, int]
    rgba: Image.Image


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize one or more front/back/left/right PNG sets to the front "
            "frame's alpha-visible height and a shared bottom-centered canvas."
        ),
        epilog=(
            "Paths are grouped in this order: FRONT BACK LEFT RIGHT. Example: "
            "%(prog)s --suffix _normalized front.png back.png left.png right.png"
        ),
    )
    parser.add_argument(
        "images",
        metavar="IMAGE",
        nargs="+",
        type=Path,
        help="PNG paths in repeating FRONT BACK LEFT RIGHT groups.",
    )
    parser.add_argument(
        "--suffix",
        required=True,
        help="Non-empty suffix inserted before .png for every output file.",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=24,
        help="Transparent padding around the shared canvas in pixels (default: 24).",
    )
    return parser.parse_args(argv)


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    visible = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    return visible.getbbox()


def output_path(source: Path, suffix: str) -> Path:
    return source.with_name(f"{source.stem}{suffix}.png")


def load_frame(direction: str, source: Path, suffix: str) -> Frame:
    if not source.is_file():
        raise ValueError(f"missing input: {source}")

    try:
        with Image.open(source) as opened:
            opened.load()
            rgba = opened.convert("RGBA")
    except (OSError, UnidentifiedImageError) as error:
        raise ValueError(f"unreadable image: {source}: {error}") from error

    bounds = alpha_bounds(rgba)
    if bounds is None:
        raise ValueError(f"empty alpha-visible frame: {source}")

    destination = output_path(source, suffix)
    if destination.resolve() == source.resolve():
        raise ValueError(f"output would overwrite source: {source}")
    if destination.exists():
        raise ValueError(f"output already exists: {destination}")

    return Frame(
        direction=direction,
        source=source,
        output=destination,
        source_size=rgba.size,
        source_bounds=bounds,
        rgba=rgba,
    )


def normalized_crop(frame: Frame, target_height: int) -> Image.Image:
    cropped = frame.rgba.crop(frame.source_bounds)
    width, height = cropped.size
    target_width = max(1, round(width * target_height / height))
    if cropped.size == (target_width, target_height):
        return cropped.copy()
    return cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)


def normalize_group(frames: Sequence[Frame], padding: int) -> dict[str, object]:
    front_height = frames[0].source_bounds[3] - frames[0].source_bounds[1]
    normalized = tuple(normalized_crop(frame, front_height) for frame in frames)
    canvas_size = (
        max(image.width for image in normalized) + padding * 2,
        front_height + padding * 2,
    )

    entries: list[dict[str, object]] = []
    for frame, image in zip(frames, normalized):
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        position = (
            (canvas.width - image.width) // 2,
            canvas.height - padding - image.height,
        )
        canvas.alpha_composite(image, position)
        canvas.save(frame.output, format="PNG", optimize=True)

        bounds = alpha_bounds(canvas)
        if bounds is None:
            raise RuntimeError(f"normalization produced an empty frame: {frame.output}")
        entries.append(
            {
                "direction": frame.direction,
                "source": str(frame.source),
                "output": str(frame.output),
                "sourceSize": list(frame.source_size),
                "sourceAlphaBounds": list(frame.source_bounds),
                "outputSize": list(canvas.size),
                "outputAlphaBounds": list(bounds),
            }
        )

    return {
        "targetVisibleHeight": front_height,
        "canvasSize": list(canvas_size),
        "frames": entries,
    }


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if len(args.images) % len(DIRECTIONS) != 0:
        raise ValueError(
            "IMAGE count must be a multiple of 4 in FRONT BACK LEFT RIGHT order"
        )
    if not args.suffix.strip():
        raise ValueError("--suffix must not be empty or whitespace")
    if "/" in args.suffix or "\\" in args.suffix:
        raise ValueError("--suffix must not contain path separators")
    if args.padding < 0:
        raise ValueError("--padding must be zero or greater")

    groups: list[tuple[Frame, ...]] = []
    outputs: set[Path] = set()
    for offset in range(0, len(args.images), len(DIRECTIONS)):
        paths = args.images[offset : offset + len(DIRECTIONS)]
        frames = tuple(
            load_frame(direction, path, args.suffix)
            for direction, path in zip(DIRECTIONS, paths)
        )
        for frame in frames:
            resolved_output = frame.output.resolve()
            if resolved_output in outputs:
                raise ValueError(f"duplicate output path: {frame.output}")
            outputs.add(resolved_output)
        groups.append(frames)

    manifest = {
        "alphaThreshold": ALPHA_THRESHOLD,
        "padding": args.padding,
        "suffix": args.suffix,
        "groups": [normalize_group(group, args.padding) for group in groups],
    }
    print(json.dumps(manifest, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
