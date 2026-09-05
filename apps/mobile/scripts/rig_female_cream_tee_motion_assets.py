#!/usr/bin/env python3
"""Build the front-walk cream tee layers from the approved static fit.

The cream tee is a simple fitted layer, so its walking contract follows the
measured front-body anchor used by the other promoted female tops.  This keeps
the neckline, sleeve envelope, waist hem, and alpha edges identical to the
approved static render while following the four walking poses.  No repaint,
warp, crop, or patch-fill is performed.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SOURCE = ROOM / "avatar_room_top_female_cream_basic_tee_v2.png"
PREFIX = "room_avatar_top_female_cream_basic_tee_v2"

# Measured from the promoted female top motion capsule.  f01 is the approved
# static source; the other promoted tops use these same body-anchor deltas.
FRAME_OFFSETS = {
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-1, 0),
    "walking_front_f03": (0, 1),
    "walking_front_f04": (1, 0),
}


def translated(source: Image.Image, dx: int, dy: int) -> Image.Image:
    canvas = Image.new("RGBA", source.size, (0, 0, 0, 0))
    canvas.alpha_composite(source, (dx, dy))
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (256, 384):
        raise ValueError(f"{SOURCE} must be 256x384, got {source.size}")
    MOTION.mkdir(parents=True, exist_ok=True)
    for suffix, (dx, dy) in FRAME_OFFSETS.items():
        target = MOTION / f"{PREFIX}_{suffix}.png"
        translated(source, dx, dy).save(target, optimize=True)
        print(f"{target.relative_to(ROOT)} <- ({dx:+d},{dy:+d})")


if __name__ == "__main__":
    main()
