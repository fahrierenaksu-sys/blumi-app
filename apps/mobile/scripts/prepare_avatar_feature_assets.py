#!/usr/bin/env python3
"""Normalize generated female feature sources onto the 256x384 room contract.

The source files are deliberately kept outside the repository. This utility only
does the deterministic, measurable part after chroma-key removal: crop visible
art, fit it to a named landmark box, and build hair depth masks. It never uses a
photo as a texture or changes the canonical base.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance


CANVAS = (256, 384)


def save_rgba(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(path, optimize=True)


def fit_visible(source: Path, target: Path, box: tuple[int, int, int, int]) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"source has no visible pixels: {source}")
    cropped = image.crop(bbox)
    width, height = box[2] - box[0], box[3] - box[1]
    scale = min(width / cropped.width, height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    x = box[0] + (width - resized.width) // 2
    y = box[1] + (height - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    save_rgba(canvas, target)


def split_hair(source: Path, back_target: Path, front_target: Path) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"hair source has no visible pixels: {source}")
    cropped = image.crop(bbox)
    scale = min(150 / cropped.width, 184 / cropped.height)
    resized = cropped.resize(
        (round(cropped.width * scale), round(cropped.height * scale)),
        Image.Resampling.LANCZOS,
    )
    full = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    full.alpha_composite(resized, (128 - resized.width // 2, 76))
    alpha = full.getchannel("A")

    # The face opening is a hard rig boundary: side/under-chin mass belongs to
    # hairBack, while crown, fringe and temples belong to hairFront. The masks
    # are disjoint so a second full hair silhouette can never double-paint.
    front_mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(front_mask).rectangle((45, 70, 211, 166), fill=255)
    ImageDraw.Draw(front_mask).ellipse((78, 82, 178, 220), fill=255)
    front_alpha = ImageChops.multiply(alpha, front_mask)
    back_alpha = ImageChops.subtract(alpha, front_alpha)

    front = full.copy()
    front.putalpha(front_alpha)
    back = full.copy()
    back.putalpha(back_alpha)
    save_rgba(back, back_target)
    save_rgba(front, front_target)


def make_face_variants(source: Path, warm_target: Path, rose_target: Path) -> None:
    base = Image.open(source).convert("RGBA")

    def variant(color: tuple[int, int, int], cheek_alpha: int, forehead_alpha: int) -> Image.Image:
        # Keep the canonical foundation's skin and edge shading intact. The
        # variants are face-expression palettes, not a recoloured silhouette.
        image = base.copy()
        overlay = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        for bounds in ((91, 166, 119, 190), (137, 166, 165, 190)):
            draw.ellipse(bounds, fill=(*color, cheek_alpha))
        draw.ellipse((108, 126, 148, 151), fill=(*color, forehead_alpha))
        image.alpha_composite(overlay)
        return image

    save_rgba(variant((244, 144, 126), 40, 13), warm_target)
    save_rgba(variant((226, 105, 157), 30, 10), rose_target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--glasses", nargs=4, type=Path, required=True)
    parser.add_argument("--hair", type=Path, required=True)
    parser.add_argument("--face", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    output = args.output
    glasses = (
        "rose_round_glasses",
        "lavender_pearl_cat_eye_glasses",
        "mint_star_oval_glasses",
        "honey_blossom_square_glasses",
    )
    for slug, source in zip(glasses, args.glasses, strict=True):
        fit_visible(
            source,
            output / f"avatar_room_accessory_female_{slug}_v2.png",
            (88, 148, 168, 185),
        )

    split_hair(
        args.hair,
        output / "avatar_room_hair_back_female_chestnut_butterfly_bob_v2.png",
        output / "avatar_room_hair_front_female_chestnut_butterfly_bob_v2.png",
    )
    make_face_variants(
        args.face,
        output / "avatar_room_face_female_warm_peach_foundation_v2.png",
        output / "avatar_room_face_female_rose_heart_foundation_v2.png",
    )


if __name__ == "__main__":
    main()
