#!/usr/bin/env python3
"""Render the promoted female top x bottom front seam matrix.

The matrix is a visual QA surface, not a catalog renderer.  It keeps the live
front-only layer order and renders every promoted top/bottom pairing at the
same crop for Static + Walk 01-04.  Shoes are included so pant-hem/upper
occlusion and skirt/shorts clearance are reviewable in the same evidence.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/female-nondress-wardrobe-qa"
CANVAS = (256, 384)
BACKGROUND = (247, 237, 244, 255)
TOPS = (
    ("Cream tee", "top_female_cream_basic_tee_v2"),
    ("Blush cardigan", "top_female_blush_lace_cardigan_v2"),
    ("Sage jacket", "top_female_sage_ribbon_knit_jacket_v2"),
    ("Cherry blouse", "top_female_cherry_heart_milkmaid_blouse_v2"),
    ("Powder corset", "top_female_powder_blue_ribbon_corset_top_v2"),
    ("Noir cardigan", "top_female_noir_rose_heart_cardigan_v2"),
)
BOTTOMS = (
    ("Denim skort", "bottom_female_denim_skort_shorts_v2", False),
    ("Crochet shorts", "bottom_female_striped_crochet_shorts_v2", False),
    ("Lace skirt", "bottom_female_layered_lace_ruffle_mini_skirt_v2", False),
    ("Black trousers", "bottom_female_black_palm_embellished_pants_v2", True),
    ("Coral trousers", "bottom_female_coral_embellished_laceup_pants_v2", True),
    ("Smoky trousers", "bottom_female_smoky_floral_mesh_pants_v2", True),
    ("Yellow skirt", "bottom_female_yellow_bow_lace_ruffle_skirt_v2", False),
)
STATES = (
    (None, "Static"),
    ("walking_front_f01", "Walk 01"),
    ("walking_front_f02", "Walk 02"),
    ("walking_front_f03", "Walk 03"),
    ("walking_front_f04", "Walk 04"),
)


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


def layer(prefix: str, suffix: str | None) -> Image.Image:
    if suffix:
        path = MOTION / f"room_avatar_{prefix}_{suffix}.png"
    else:
        path = ROOM / f"avatar_room_{prefix}.png"
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def compose(top: str, bottom: str, trousers: bool, suffix: str | None) -> Image.Image:
    result = Image.new("RGBA", CANVAS, BACKGROUND)
    for prefix in (
        "hair_back_female_mocha_ribbon_blowout_v2",
        "base_female_v2",
        "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2",
        "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
    ):
        result.alpha_composite(layer(prefix, suffix))
    # Pants are intentionally above the shoe upper; shorts/skirts remain below
    # shoes so the exposed leg and shoe upper stay readable.
    if trousers:
        result.alpha_composite(layer("shoes_female_milk_tea_court_sneakers_v2", suffix))
        result.alpha_composite(layer(bottom, suffix))
    else:
        result.alpha_composite(layer(bottom, suffix))
        result.alpha_composite(layer("shoes_female_milk_tea_court_sneakers_v2", suffix))
    result.alpha_composite(layer(top, suffix))
    result.alpha_composite(layer("hair_front_female_mocha_ribbon_blowout_v2", suffix))
    return result


def render_state(state: str, label: str | None) -> None:
    columns = 4
    cell_w, cell_h = 300, 214
    rows = (len(TOPS) * len(BOTTOMS) + columns - 1) // columns
    output = Image.new("RGBA", (cell_w * columns, 48 + cell_h * rows), BACKGROUND)
    draw = ImageDraw.Draw(output)
    title = f"Female front seam matrix · {label or 'Static'} · top × bottom · waist / crotch / hem / shoe"
    draw.text((12, 12), title, fill=(74, 48, 67, 255), font=font(19))
    index = 0
    for top_name, top in TOPS:
        for bottom_name, bottom, trousers in BOTTOMS:
            render = compose(top, bottom, trousers, state)
            crop = render.crop((70, 252, 186, 352)).resize((276, 238), Image.Resampling.NEAREST)
            x = (index % columns) * cell_w + 12
            y = 48 + (index // columns) * cell_h
            draw.text((x, y + 2), f"{top_name} + {bottom_name}", fill=(74, 48, 67, 255), font=font(12))
            output.alpha_composite(crop, (x, y + 24))
            index += 1
    OUT.mkdir(parents=True, exist_ok=True)
    suffix = state or "static"
    output.convert("RGB").save(OUT / f"2026-07-15-female-front-{suffix}-seam-matrix.png", optimize=True)


def main() -> None:
    for state, label in STATES:
        render_state(state, label)


if __name__ == "__main__":
    main()
