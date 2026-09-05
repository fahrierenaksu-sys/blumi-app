#!/usr/bin/env python3
"""Normalize transparent RGB on female room hair layers without repainting artwork."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SLUGS = (
    "copper_bow_waves",
    "golden_waves",
    "ink_twin_braids",
    "ink_pageboy_star",
    "pale_golden_bow_bob",
)


def clean(path: Path) -> bool:
    image = Image.open(path).convert("RGBA")
    pixels = list(image.getdata())
    cleaned = [
        (0, 0, 0, alpha) if alpha == 0 else pixel
        for pixel in pixels
        for alpha in (pixel[3],)
    ]
    if cleaned == pixels:
        return False
    image.putdata(cleaned)
    image.save(path, optimize=True)
    return True


def main() -> None:
    touched = 0
    for slug in SLUGS:
        paths = [
            ROOM / f"avatar_room_hair_{part}_female_{slug}_v2.png"
            for part in ("back", "front")
        ]
        paths.extend(
            MOTION.glob(f"room_avatar_hair_*_female_{slug}_v2_*.png")
        )
        for path in sorted(set(paths)):
            if path.exists() and clean(path):
                touched += 1
                print(path.relative_to(ROOT))
    print(f"cleaned={touched}")


if __name__ == "__main__":
    main()
