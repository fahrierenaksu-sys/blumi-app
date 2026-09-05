#!/usr/bin/env python3
"""Build a registration-locked chroma mannequin guide for male wardrobe art."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


BACKGROUND_KEY = (0, 255, 0, 255)
BODY_KEY = (255, 0, 255, 255)


def build_chroma_guide(
    base_path: Path,
    garment_path: Path,
    output_path: Path,
    *,
    scale: int = 4,
) -> None:
    if scale < 1:
        raise ValueError("scale must be positive")

    base = Image.open(base_path).convert("RGBA")
    garment = Image.open(garment_path).convert("RGBA")
    if base.size != garment.size:
        raise ValueError("base and garment must use the same canvas")

    keyed = Image.new("RGBA", base.size, BACKGROUND_KEY)
    keyed_body = Image.new("RGBA", base.size, BODY_KEY)
    keyed.alpha_composite(Image.composite(keyed_body, Image.new("RGBA", base.size), base.getchannel("A")))
    keyed.alpha_composite(garment)

    guide = keyed.resize(
        (base.width * scale, base.height * scale),
        resample=Image.Resampling.NEAREST,
    ).convert("RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    guide.save(output_path, format="PNG", optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--garment", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scale", type=int, default=4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_chroma_guide(args.base, args.garment, args.output, scale=args.scale)


if __name__ == "__main__":
    main()
