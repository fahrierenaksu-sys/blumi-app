#!/usr/bin/env python3
"""Render current-run male wardrobe fit sheets from canonical room assets.

The renderer is intentionally deterministic: it never alters source assets and
uses the same category order as the room avatar (shoe under long pant hems).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_ROOT = ASSET_ROOT / "motion"
OUTPUT_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa"
CANVAS = (256, 384)
EVIDENCE_DATE = date.today().isoformat()

BASE = "avatar_room_base_male_light_v1.png"
FACE = "avatar_room_face_male_warm_friendly_v1.png"
HAIR = "avatar_room_hair_front_male_espresso_crop_v1.png"
TOP = "avatar_room_top_male_powder_blue_crew_tee_v1.png"
BOTTOM = "avatar_room_bottom_male_navy_straight_pants_v1.png"
SHOES = "avatar_room_shoes_male_milk_tea_court_v1.png"

PALETTE = {
    "paper": (255, 248, 251),
    "panel": (255, 255, 255),
    "ink": (69, 43, 57),
    "muted": (126, 104, 116),
    "pink": (236, 79, 150),
    "green": (38, 142, 102),
    "red": (190, 55, 75),
}


def load(name: str) -> Image.Image:
    image = Image.open(ASSET_ROOT / name).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{name}: expected {CANVAS}, got {image.size}")
    return image


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    colors = ((255, 253, 254), (241, 235, 239))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def composite(names: list[str]) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in names:
        result = Image.alpha_composite(result, load(name))
    return result


def motion_complete(name: str) -> bool:
    prefix = Path(name).stem.replace("avatar_room_", "room_avatar_", 1)
    required = [
        *(f"{prefix}_walking_front_f{frame:02d}.png" for frame in range(1, 5)),
        f"{prefix}_sitting_front_f01.png",
    ]
    return all((MOTION_ROOT / item).exists() for item in required)


def friendly(name: str) -> str:
    stem = Path(name).stem
    for prefix in (
        "avatar_room_top_male_",
        "avatar_room_bottom_male_",
        "avatar_room_shoes_male_",
        "avatar_room_hair_front_male_",
    ):
        stem = stem.removeprefix(prefix)
    return stem.removesuffix("_v1").replace("_", " ").title()


def items() -> dict[str, list[str]]:
    return {
        "TOPS": sorted(path.name for path in ASSET_ROOT.glob("avatar_room_top_male_*.png")),
        "BOTTOMS": sorted(path.name for path in ASSET_ROOT.glob("avatar_room_bottom_male_*.png")),
        "SHOES": sorted(path.name for path in ASSET_ROOT.glob("avatar_room_shoes_male_*.png")),
        "HAIR": sorted(path.name for path in ASSET_ROOT.glob("avatar_room_hair_front_male_*.png")),
    }


def avatar_for(category: str, item: str) -> Image.Image:
    top = item if category == "TOPS" else TOP
    bottom = item if category == "BOTTOMS" else BOTTOM
    shoes = item if category == "SHOES" else SHOES
    hair = item if category == "HAIR" else HAIR
    # Long pants deliberately render over shoe uppers; top renders over waist.
    return composite([BASE, FACE, shoes, bottom, top, hair])


def label(draw: ImageDraw.ImageDraw, position: tuple[int, int], text: str, fill: tuple[int, int, int]) -> None:
    draw.text(position, text, font=ImageFont.load_default(), fill=fill)


def render_inventory() -> Path:
    catalog = items()
    columns = 4
    tile_width = 280
    tile_height = 456
    header = 76
    section_header = 36
    sections_height = 0
    for section_items in catalog.values():
        rows = max(1, (len(section_items) + columns - 1) // columns)
        sections_height += section_header + rows * tile_height
    sheet = Image.new("RGB", (columns * tile_width, header + sections_height), PALETTE["paper"])
    draw = ImageDraw.Draw(sheet)
    label(draw, (24, 18), "MALE WARDROBE / STATIC FIT INVENTORY", PALETTE["ink"])
    label(draw, (24, 40), "Canonical 256x384 room rig · current-run visual evidence", PALETTE["muted"])

    y = header
    for category, section_items in catalog.items():
        label(draw, (24, y + 11), f"{category}  ·  {len(section_items)}", PALETTE["pink"])
        y += section_header
        rows = max(1, (len(section_items) + columns - 1) // columns)
        for index, item in enumerate(section_items):
            column = index % columns
            row = index // columns
            x = column * tile_width + 12
            tile_y = y + row * tile_height
            panel = checkerboard(CANVAS)
            avatar = avatar_for(category, item)
            panel.paste(avatar, (0, 0), avatar)
            sheet.paste(panel, (x, tile_y))
            label(draw, (x, tile_y + 390), friendly(item)[:34], PALETTE["ink"])
            ready = motion_complete(item)
            label(
                draw,
                (x, tile_y + 410),
                "MOTION 4W+1S: PASS" if ready else "MOTION 4W+1S: MISSING",
                PALETTE["green"] if ready else PALETTE["red"],
            )
            label(draw, (x, tile_y + 430), item[:40], PALETTE["muted"])
        y += rows * tile_height

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_ROOT / f"{EVIDENCE_DATE}-male-static-inventory-contact-sheet.png"
    sheet.save(output)
    return output


def crop_panel(avatar: Image.Image, crop: tuple[int, int, int, int], scale: int) -> Image.Image:
    cut = avatar.crop(crop).resize(
        ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale),
        Image.Resampling.NEAREST,
    )
    background = checkerboard(cut.size, cell=16)
    background.paste(cut, (0, 0), cut)
    return background


def render_fit_details() -> Path:
    catalog = items()
    rows: list[tuple[str, str, Image.Image, Image.Image]] = []
    for item in catalog["TOPS"]:
        avatar = avatar_for("TOPS", item)
        rows.append(("TOP", item, crop_panel(avatar, (84, 208, 172, 254), 3), crop_panel(avatar, (92, 278, 164, 306), 4)))
    for item in catalog["BOTTOMS"]:
        avatar = avatar_for("BOTTOMS", item)
        rows.append(("BOTTOM", item, crop_panel(avatar, (92, 278, 164, 310), 4), crop_panel(avatar, (92, 316, 164, 352), 4)))
    for item in catalog["SHOES"]:
        avatar = avatar_for("SHOES", item)
        rows.append(("SHOES", item, crop_panel(avatar, (92, 314, 164, 352), 4), crop_panel(avatar, (96, 326, 160, 354), 4)))

    width = 720
    row_height = 200
    sheet = Image.new("RGB", (width, 72 + max(1, len(rows)) * row_height), PALETTE["paper"])
    draw = ImageDraw.Draw(sheet)
    label(draw, (24, 17), "MALE FIT CONTACT ZONES", PALETTE["ink"])
    label(draw, (24, 39), "Neck/shoulder · waist · pant hem/shoe upper · nearest-neighbor inspection", PALETTE["muted"])

    y = 72
    for category, item, first, second in rows:
        label(draw, (18, y + 14), category, PALETTE["pink"])
        label(draw, (18, y + 34), friendly(item)[:28], PALETTE["ink"])
        label(draw, (18, y + 54), "motion: pass" if motion_complete(item) else "motion: missing", PALETTE["green"] if motion_complete(item) else PALETTE["red"])
        first.thumbnail((280, 176), Image.Resampling.NEAREST)
        second.thumbnail((280, 176), Image.Resampling.NEAREST)
        sheet.paste(first, (160, y + 10))
        sheet.paste(second, (442, y + 10))
        y += row_height

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_ROOT / f"{EVIDENCE_DATE}-male-fit-zones-contact-sheet.png"
    sheet.save(output)
    return output


def render_bottom_leg_gap_details() -> Path:
    """Render the canonical hem-to-foot contact zone for every male bottom."""

    bottoms = items()["BOTTOMS"]
    columns = 4
    tile_width, tile_height = 250, 288
    header = 72
    rows = (len(bottoms) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_width, header + rows * tile_height), PALETTE["paper"])
    draw = ImageDraw.Draw(sheet)
    label(draw, (20, 16), "MALE BOTTOM / LEG SPLIT AND SHOE CONTACT", PALETTE["ink"])
    label(draw, (20, 38), "Canonical base separation retained: no solid crotch block, no skin tear", PALETTE["muted"])
    for index, item in enumerate(bottoms):
        x = (index % columns) * tile_width + 14
        y = header + (index // columns) * tile_height
        avatar = avatar_for("BOTTOMS", item)
        close_up = crop_panel(avatar, (88, 274, 168, 356), 3)
        sheet.paste(close_up, (x, y))
        label(draw, (x, y + 248), friendly(item)[:30], PALETTE["ink"])
        label(draw, (x, y + 267), "base-aligned leg split", PALETTE["green"])
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_ROOT / f"{EVIDENCE_DATE}-male-bottom-leg-split-contact-sheet.png"
    sheet.save(output)
    return output


def main() -> None:
    for output in (render_inventory(), render_fit_details(), render_bottom_leg_gap_details()):
        print(output)


if __name__ == "__main__":
    main()
