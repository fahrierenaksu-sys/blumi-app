#!/usr/bin/env python3
"""Render and validate every live front-facing room rig layer.

This is an independent visual QA surface. It never edits source assets: each
group is rendered at the runtime layer order for Static, Walk 01-04 and Sit 01,
then a fit-zone crop is written for original-resolution inspection.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/deep-rig-qa"
CANVAS = (256, 384)
BACKGROUND = (247, 237, 244, 255)
STATES: tuple[tuple[str | None, str]] = (
    (None, "Static"),
    ("walking_front_f01", "Walk 01"),
    ("walking_front_f02", "Walk 02"),
    ("walking_front_f03", "Walk 03"),
    ("walking_front_f04", "Walk 04"),
    ("sitting_front_f01", "Sit 01"),
)
FEMALE_QUARANTINED = {
    "avatar_room_top_female_cream_knit_v2.png",
    "avatar_room_bottom_female_denim_straight_v2.png",
}
FEMALE_PANTS = {
    "avatar_room_bottom_female_black_palm_embellished_pants_v2.png",
    "avatar_room_bottom_female_coral_embellished_laceup_pants_v2.png",
    "avatar_room_bottom_female_smoky_floral_mesh_pants_v2.png",
}
FIXED_HEAD_FILES = {
    "avatar_room_face_male_warm_friendly_v1.png",
    "avatar_room_hair_front_male_espresso_crop_v1.png",
    "avatar_room_hair_front_male_cocoa_textured_quiff_v1.png",
    "avatar_room_hair_front_male_soft_black_side_part_v1.png",
    "avatar_room_hair_front_male_chestnut_short_waves_v1.png",
}


@dataclass(frozen=True)
class Item:
    label: str
    filename: str
    paired: str | None = None


def pretty(filename: str) -> str:
    stem = Path(filename).stem
    for prefix in (
        "avatar_room_accessory_female_",
        "avatar_room_bottom_female_",
        "avatar_room_top_female_",
        "avatar_room_shoes_female_",
        "avatar_room_hair_back_female_",
        "avatar_room_hair_front_female_",
        "avatar_room_face_female_",
        "avatar_room_eyes_female_",
        "avatar_room_nose_female_",
        "avatar_room_mouth_female_",
        "avatar_room_base_male_",
        "avatar_room_face_male_",
        "avatar_room_top_male_",
        "avatar_room_bottom_male_",
        "avatar_room_shoes_male_",
        "avatar_room_hair_front_male_",
    ):
        stem = stem.removeprefix(prefix)
    return stem.removesuffix("_v1").removesuffix("_v2").replace("_", " ").title()


def items(pattern: str) -> list[Item]:
    paths = [path for path in ROOM.glob(pattern) if path.name not in FEMALE_QUARANTINED]
    return [Item(pretty(path.name), path.name) for path in sorted(paths)]


def paired_dress(filename: str, category: str) -> str | None:
    if category == "tops" and "_dress_v2.png" in filename:
        return filename.replace("avatar_room_top_", "avatar_room_bottom_", 1)
    if category == "bottoms" and "_dress_v2.png" in filename:
        return filename.replace("avatar_room_bottom_", "avatar_room_top_", 1)
    return None


def motion_path(filename: str, state: str | None) -> Path:
    if state is None:
        return ROOM / filename
    stem = Path(filename).stem.replace("avatar_room_", "room_avatar_", 1)
    return MOTION / f"{stem}_{state}.png"


def load(filename: str, state: str | None) -> Image.Image:
    path = motion_path(filename, state)
    if not path.exists():
        if state is not None and filename in FIXED_HEAD_FILES:
            path = ROOM / filename
        else:
            raise FileNotFoundError(path)
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path.name}: expected {CANVAS}, got {image.size}")
    return image


def alpha_bounds(image: Image.Image, threshold: int = 16) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    min_x, min_y = image.width, image.height
    max_x, max_y = -1, -1
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] <= threshold:
                continue
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
    return min_x, min_y, max_x, max_y


def transparent_rgb_residue(image: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in image.getdata()
        if alpha == 0 and (red != 0 or green != 0 or blue != 0)
    )


def alpha_centroid_x(image: Image.Image, threshold: int = 16) -> float:
    alpha = image.getchannel("A")
    total = 0
    weighted = 0
    for y in range(image.height):
        for x in range(image.width):
            value = alpha.getpixel((x, y))
            if value <= threshold:
                continue
            total += value
            weighted += x * value
    return weighted / total if total else 128.0


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


FEMALE_DEFAULTS = {
    "base": "avatar_room_base_female_v2.png",
    "face": "avatar_room_face_female_soft_doll_foundation_v2.png",
    "eyes": "avatar_room_eyes_female_mocha_doe_v2.png",
    "nose": "avatar_room_nose_female_soft_button_v2.png",
    "mouth": "avatar_room_mouth_female_peach_whisper_smile_v2.png",
    "hair_back": "avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png",
    "hair_front": "avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png",
    "top": "avatar_room_top_female_cream_basic_tee_v2.png",
    "bottom": "avatar_room_bottom_female_denim_skort_shorts_v2.png",
    "shoes": "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
}
MALE_DEFAULTS = {
    "base": "avatar_room_base_male_light_v1.png",
    "face": "avatar_room_face_male_warm_friendly_v1.png",
    "hair": "avatar_room_hair_front_male_espresso_crop_v1.png",
    "top": "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    "bottom": "avatar_room_bottom_male_navy_straight_pants_v1.png",
    "shoes": "avatar_room_shoes_male_milk_tea_court_v1.png",
}


def female_compose(category: str, item: Item, state: str | None) -> Image.Image:
    values = dict(FEMALE_DEFAULTS)
    if category == "tops":
        values["top"] = item.filename
        values["bottom"] = item.paired or paired_dress(item.filename, category) or values["bottom"]
    elif category == "bottoms":
        values["bottom"] = item.filename
        values["top"] = item.paired or paired_dress(item.filename, category) or values["top"]
    elif category == "shoes":
        values["shoes"] = item.filename
    elif category == "hair":
        values["hair_back"] = item.paired or values["hair_back"]
        values["hair_front"] = item.filename
    elif category in {"face", "eyes", "nose", "mouth"}:
        values[category] = item.filename

    accessory = item.filename if category == "accessories" else None
    # Keep the result transparent so exact character bounds can be measured.
    # The sheet renderer adds the QA background only at presentation time.
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for filename in (values["hair_back"], values["base"], values["face"], values["eyes"], values["nose"], values["mouth"]):
        result.alpha_composite(load(filename, state))
    trousers = values["bottom"] in FEMALE_PANTS
    if trousers:
        result.alpha_composite(load(values["shoes"], state))
        result.alpha_composite(load(values["bottom"], state))
    else:
        result.alpha_composite(load(values["bottom"], state))
        result.alpha_composite(load(values["shoes"], state))
    result.alpha_composite(load(values["top"], state))
    result.alpha_composite(load(values["hair_front"], state))
    if accessory:
        result.alpha_composite(load(accessory, state))
    return result


def male_compose(category: str, item: Item, state: str | None) -> Image.Image:
    values = dict(MALE_DEFAULTS)
    if category == "tops":
        values["top"] = item.filename
    elif category == "bottoms":
        values["bottom"] = item.filename
    elif category == "shoes":
        values["shoes"] = item.filename
    elif category == "hair":
        values["hair"] = item.filename
    elif category == "foundations":
        values["base"] = item.filename if "base_" in item.filename else values["base"]
        values["face"] = item.filename if "face_" in item.filename else values["face"]
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for filename in (values["base"], values["face"], values["shoes"], values["bottom"], values["top"], values["hair"]):
        result.alpha_composite(load(filename, state))
    return result


def sheet(
    name: str,
    entries: Iterable[Item],
    compose: Callable[[Item, str | None], Image.Image],
    crop: tuple[int, int, int, int],
    scale: int,
) -> tuple[Path, list[str]]:
    entries = list(entries)
    crop_w, crop_h = crop[2] - crop[0], crop[3] - crop[1]
    tile_w, tile_h = crop_w * scale, crop_h * scale
    label_h = 42
    row_h = tile_h + label_h + 14
    sheet_image = Image.new("RGBA", (len(STATES) * tile_w, max(1, len(entries)) * row_h + 50), BACKGROUND)
    draw = ImageDraw.Draw(sheet_image)
    draw.text((10, 10), f"{name} · Static / Walk 01–04 / Sit 01 · front rig", fill=(74, 48, 67, 255), font=font(20))
    warnings: list[str] = []
    for row, item in enumerate(entries):
        for column, (state, state_label) in enumerate(STATES):
            full = compose(item, state)
            display = Image.new("RGBA", CANVAS, BACKGROUND)
            display.alpha_composite(full)
            cropped = display.crop(crop).resize((tile_w, tile_h), Image.Resampling.NEAREST)
            x, y = column * tile_w, 50 + row * row_h
            sheet_image.alpha_composite(cropped, (x, y + label_h))
            draw.text((x + 6, y + 8), f"{item.label} · {state_label}", fill=(74, 48, 67, 255), font=font(12))
            if state is None:
                bounds = alpha_bounds(full)
                if abs(alpha_centroid_x(full) - 128) > 5:
                    warnings.append(f"{item.filename}: static centroid {alpha_centroid_x(full):.2f}")
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"2026-07-15-{name}.png"
    sheet_image.convert("RGB").save(path, optimize=True)
    return path, warnings


def hair_items() -> list[Item]:
    front = {path.name for path in ROOM.glob("avatar_room_hair_front_female_*.png")}
    result = []
    for path in sorted(ROOM.glob("avatar_room_hair_front_female_*.png")):
        back = path.name.replace("hair_front_", "hair_back_", 1)
        if back not in {p.name for p in ROOM.glob("avatar_room_hair_back_female_*.png")}:  # noqa: B023
            continue
        result.append(Item(pretty(path.name), path.name, paired=back))
    return result


def male_items(pattern: str) -> list[Item]:
    return items(pattern)


def run() -> None:
    groups: list[tuple[str, list[Item], Callable[[Item, str | None], Image.Image], tuple[int, int, int, int], int]] = []
    female_compose_for = lambda category: (lambda item, state: female_compose(category, item, state))
    male_compose_for = lambda category: (lambda item, state: male_compose(category, item, state))
    groups.extend([
        ("female-tops", [Item(x.label, x.filename, paired=paired_dress(x.filename, "tops")) for x in items("avatar_room_top_female_*.png")], female_compose_for("tops"), (42, 175, 214, 322), 2),
        ("female-bottoms", [Item(x.label, x.filename, paired=paired_dress(x.filename, "bottoms")) for x in items("avatar_room_bottom_female_*.png")], female_compose_for("bottoms"), (48, 245, 208, 372), 2),
        ("female-shoes", items("avatar_room_shoes_female_*.png"), female_compose_for("shoes"), (54, 282, 202, 372), 2),
        ("female-accessories", items("avatar_room_accessory_female_*.png"), female_compose_for("accessories"), (25, 42, 231, 300), 2),
        ("female-hair", hair_items(), female_compose_for("hair"), (24, 42, 232, 285), 2),
        ("female-face", items("avatar_room_face_female_*.png"), female_compose_for("face"), (48, 80, 208, 245), 3),
        ("female-eyes", items("avatar_room_eyes_female_*.png"), female_compose_for("eyes"), (70, 125, 186, 210), 4),
        ("female-nose", items("avatar_room_nose_female_*.png"), female_compose_for("nose"), (96, 160, 160, 212), 4),
        ("female-mouth", items("avatar_room_mouth_female_*.png"), female_compose_for("mouth"), (96, 172, 164, 220), 4),
        ("male-tops", male_items("avatar_room_top_male_*.png"), male_compose_for("tops"), (42, 175, 214, 322), 2),
        ("male-bottoms", male_items("avatar_room_bottom_male_*.png"), male_compose_for("bottoms"), (48, 245, 208, 372), 2),
        ("male-shoes", male_items("avatar_room_shoes_male_*.png"), male_compose_for("shoes"), (54, 282, 202, 372), 2),
        ("male-hair", male_items("avatar_room_hair_front_male_*.png"), male_compose_for("hair"), (24, 42, 232, 245), 2),
        ("male-foundations", [Item("Male Base", MALE_DEFAULTS["base"]), Item("Male Face", MALE_DEFAULTS["face"])], male_compose_for("foundations"), (48, 60, 208, 260), 2),
    ])

    manifest: list[dict[str, object]] = []
    bbox_manifest: list[dict[str, object]] = []
    warnings: list[str] = []
    for name, entry_list, composer, crop, scale in groups:
        path, sheet_warnings = sheet(name, entry_list, composer, crop, scale)
        manifest.append({"sheet": str(path.relative_to(ROOT)), "items": len(entry_list), "crop": crop, "warnings": sheet_warnings})
        for item in entry_list:
            sources = [item.filename]
            if item.paired and item.paired not in sources:
                sources.append(item.paired)
            source_metrics: dict[str, object] = {}
            for source in sources:
                states: dict[str, object] = {}
                for state, state_label in STATES:
                    image = load(source, state)
                    states[state_label] = {
                        "alphaBounds": list(alpha_bounds(image)),
                        "transparentRgbResidue": transparent_rgb_residue(image),
                        "alphaCentroidX": round(alpha_centroid_x(image), 3),
                    }
                source_metrics[source] = states
            composites: dict[str, object] = {}
            for state, state_label in STATES:
                image = composer(item, state)
                composites[state_label] = {
                    "alphaBounds": list(alpha_bounds(image)),
                    "transparentRgbResidue": transparent_rgb_residue(image),
                    "alphaCentroidX": round(alpha_centroid_x(image), 3),
                }
            bbox_manifest.append({
                "group": name,
                "item": item.label,
                "filename": item.filename,
                "sources": source_metrics,
                "composite": composites,
            })
        warnings.extend(f"{name}: {warning}" for warning in sheet_warnings)

    import json

    (OUT / "2026-07-15-deep-front-rig-manifest.json").write_text(
        json.dumps(
            {
                "states": [label for _, label in STATES],
                "sheets": manifest,
                "bboxManifest": "docs/avatar-motion-pipeline/deep-rig-qa/2026-07-15-deep-front-rig-bboxes.json",
                "warnings": warnings,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    (OUT / "2026-07-15-deep-front-rig-bboxes.json").write_text(
        json.dumps({"states": [label for _, label in STATES], "rigs": bbox_manifest}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"sheets": len(manifest), "warnings": warnings}, indent=2))


if __name__ == "__main__":
    run()
