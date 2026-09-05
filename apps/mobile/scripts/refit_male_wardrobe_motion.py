#!/usr/bin/env python3
"""Regenerate male 4W+1S motion from the corrected static masters.

The static layer is the source of truth. Walking frames introduce only a
small, bounded pose offset; sitting frames move the lower limbs while keeping
the waist/neck anchors stable. Candidates and live frames are written together
so the runtime cannot drift from the reviewed static master.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
EVIDENCE = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-22/motion"
CANVAS = (256, 384)
STATES = ("walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01")
CHROMA_KEY_COLORS = ((0, 255, 0), (0, 255, 255), (255, 0, 255), (255, 255, 0), (255, 0, 0), (0, 0, 255))


def clean(image: Image.Image) -> Image.Image:
    output = image.convert("RGBA")
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha <= 64 and any(max(abs(red - key_red), abs(green - key_green), abs(blue - key_blue)) <= 24 for key_red, key_green, key_blue in CHROMA_KEY_COLORS):
                # Remove low-alpha key-color/rainbow pixels left by source
                # extraction or resampling before the frame reaches runtime.
                pixels[x, y] = (0, 0, 0, alpha)
            elif green > red + 12 and green > blue + 12:
                pixels[x, y] = (red, min(green, max(red, blue) + 6), blue, alpha)
    return output


def load(path: Path) -> Image.Image:
    # Preserve the corrected static master byte-for-pixel for walking f01;
    # pose-specific cleanup is applied only to transformed frames.
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def top_frame(source: Image.Image, state: str) -> Image.Image:
    if state == "walking_front_f01":
        return source.copy()
    if state == "sitting_front_f01":
        # Keep the neckline/shoulders fixed; move only the lower torso so the
        # seated pose never floats or changes the front collar contour.
        output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        output.alpha_composite(source.crop((0, 0, 256, 224)), (0, 0))
        # The crop begins at source y=224, so its destination must stay in the
        # lower torso band. The two-row bridge closes the hinge before the
        # lower band is shifted down by two pixels.
        output.alpha_composite(source.crop((0, 223, 256, 226)), (0, 223))
        output.alpha_composite(source.crop((0, 224, 256, 306)), (0, 226))
        return clean(output)
    shear = {"walking_front_f02": 0.018, "walking_front_f03": -0.018, "walking_front_f04": 0.010}[state]
    return clean(source.transform(CANVAS, Image.Transform.AFFINE, (1, shear, -214 * shear, 0, 1, 0), Image.Resampling.BICUBIC))


def split_lower(source: Image.Image, state: str, split_y: int, bottom_y: int, bridge: bool = False) -> Image.Image:
    if state == "walking_front_f01":
        return source.copy()
    offsets = {
        "walking_front_f01": ((0, 0), (0, 0)),
        "walking_front_f02": ((-2, 1), (2, -1)),
        "walking_front_f03": ((2, -1), (-2, 1)),
        "walking_front_f04": ((-1, 1), (2, -1)),
        "sitting_front_f01": ((-3, 1), (3, 1)),
    }
    left, right = offsets[state]
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(source.crop((0, 0, 256, split_y)), (0, 0))
    output.alpha_composite(source.crop((88, split_y, 128, bottom_y)), (88 + left[0], split_y + left[1]))
    output.alpha_composite(source.crop((128, split_y, 168, bottom_y)), (128 + right[0], split_y + right[1]))
    if bridge:
        # Keep the waist/crotch hinge continuous while the lower legs follow
        # the step. This prevents a base-rig skin slit between the trouser legs.
        output.alpha_composite(source.crop((120, 294, 136, bottom_y)), (120, 294))
        # Preserve the full front hem/hinge row across every pose. Without a
        # fixed bridge the split crop leaves a one-pixel horizontal seam at
        # y=318, especially visible on shorts and seated trousers.
        hinge = source.crop((96, 318, 160, 319))
        if hinge.getpixel((128 - 96, 0))[3] <= 10:
            hinge.putpixel((128 - 96, 0), hinge.getpixel((127 - 96, 0)))
        output.alpha_composite(hinge, (96, 318))
        # The source shorts can carry a sub-threshold anti-aliased hole one
        # pixel beside the intended centre split. Keep the waist hinge a
        # single connected front plane while preserving that one-pixel split.
        pixels = output.load()
        for x in range(104, 152):
            if x == 128 or pixels[x, 318][3] > 10:
                continue
            for distance in range(1, 16):
                for candidate_x in (x - distance, x + distance):
                    if 0 <= candidate_x < CANVAS[0] and pixels[candidate_x, 318][3] > 10:
                        red, green, blue, _ = pixels[candidate_x, 318]
                        pixels[x, 318] = (red, green, blue, 255)
                        break
                if pixels[x, 318][3] > 10:
                    break
    return clean(output)


def seal_motion_body_gaps(image: Image.Image, state: str) -> Image.Image:
    """Keep moved trouser legs covering the base rig outside shoe pixels."""

    base = load(MOTION / f"room_avatar_base_male_light_v1_{state}.png")
    shoes = load(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png")
    pixels = image.load()
    base_pixels = base.load()
    shoe_pixels = shoes.load()
    for y in range(294, 344):
        for x in range(100, 157):
            if base_pixels[x, y][3] <= 10 or shoe_pixels[x, y][3] > 10 or pixels[x, y][3] > 10:
                continue
            source = None
            for distance in range(1, 24):
                for candidate_x in (x - distance, x + distance):
                    if 0 <= candidate_x < CANVAS[0] and pixels[candidate_x, y][3] > 10:
                        source = pixels[candidate_x, y]
                        break
                if source is not None:
                    break
            if source is None:
                for distance in range(1, 16):
                    for candidate_y in (y - distance, y + distance):
                        if 0 <= candidate_y < CANVAS[1] and pixels[x, candidate_y][3] > 10:
                            source = pixels[x, candidate_y]
                            break
                    if source is not None:
                        break
            if source is None:
                for radius in range(1, 24):
                    for delta_y in range(-radius, radius + 1):
                        for delta_x in range(-radius, radius + 1):
                            candidate_x, candidate_y = x + delta_x, y + delta_y
                            if (
                                0 <= candidate_x < CANVAS[0]
                                and 0 <= candidate_y < CANVAS[1]
                                and pixels[candidate_x, candidate_y][3] > 10
                            ):
                                source = pixels[candidate_x, candidate_y]
                                break
                        if source is not None:
                            break
                    if source is not None:
                        break
            if source is not None:
                red, green, blue, _ = source
                pixels[x, y] = (red, green, blue, 255)
    return clean(image)


def expose_motion_shoe_vamp_lane(image: Image.Image, state: str) -> Image.Image:
    """Leave the moving shoe laces/vamp visible below a trouser hem."""

    shoes = load(MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png")
    pixels = image.load()
    shoe_pixels = shoes.load()
    for y in range(326, 331):
        for x in range(120, 137):
            if shoe_pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
    return clean(image)


def frame(category: str, source: Image.Image, state: str, shorts: bool = False) -> Image.Image:
    if category == "top":
        return top_frame(source, state)
    if category == "bottom":
        lower = split_lower(source, state, 318, 348, bridge=True)
        return lower if shorts else expose_motion_shoe_vamp_lane(seal_motion_body_gaps(lower, state), state)
    if category == "shoes":
        return split_lower(source, state, 334, 352)
    raise ValueError(f"unsupported category: {category}")


def main() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    records = []
    static_paths = sorted([
        *ROOM.glob("avatar_room_top_male_*.png"),
        *ROOM.glob("avatar_room_bottom_male_*.png"),
        *ROOM.glob("avatar_room_shoes_male_*.png"),
    ])
    for static_path in static_paths:
        parts = static_path.stem.split("_")
        category = parts[2]
        slug = "_".join(parts[4:-1])
        source = load(static_path)
        evidence_dir = EVIDENCE / f"{category}_{slug}"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        generated = []
        for state in STATES:
            rendered = frame(category, source, state, shorts=category == "bottom" and "shorts" in slug)
            evidence_path = evidence_dir / f"{state}.png"
            live_path = MOTION / f"room_avatar_{category}_male_{slug}_v1_{state}.png"
            rendered.save(evidence_path, optimize=True)
            rendered.save(live_path, optimize=True)
            generated.append(str(live_path.relative_to(ROOT)))
        records.append({
            "category": category,
            "slug": slug,
            "staticPath": str(static_path.relative_to(ROOT)),
            "states": list(STATES),
            "motionPaths": generated,
            "evidenceDir": str(evidence_dir.relative_to(ROOT)),
        })
    (EVIDENCE / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1,
        "phase": "male-wardrobe-motion-fit",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "staticMaster": "apps/mobile/scripts/refit_male_wardrobe_static.py",
        "items": records,
    }, indent=2) + "\n")
    print(EVIDENCE / "manifest.json")


if __name__ == "__main__":
    main()
