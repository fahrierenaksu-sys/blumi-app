#!/usr/bin/env python3
"""Rig four original image-generated dresses to the canonical female room base.

The source renders are retained under docs/avatar-motion-pipeline/render-sources/
for traceability.  This renderer only applies deterministic crop, fit and
pose-aware placement to those original game-art sources; it never pastes a
reference photo or paints a corrective patch over a failed fit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
LAYERS = ROOT / "apps/mobile/src/features/avatarV2/assets/layers"
THUMBNAILS = ROOT / "apps/mobile/src/features/avatarV2/assets/shop-thumbnails"
SOURCES = ROOT / "docs/avatar-motion-pipeline/render-sources/female-dresses"
QA = ROOT / "docs/avatar-motion-pipeline/female-dress-capsule-qa/2026-07-16"
CANVAS = (256, 384)
PINK = (252, 244, 250, 255)


@dataclass(frozen=True)
class Dress:
    slug: str
    label: str
    price: int
    source_alpha: str
    # Full fitted source bounds on the canonical 256x384 room canvas.
    target: tuple[int, int, int, int]
    # The seam is intentionally duplicated by a few pixels so the top (which
    # renders after the bottom) reads as one dress instead of two floating layers.
    seam_y: int
    sitting_bottom: tuple[int, int, int, int]


DRESSES = (
    Dress(
        slug="rose_ribbon_tea_dress",
        label="Rosé Ribbon Tea Dress",
        price=190,
        source_alpha="rose_ribbon_tea_dress_source_alpha.png",
        target=(73, 204, 183, 329),
        seam_y=264,
        sitting_bottom=(67, 263, 189, 331),
    ),
    Dress(
        slug="moonlit_velvet_ballet_dress",
        label="Moonlit Velvet Ballet Dress",
        price=220,
        source_alpha="moonlit_velvet_ballet_dress_source_alpha.png",
        target=(74, 205, 182, 326),
        seam_y=260,
        sitting_bottom=(66, 261, 190, 329),
    ),
    Dress(
        slug="buttercup_picnic_pinafore_dress",
        label="Buttercup Picnic Pinafore Dress",
        price=180,
        source_alpha="buttercup_picnic_pinafore_dress_source_alpha.png",
        target=(72, 203, 184, 332),
        seam_y=264,
        sitting_bottom=(65, 263, 191, 332),
    ),
    Dress(
        slug="lavender_garden_ribbon_dress",
        label="Lavender Garden Ribbon Dress",
        price=200,
        source_alpha="lavender_garden_ribbon_dress_source_alpha.png",
        target=(71, 202, 185, 335),
        seam_y=266,
        sitting_bottom=(64, 264, 192, 334),
    ),
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ) if bold else (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    )
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    """Remove hidden key colour so transparent pixels cannot produce fringes."""
    output = image.copy()
    red, green, blue, alpha = output.split()
    empty = alpha.point(lambda value: 255 if value == 0 else 0)
    zero = Image.new("L", output.size, 0)
    return Image.merge(
        "RGBA",
        (
            Image.composite(zero, red, empty),
            Image.composite(zero, green, empty),
            Image.composite(zero, blue, empty),
            alpha,
        ),
    )


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clean_transparent_rgb(image).save(path, optimize=True)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source dress has no opaque pixels")
    return bbox


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fit_source(dress: Dress) -> Image.Image:
    source = load(SOURCES / dress.source_alpha)
    crop = source.crop(alpha_bbox(source))
    left, top, right, bottom = dress.target
    fitted = crop.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(fitted, (left, top))
    return clean_transparent_rgb(canvas)


def split_atomic_layers(full: Image.Image, dress: Dress) -> tuple[Image.Image, Image.Image]:
    """Split one fitted dress into intentional overlapping atomic top/bottom layers."""
    top = full.copy()
    bottom = full.copy()
    top_alpha = top.getchannel("A")
    bottom_alpha = bottom.getchannel("A")
    top_draw = ImageDraw.Draw(top_alpha)
    bottom_draw = ImageDraw.Draw(bottom_alpha)
    # 7px overlap guarantees a continuous seam. Top is rendered last.
    top_draw.rectangle((0, dress.seam_y + 7, CANVAS[0], CANVAS[1]), fill=0)
    bottom_draw.rectangle((0, 0, CANVAS[0], dress.seam_y - 3), fill=0)
    top.putalpha(top_alpha)
    bottom.putalpha(bottom_alpha)
    return clean_transparent_rgb(top), clean_transparent_rgb(bottom)


def transform_layer(
    layer: Image.Image,
    dx: int,
    dy: int,
    sx: float,
    sy: float,
) -> Image.Image:
    bbox = alpha_bbox(layer)
    crop = layer.crop(bbox)
    width = max(1, round(crop.width * sx))
    height = max(1, round(crop.height * sy))
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    center_x = (bbox[0] + bbox[2]) / 2 + dx
    center_y = (bbox[1] + bbox[3]) / 2 + dy
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(resized, (round(center_x - width / 2), round(center_y - height / 2)))
    return clean_transparent_rgb(output)


def sitting_bottom(layer: Image.Image, dress: Dress) -> Image.Image:
    crop = layer.crop(alpha_bbox(layer))
    left, top, right, bottom = dress.sitting_bottom
    fitted = crop.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, (left, top))
    return clean_transparent_rgb(output)


def static_path(kind: str, dress: Dress) -> Path:
    return ROOM / f"avatar_room_{kind}_female_{dress.slug}_v2.png"


def motion_path(kind: str, dress: Dress, pose: str) -> Path:
    return MOTION / f"room_avatar_{kind}_female_{dress.slug}_v2_{pose}.png"


def full_static(dress: Dress) -> Image.Image:
    full = fit_source(dress)
    return full


def render_layers(dress: Dress) -> dict[str, tuple[Image.Image, Image.Image]]:
    full = full_static(dress)
    top, bottom = split_atomic_layers(full, dress)
    layers: dict[str, tuple[Image.Image, Image.Image]] = {
        "static": (top, bottom),
        "walking_front_f01": (top.copy(), bottom.copy()),
        "walking_front_f02": (
            transform_layer(top, -1, 0, 1.01, 1.0),
            transform_layer(bottom, -2, 0, 1.02, 0.99),
        ),
        "walking_front_f03": (
            transform_layer(top, 0, 1, 0.99, 1.01),
            transform_layer(bottom, 1, 0, 0.99, 1.01),
        ),
        "walking_front_f04": (
            transform_layer(top, 1, 0, 1.01, 0.99),
            transform_layer(bottom, 2, 1, 1.02, 0.98),
        ),
        "sitting_front_f01": (
            transform_layer(top, 0, 0, 1.0, 0.96),
            sitting_bottom(bottom, dress),
        ),
    }
    return layers


def room_base(pose: str) -> Image.Image:
    if pose == "static":
        return load(ROOM / "avatar_room_base_female_v2.png")
    return load(MOTION / f"room_avatar_base_female_v2_{pose}.png")


def room_shoes(pose: str) -> Image.Image:
    if pose == "static":
        return load(ROOM / "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png")
    return load(MOTION / f"room_avatar_shoes_female_milk_tea_court_sneakers_v2_{pose}.png")


def composite(dress: Dress, pose: str, layers: dict[str, tuple[Image.Image, Image.Image]]) -> Image.Image:
    top, bottom = layers[pose]
    output = Image.new("RGBA", CANVAS, PINK)
    output.alpha_composite(room_base(pose))
    output.alpha_composite(bottom)
    output.alpha_composite(top)
    output.alpha_composite(room_shoes(pose))
    return output


def thumbnail(dress: Dress, top: Image.Image, bottom: Image.Image) -> Image.Image:
    full = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    full.alpha_composite(bottom)
    full.alpha_composite(top)
    bbox = alpha_bbox(full)
    crop = full.crop(bbox)
    scale = min(426 / crop.width, 558 / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    output = Image.new("RGBA", (512, 768), (0, 0, 0, 0))
    output.alpha_composite(crop.resize(size, Image.Resampling.LANCZOS), ((512 - size[0]) // 2, 76))
    return output


def profile(layer: Image.Image) -> Image.Image:
    return layer.resize((512, 768), Image.Resampling.LANCZOS)


def manifest_entry(dress: Dress) -> dict[str, object]:
    top_name = f"avatar_room_top_female_{dress.slug}_v2.png"
    bottom_name = f"avatar_room_bottom_female_{dress.slug}_v2.png"
    return {
        "slug": dress.slug,
        "label": dress.label,
        "price": dress.price,
        "outfitKey": dress.slug,
        "source": {
            "chromakey": f"docs/avatar-motion-pipeline/render-sources/female-dresses/{dress.slug}_source_chromakey.png",
            "alpha": f"docs/avatar-motion-pipeline/render-sources/female-dresses/{dress.source_alpha}",
            "chromakeySha256": sha256(SOURCES / f"{dress.slug}_source_chromakey.png"),
            "alphaSha256": sha256(SOURCES / dress.source_alpha),
            "method": "built-in image generation on chroma key, then local alpha extraction",
        },
        "top": {
            "assetId": f"avatar_v2_top_{dress.slug}",
            "roomAssetId": f"avatar_room_top_female_{dress.slug}_v2",
            "static": f"apps/mobile/src/features/avatarV2/assets/room/{top_name}",
            "profile": f"apps/mobile/src/features/avatarV2/assets/layers/avatar_top_{dress.slug}.png",
            "thumbnail": f"apps/mobile/src/features/avatarV2/assets/shop-thumbnails/avatar_v2_top_{dress.slug}.png",
            "layerOrder": 50,
            "motion": [
                f"apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_top_female_{dress.slug}_v2_walking_front_f0{frame}.png"
                for frame in range(1, 5)
            ] + [
                f"apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_top_female_{dress.slug}_v2_sitting_front_f01.png"
            ],
        },
        "bottom": {
            "assetId": f"avatar_v2_bottom_{dress.slug}",
            "roomAssetId": f"avatar_room_bottom_female_{dress.slug}_v2",
            "static": f"apps/mobile/src/features/avatarV2/assets/room/{bottom_name}",
            "profile": f"apps/mobile/src/features/avatarV2/assets/layers/avatar_bottom_{dress.slug}.png",
            "hiddenFromShop": True,
            "hiddenFromWardrobe": True,
            "layerOrder": 40,
            "occlusionRole": "bottomBehindShoes",
            "motion": [
                f"apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_bottom_female_{dress.slug}_v2_walking_front_f0{frame}.png"
                for frame in range(1, 5)
            ] + [
                f"apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_bottom_female_{dress.slug}_v2_sitting_front_f01.png"
            ],
        },
    }


def write_manifest() -> None:
    payload = {
        "schemaVersion": 1,
        "scope": "female-dress-capsule-2026-07-16",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "artDirection": "soft painterly chibi game art; generated source is re-fitted to the canonical female body envelope",
        "canvas": {"width": 256, "height": 384, "motion": "4W+1S", "frameDurationMs": 120},
        "dresses": [manifest_entry(dress) for dress in DRESSES],
    }
    SOURCES.mkdir(parents=True, exist_ok=True)
    (SOURCES / "female-dress-capsule-manifest.json").write_text(
        json.dumps(payload, indent=2) + "\n",
        encoding="utf-8",
    )


def qa_sheet(title: str, cells: Iterable[tuple[str, Image.Image]], path: Path, columns: int) -> None:
    cards = list(cells)
    card_width, card_height = 292, 458
    rows = (len(cards) + columns - 1) // columns
    image = Image.new("RGBA", (36 + columns * card_width, 84 + rows * card_height), PINK)
    draw = ImageDraw.Draw(image)
    draw.text((28, 22), title, fill="#2b2430", font=font(26, bold=True))
    for index, (label, preview) in enumerate(cards):
        col, row = index % columns, index // columns
        x, y = 24 + col * card_width, 68 + row * card_height
        draw.rounded_rectangle((x, y, x + 264, y + 420), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
        fitted = preview.resize((220, 330), Image.Resampling.LANCZOS)
        image.alpha_composite(fitted, (x + 22, y + 42))
        draw.text((x + 16, y + 14), label, fill="#463744", font=font(15, bold=True))
    save(image, path)


def closeup_sheet(
    dresses: Iterable[Dress],
    rendered: dict[str, dict[str, tuple[Image.Image, Image.Image]]],
) -> None:
    cells: list[tuple[str, Image.Image]] = []
    for dress in dresses:
        static = composite(dress, "static", rendered[dress.slug])
        neckline = static.crop((70, 196, 186, 260)).resize((464, 256), Image.Resampling.LANCZOS)
        waist = static.crop((70, 246, 186, 292)).resize((464, 184), Image.Resampling.LANCZOS)
        cells.extend(((f"{dress.label} · neckline", neckline), (f"{dress.label} · atomic waist seam", waist)))
    # These cropped detail panels are intentionally not kept on the 256x384
    # canvas, so save directly instead of the generic full-body card helper.
    card_height = 306
    width, height = 988, max(1, len(cells) // 2) * (card_height + 14) + 14
    image = Image.new("RGBA", (width, height), PINK)
    draw = ImageDraw.Draw(image)
    for index in range(0, len(cells), 2):
        row = index // 2
        for column, (label, preview) in enumerate(cells[index:index + 2]):
            x, y = 18 + column * 486, 14 + row * (card_height + 14)
            draw.rounded_rectangle((x, y, x + 468, y + card_height), radius=18, fill="#fffafd", outline="#ead9e6", width=3)
            image.alpha_composite(preview, (x + 2, y + 42))
            draw.text((x + 16, y + 14), label, fill="#463744", font=font(15, bold=True))
    save(image, QA / "dress-fit-zone-closeups.png")


def render_qa(
    dresses: Iterable[Dress],
    rendered: dict[str, dict[str, tuple[Image.Image, Image.Image]]],
) -> None:
    selected = tuple(dresses)
    suffix = "" if len(selected) == len(DRESSES) else f"-{selected[0].slug}"
    static_cells = [(dress.label, composite(dress, "static", rendered[dress.slug])) for dress in selected]
    qa_sheet("Female Dress Capsule · static fit gate", static_cells, QA / f"dress-static-fit-contact-sheet{suffix}.png", min(4, len(selected)))

    motion_cells: list[tuple[str, Image.Image]] = []
    for dress in selected:
        for pose, label in (
            ("static", "Static"),
            ("walking_front_f01", "Walk 01"),
            ("walking_front_f02", "Walk 02"),
            ("walking_front_f03", "Walk 03"),
            ("walking_front_f04", "Walk 04"),
            ("sitting_front_f01", "Sit"),
        ):
            motion_cells.append((f"{dress.label} · {label}", composite(dress, pose, rendered[dress.slug])))
    qa_sheet("Female Dress Capsule · 4W+1S rig review", motion_cells, QA / f"dress-motion-contact-sheet{suffix}.png", 6)
    closeup_sheet(selected, rendered)


def render_dress(dress: Dress) -> dict[str, tuple[Image.Image, Image.Image]]:
    layers = render_layers(dress)
    static_top, static_bottom = layers["static"]
    save(static_top, static_path("top", dress))
    save(static_bottom, static_path("bottom", dress))
    save(profile(static_top), LAYERS / f"avatar_top_{dress.slug}.png")
    save(profile(static_bottom), LAYERS / f"avatar_bottom_{dress.slug}.png")
    save(thumbnail(dress, static_top, static_bottom), THUMBNAILS / f"avatar_v2_top_{dress.slug}.png")
    for pose, (top, bottom) in layers.items():
        if pose == "static":
            continue
        save(top, motion_path("top", dress, pose))
        save(bottom, motion_path("bottom", dress, pose))
    return layers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", choices=[dress.slug for dress in DRESSES])
    parser.add_argument("--qa-only", action="store_true")
    args = parser.parse_args()

    selected = tuple(dress for dress in DRESSES if not args.slug or dress.slug == args.slug)
    rendered: dict[str, dict[str, tuple[Image.Image, Image.Image]]] = {}
    for dress in selected:
        rendered[dress.slug] = render_layers(dress) if args.qa_only else render_dress(dress)
    if not args.slug and not args.qa_only:
        write_manifest()
    if args.slug:
        # A single-item static gate is useful before expanding the capsule.
        render_qa(selected, rendered)
    elif len(rendered) == len(DRESSES):
        render_qa(selected, rendered)


if __name__ == "__main__":
    main()
