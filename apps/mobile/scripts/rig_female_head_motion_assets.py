"""Generate frame-aware front motion layers for female head features.

The approved female base keeps the head inside a stable 256x384 canvas, but the
face moves by a small amount between walking frames. Head overlays must follow
that same anchor or a glasses/face variant will look detached at close zoom.
This script intentionally creates only translated RGBA layers; it never
warps, crops, or paints over the canonical source asset.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ROOM = ROOT / "src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"

# Measured from avatar_room_eyes_female_mocha_doe_v2 and the canonical face
# layer. f01 is the source pose; walking frames follow the base head anchor.
FRAME_OFFSETS = {
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-1, -1),
    "walking_front_f03": (0, -2),
    "walking_front_f04": (1, -1),
    "sitting_front_f01": (0, 0),
}

PREFIXES = (
    "avatar_room_face_female_warm_peach_foundation_v2",
    "avatar_room_face_female_rose_heart_foundation_v2",
    "avatar_room_accessory_female_rose_round_glasses_v2",
    "avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2",
    "avatar_room_accessory_female_mint_star_oval_glasses_v2",
    "avatar_room_accessory_female_honey_blossom_square_glasses_v2",
)

# All non-default face-part variants were normalized to the same canonical
# envelopes earlier in the pipeline. Keep their motion in the same contract.
for feature in ("eyes", "nose", "mouth"):
    PREFIXES += tuple(
        path.stem
        for path in sorted(ROOM.glob(f"avatar_room_{feature}_female_*_v2.png"))
        if path.stem
        not in {
            f"avatar_room_{feature}_female_mocha_doe_v2",
            f"avatar_room_{feature}_female_soft_button_v2",
            f"avatar_room_{feature}_female_peach_whisper_smile_v2",
        }
    )

# Hair is a head-anchored layer as well. Keeping every canonical female hair
# pair in the same generator prevents a new red/blonde style from silently
# falling back to a stale static bitmap during walking.
PREFIXES += tuple(
    path.stem
    for path in sorted(ROOM.glob("avatar_room_hair_*_female_*_v2.png"))
)


def translated(source: Image.Image, dx: int, dy: int) -> Image.Image:
    canvas = Image.new("RGBA", source.size, (0, 0, 0, 0))
    canvas.alpha_composite(source, (dx, dy))
    # Keep fully transparent pixels colorless. Chroma-key or resize residue
    # in hidden RGB channels can become a visible fringe after compositing.
    canvas.putdata(
        tuple((0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha)
              for red, green, blue, alpha in canvas.getdata())
    )
    return canvas


def main() -> None:
    MOTION.mkdir(parents=True, exist_ok=True)
    for prefix in dict.fromkeys(PREFIXES):
        source_path = ROOM / f"{prefix}.png"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source = Image.open(source_path).convert("RGBA")
        if source.size != (256, 384):
            raise ValueError(f"{source_path} must be 256x384, got {source.size}")
        # Static source files use the historical `avatar_room_` prefix while
        # runtime motion bundles use `room_avatar_`. Keep that compatibility
        # naming explicit so the generated files are the ones Metro loads.
        runtime_prefix = prefix.replace("avatar_room_", "room_avatar_", 1)
        for frame, (dx, dy) in FRAME_OFFSETS.items():
            output_path = MOTION / f"{runtime_prefix}_{frame}.png"
            translated(source, dx, dy).save(output_path)
            print(f"{output_path.relative_to(ROOT)} <- ({dx:+d},{dy:+d})")


if __name__ == "__main__":
    main()
