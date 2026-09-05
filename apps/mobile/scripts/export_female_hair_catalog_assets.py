#!/usr/bin/env python3
"""Export profile layers and real shop thumbnails for the canonical hair capsule.

The room files remain the source of truth for the 256x384 fit. This exporter
only creates the 512x768 avatar profile layer and a 220x220 thumbnail from the
same front-view composite; it never repositions or paints over the room rig.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ROOM = ROOT / "src/features/avatarV2/assets/room"
LAYERS = ROOT / "src/features/avatarV2/assets/layers"
THUMBNAILS = ROOT / "src/features/avatarV2/assets/shop-thumbnails"
SLUGS = (
    "golden_waves",
    "ink_pageboy_star",
    "ink_twin_braids",
    "pale_golden_bow_bob",
    "copper_bow_waves",
)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def composite(*layers: Image.Image) -> Image.Image:
    result = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    for layer in layers:
        result.alpha_composite(layer)
    return result


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def main() -> None:
    base = load(ROOM / "avatar_room_base_female_v2.png")
    face = load(ROOM / "avatar_room_face_female_soft_doll_foundation_v2.png")
    eyes = load(ROOM / "avatar_room_eyes_female_mocha_doe_v2.png")
    nose = load(ROOM / "avatar_room_nose_female_soft_button_v2.png")
    mouth = load(ROOM / "avatar_room_mouth_female_peach_whisper_smile_v2.png")
    for slug in SLUGS:
        back = load(ROOM / f"avatar_room_hair_back_female_{slug}_v2.png")
        front = load(ROOM / f"avatar_room_hair_front_female_{slug}_v2.png")
        layer = composite(back, front)
        save(layer.resize((512, 768), Image.Resampling.LANCZOS), LAYERS / f"avatar_hair_{slug}.png")

        avatar = composite(back, base, face, eyes, nose, mouth, front)
        thumbnail = avatar.crop((55, 82, 201, 350)).resize((220, 220), Image.Resampling.LANCZOS)
        save(thumbnail, THUMBNAILS / f"avatar_v2_hair_{slug}.png")


if __name__ == "__main__":
    main()
