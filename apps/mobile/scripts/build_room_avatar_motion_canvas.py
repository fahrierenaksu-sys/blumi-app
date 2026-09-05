#!/usr/bin/env python3
"""Build a Blumi room-avatar motion strip edit canvas.

The shipped room avatar layers use a 256x384 transparent canvas. This script
preserves that exact seed frame size and places the approved seed in slot 01 of
a horizontal transparent strip. The remaining slots are empty for strip-first
generation/editing.
"""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install it with `python3 -m pip install pillow`."
    ) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a transparent Blumi room-avatar strip edit canvas."
    )
    parser.add_argument("--seed", required=True, help="Approved 256x384 seed layer PNG.")
    parser.add_argument("--out", required=True, help="Output transparent strip PNG.")
    parser.add_argument("--frames", type=int, required=True, help="Number of strip slots.")
    parser.add_argument("--frame-width", type=int, default=256)
    parser.add_argument("--frame-height", type=int, default=384)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.frames < 1:
      raise SystemExit("--frames must be at least 1.")
    if args.frame_width < 1 or args.frame_height < 1:
      raise SystemExit("--frame-width and --frame-height must be positive.")

    seed = Image.open(args.seed).convert("RGBA")
    expected_size = (args.frame_width, args.frame_height)
    if seed.size != expected_size:
      raise SystemExit(
          f"Seed must be {expected_size[0]}x{expected_size[1]}, got {seed.width}x{seed.height}."
      )

    canvas = Image.new(
        "RGBA",
        (args.frame_width * args.frames, args.frame_height),
        (0, 0, 0, 0),
    )
    canvas.alpha_composite(seed, (0, 0))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


if __name__ == "__main__":
    main()
