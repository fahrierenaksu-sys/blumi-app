#!/usr/bin/env python3
"""Fit generated female hair sources to the canonical front-view room rig.

Sources are art-direction inputs only. The script removes no body pixels from
the canonical base; it creates disjoint hairBack/hairFront layers on the
256x384 contract and can clear painted ear pixels from generated openings.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


CANVAS = (256, 384)


def save_rgba(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgba = image.convert("RGBA")
    # Chroma-key removal can leave RGB residue under fully transparent pixels.
    # Zero it so a renderer cannot reveal a green/pale fringe during scaling.
    opaque = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    opaque.paste(rgba, mask=rgba.getchannel("A"))
    opaque.save(path, optimize=True)


def split_hair(source: Path, output: Path, slug: str, mask_ears: bool) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"source has no visible pixels: {source}")
    cropped = image.crop(bbox)
    scale = min(150 / cropped.width, 184 / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    full = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    full.alpha_composite(resized, (128 - resized.width // 2, 76))
    alpha = full.getchannel("A")

    if mask_ears:
        # Clear painted ears from the source alpha before the depth split. If
        # this is done only on the front mask, the same pixels leak into the
        # back layer and visibly double the canonical base ears.
        alpha_draw = ImageDraw.Draw(alpha)
        alpha_draw.ellipse((67, 156, 96, 195), fill=0)
        alpha_draw.ellipse((160, 156, 189, 195), fill=0)

    # Keep the opening compatible with avatar_room_base_female_v2: temples and
    # crown are front hair, the side/under-chin mass is back hair. The masks are
    # disjoint so two full silhouettes cannot double-paint.
    front_mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(front_mask).rectangle((45, 70, 211, 166), fill=255)
    ImageDraw.Draw(front_mask).ellipse((78, 82, 178, 220), fill=255)
    if mask_ears:
        # Generated ears/earrings are not canonical avatar features. Remove
        # only the two ear apertures; hair remains untouched around the edge.
        draw = ImageDraw.Draw(front_mask)
        draw.ellipse((67, 156, 96, 195), fill=0)
        draw.ellipse((160, 156, 189, 195), fill=0)

    front_alpha = ImageChops.multiply(alpha, front_mask)
    back_alpha = ImageChops.subtract(alpha, front_alpha)

    front = full.copy()
    front.putalpha(front_alpha)
    back = full.copy()
    back.putalpha(back_alpha)
    save_rgba(back, output / f"avatar_room_hair_back_female_{slug}_v2.png")
    save_rgba(front, output / f"avatar_room_hair_front_female_{slug}_v2.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--asset",
        action="append",
        required=True,
        metavar="SLUG=SOURCE",
        help="repeat for each hair asset; add :mask-ears to the slug when needed",
    )
    args = parser.parse_args()
    for spec in args.asset:
        try:
            slug, source_spec = spec.split("=", 1)
        except ValueError as error:
            raise SystemExit(f"invalid --asset {spec!r}; expected SLUG=SOURCE") from error
        mask_ears = slug.endswith(":mask-ears")
        if mask_ears:
            slug = slug.removesuffix(":mask-ears")
        split_hair(Path(source_spec), args.output, slug, mask_ears)


if __name__ == "__main__":
    main()
