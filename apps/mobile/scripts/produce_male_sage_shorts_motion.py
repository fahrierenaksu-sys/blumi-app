#!/usr/bin/env python3
"""Fit the hidden/free male sage shorts to the canonical front 4W+1S rig.

The shorts remain available to persisted male loadouts, so hiding them from the
shop is not enough: the room renderer still needs dedicated front motion
frames. The waist and upper short silhouette stay fixed while each leg opening
follows the small opposing offsets of the male walking driver.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SLUG = "bottom_male_sage_cuffed_shorts_v1"
STATIC = ROOM / f"avatar_room_{SLUG}.png"
CANVAS = (256, 384)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def clean(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return result


def copy_shifted(
    source: Image.Image,
    target: Image.Image,
    source_box: tuple[int, int, int, int],
    dx: int,
    dy: int,
) -> None:
    pixels = source.load()
    output = target.load()
    min_x, min_y, max_x, max_y = source_box
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            target_x, target_y = x + dx, y + dy
            if not (0 <= target_x < target.width and 0 <= target_y < target.height):
                continue
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            output[target_x, target_y] = (red, green, blue, alpha)


def walking_frame(source: Image.Image, left: tuple[int, int], right: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    # Keep the waist/crotch hinge continuous. The leg islands overlap the
    # anchored rows before they begin to deform; this prevents a transparent
    # horizontal seam or a disconnected leg when dy is +/-1.
    result.alpha_composite(source.crop((0, 0, 256, 324)), (0, 0))
    copy_shifted(source, result, (104, 323, 127, 338), *left)
    copy_shifted(source, result, (129, 323, 152, 338), *right)
    return clean(result)


def sitting_frame(source: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(source.crop((0, 0, 256, 324)), (0, 0))
    copy_shifted(source, result, (104, 323, 127, 338), -4, 1)
    copy_shifted(source, result, (129, 323, 152, 338), 4, 1)
    return clean(result)


def main() -> None:
    source = load(STATIC)
    frames = {
        "walking_front_f01": clean(source.copy()),
        "walking_front_f02": walking_frame(source, (-2, 1), (2, -1)),
        "walking_front_f03": walking_frame(source, (2, -1), (-2, 1)),
        "walking_front_f04": walking_frame(source, (-1, 1), (3, -1)),
        "sitting_front_f01": sitting_frame(source),
    }
    MOTION.mkdir(parents=True, exist_ok=True)
    for pose, image in frames.items():
        image.save(MOTION / f"room_avatar_{SLUG}_{pose}.png", optimize=True)


if __name__ == "__main__":
    main()
