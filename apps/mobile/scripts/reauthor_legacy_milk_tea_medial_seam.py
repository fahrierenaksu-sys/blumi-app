#!/usr/bin/env python3
"""Re-author the one legacy Milk Tea sneaker seam that can expose the base.

The original premium shoe source is no longer present in the repository, so the
general legacy generator cannot reproduce this exact live rendering. This
bounded repair preserves the approved pair's outer edge, toe, sole, palette
and grounding. It re-fits only the right shoe's medial width by one pixel in
Static and walk frame one, the two states that cross-capsule QA proved faulty.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps/mobile/src/features/avatarV2/assets"
ROOM = ASSETS / "room"
MOTION = ROOM / "motion"
THUMBNAIL = ASSETS / "shop-thumbnails/avatar_v2_shoes_milk_tea_court_sneakers.png"


class RepairError(RuntimeError):
    """Raised when the live asset no longer matches this narrowly scoped repair."""


def alpha_box(image: Image.Image, half: str) -> tuple[int, int, int, int] | None:
    width, height = image.size
    bounds = (0, 0, width // 2, height) if half == "left" else (width // 2, 0, width, height)
    box = image.getchannel("A").crop(bounds).getbbox()
    if box is None:
        return None
    return (box[0] + bounds[0], box[1] + bounds[1], box[2] + bounds[0], box[3] + bounds[1])


def reauthor_right_medial_width(
    image: Image.Image,
    source_box: tuple[int, int, int, int],
    target_box: tuple[int, int, int, int],
) -> Image.Image:
    """Extend only the medial (left) side of the right shoe while anchoring its outer edge."""
    if source_box[1:] != target_box[1:]:
        raise RepairError("the medial repair must preserve vertical geometry and the outer edge")
    source = image.crop(source_box)
    repaired = image.copy()
    repaired.paste((0, 0, 0, 0), target_box)
    resized = source.resize(
        (target_box[2] - target_box[0], target_box[3] - target_box[1]),
        Image.Resampling.LANCZOS,
    )
    repaired.alpha_composite(resized, target_box[:2])
    return repaired


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def save_product_thumbnail(layer: Image.Image) -> None:
    bbox = layer.getchannel("A").getbbox()
    if bbox is None:
        raise RepairError("Milk Tea layer cannot have an empty thumbnail")
    product = layer.crop(bbox)
    product.thumbnail((196, 196), Image.Resampling.LANCZOS)
    thumbnail = Image.new("RGBA", (224, 224), (0, 0, 0, 0))
    thumbnail.alpha_composite(product, ((224 - product.width) // 2, (224 - product.height) // 2))
    save(thumbnail, THUMBNAIL)


REPAIR_TARGETS = (
    (
        "static",
        ROOM / "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
        (128, 319, 157, 348),
        (127, 319, 157, 348),
    ),
    (
        "walking_front_f01",
        MOTION / "room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f01.png",
        (129, 322, 158, 348),
        (128, 322, 158, 348),
    ),
)


def has_required_medial_contact(image: Image.Image, state: str) -> bool:
    # These are the two exact contact pixels found by the unchanged
    # cross-capsule seam gate. Their alpha must survive the normal >16 gate.
    point = (132, 335) if state == "static" else (133, 335)
    return image.getpixel(point)[3] > 16


def repair_path(
    state: str,
    path: Path,
    source_box: tuple[int, int, int, int],
    target_box: tuple[int, int, int, int],
    check: bool,
) -> Image.Image:
    if not path.exists():
        raise RepairError(f"{state}: missing live Milk Tea layer: {path}")
    image = Image.open(path).convert("RGBA")
    actual = alpha_box(image, "right")
    if has_required_medial_contact(image, state):
        return image
    if actual != source_box:
        raise RepairError(f"{state}: expected right component {source_box}, found {actual}")
    if check:
        raise RepairError(f"{state}: medial collar repair has not been applied")
    repaired = reauthor_right_medial_width(image, source_box, target_box)
    if not has_required_medial_contact(repaired, state):
        raise RepairError(f"{state}: repaired medial collar missed its contact point")
    repaired_box = alpha_box(repaired, "right")
    if repaired_box is None or repaired_box[1:] != source_box[1:]:
        raise RepairError(f"{state}: repair changed vertical or outer shoe geometry: {repaired_box}")
    save(repaired, path)
    return repaired


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the bounded repair without writing")
    args = parser.parse_args()

    static = None
    for state, path, source_box, target_box in REPAIR_TARGETS:
        repaired = repair_path(state, path, source_box, target_box, args.check)
        if state == "static":
            static = repaired

    if static is None:
        raise RepairError("static Milk Tea layer was not processed")

    if not args.check:
        save_product_thumbnail(static)

    print("Milk Tea right medial seam: verified" if args.check else "Milk Tea right medial seam: repaired")


if __name__ == "__main__":
    main()
