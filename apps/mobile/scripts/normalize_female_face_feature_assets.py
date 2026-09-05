#!/usr/bin/env python3
"""Re-author female face-part layers to one shared landmark envelope.

The room renderer composes fixed 256x384 canvases; translating layers at runtime
would hide bad source art. This script scales each authored face-part into the
canonical envelope and emits fixed-head 4W+1S sources for the same slot.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
CANVAS = (256, 384)

GROUPS = {
    "eyes": (87, 147, 171, 178),
    "nose": (114, 178, 142, 195),
    "mouth": (114, 188, 149, 205),
}
DEFAULTS = {
    "eyes": "mocha_doe",
    "nose": "soft_button",
    "mouth": "peach_whisper_smile",
}


def normalize(path: Path, box: tuple[int, int, int, int]) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"empty feature layer: {path}")
    crop = source.crop(bbox)
    width, height = box[2] - box[0], box[3] - box[1]
    scale = min(width / crop.width, height / crop.height)
    image = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(
        image,
        (box[0] + (width - image.width) // 2, box[1] + (height - image.height) // 2),
    )
    return canvas


def main() -> None:
    MOTION.mkdir(parents=True, exist_ok=True)
    for kind, box in GROUPS.items():
        prefix = f"avatar_room_{kind}_female_"
        for path in sorted(ROOM.glob(f"{prefix}*_v2.png")):
            slug = path.name.removeprefix(prefix).removesuffix("_v2.png")
            if slug == DEFAULTS[kind]:
                continue
            image = normalize(path, box)
            image.save(path, optimize=True)
            for suffix in (
                "walking_front_f01",
                "walking_front_f02",
                "walking_front_f03",
                "walking_front_f04",
                "sitting_front_f01",
            ):
                image.save(
                    MOTION / f"room_avatar_{kind}_female_{slug}_v2_{suffix}.png",
                    optimize=True,
                )


if __name__ == "__main__":
    main()
