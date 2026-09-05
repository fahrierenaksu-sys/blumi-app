#!/usr/bin/env python3
"""Generate motion-fitted Blumi dress layers and QA sheets."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ASSET_DIR = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_DIR = ASSET_DIR / "motion"
DOC_DIR = ROOT / "docs/avatar-motion-pipeline"
QA_DIR = DOC_DIR / "dress-reference-set-qa"
CANVAS = (256, 384)


@dataclass(frozen=True)
class DressProfile:
    slug: str
    name: str
    bottom_sit_bbox: tuple[int, int, int, int]
    bottom_sit_mask: tuple[tuple[int, int], ...]
    bottom_walk_dx: tuple[int, int, int, int] = (0, -2, 1, 2)
    bottom_walk_dy: tuple[int, int, int, int] = (0, 1, 0, 1)
    bottom_walk_sx: tuple[float, float, float, float] = (1.0, 1.03, 0.99, 1.02)
    bottom_walk_sy: tuple[float, float, float, float] = (1.0, 1.0, 0.99, 1.0)


PROFILES = [
    DressProfile(
        slug="boho_patchwork_maxi_dress",
        name="Boho Patchwork Maxi",
        bottom_sit_bbox=(58, 274, 198, 344),
        bottom_sit_mask=((58, 296), (78, 276), (128, 268), (180, 276), (198, 296), (188, 338), (148, 346), (128, 336), (108, 346), (68, 338)),
        bottom_walk_dx=(0, -3, 1, 3),
        bottom_walk_dy=(0, 1, 0, 1),
        bottom_walk_sx=(1.0, 1.04, 0.99, 1.04),
    ),
    DressProfile(
        slug="embroidered_halter_wrap_dress",
        name="Embroidered Halter Wrap",
        bottom_sit_bbox=(62, 267, 194, 340),
        bottom_sit_mask=((64, 292), (90, 272), (128, 266), (168, 272), (194, 292), (184, 336), (146, 343), (128, 333), (110, 343), (72, 336)),
    ),
    DressProfile(
        slug="ruched_patchwork_mini_dress",
        name="Ruched Patchwork Mini",
        bottom_sit_bbox=(66, 267, 190, 330),
        bottom_sit_mask=((68, 292), (92, 272), (128, 266), (166, 272), (190, 292), (178, 326), (142, 334), (128, 323), (114, 334), (78, 326)),
    ),
    DressProfile(
        slug="white_lace_cami_mini_dress",
        name="White Lace Cami Mini",
        bottom_sit_bbox=(70, 267, 188, 328),
        bottom_sit_mask=((72, 290), (96, 272), (128, 266), (162, 272), (188, 290), (178, 324), (144, 331), (128, 322), (112, 331), (78, 324)),
    ),
]


def layer_path(kind: str, slug: str) -> Path:
    return ASSET_DIR / f"avatar_room_{kind}_female_{slug}_v2.png"


def thumbnail_path(slug: str) -> Path:
    return ASSET_DIR.parent / "shop-thumbnails" / f"avatar_v2_top_{slug}.png"


def motion_path(kind: str, slug: str, suffix: str) -> Path:
    return MOTION_DIR / f"room_avatar_{kind}_female_{slug}_v2_{suffix}.png"


def base_motion_path(suffix: str) -> Path:
    return MOTION_DIR / f"room_avatar_base_female_v2_{suffix}.png"


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode == "RGBA":
        red, green, blue, alpha = image.split()
        transparent = alpha.point(lambda value: 255 if value == 0 else 0)
        zero = Image.new("L", image.size, 0)
        image = Image.merge(
            "RGBA",
            (
                Image.composite(zero, red, transparent),
                Image.composite(zero, green, transparent),
                Image.composite(zero, blue, transparent),
                alpha,
            ),
        )
    image.save(path, optimize=True)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("blank layer")
    return bbox


def clear_above(image: Image.Image, y: int) -> Image.Image:
    out = image.copy()
    alpha = out.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    draw.rectangle((0, 0, CANVAS[0], y - 1), fill=0)
    out.putalpha(alpha)
    return out


def scale_about_bbox(
    image: Image.Image,
    dx: int,
    dy: int,
    sx: float,
    sy: float,
) -> Image.Image:
    if dx == 0 and dy == 0 and sx == 1.0 and sy == 1.0:
        return image.copy()

    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    width = max(1, round(crop.width * sx))
    height = max(1, round(crop.height * sy))
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    center_x = (bbox[0] + bbox[2]) / 2 + dx
    center_y = (bbox[1] + bbox[3]) / 2 + dy
    x = round(center_x - width / 2)
    y = round(center_y - height / 2)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(resized, (x, y))
    return out


def fit_to_bbox(image: Image.Image, target: tuple[int, int, int, int]) -> Image.Image:
    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    width = target[2] - target[0]
    height = target[3] - target[1]
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(resized, (target[0], target[1]))
    return out


def fit_boho_sitting_top(image: Image.Image) -> Image.Image:
    """Keep the complete bodice fixed while fitting the skirt/scarf to sitting."""
    bbox = alpha_bbox(image)
    split_y = 268
    upper = image.copy()
    upper_alpha = upper.getchannel("A")
    ImageDraw.Draw(upper_alpha).rectangle(
        (0, split_y, CANVAS[0], CANVAS[1]),
        fill=0,
    )
    upper.putalpha(upper_alpha)

    lower = image.crop((bbox[0], split_y, bbox[2], bbox[3]))
    fitted_lower = lower.resize((140, 78), Image.Resampling.LANCZOS)

    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(fitted_lower, (58, 268))
    out.alpha_composite(upper)
    return out


def build_walking_frames(kind: str, slug: str, profile: DressProfile) -> list[Image.Image]:
    source = load(layer_path(kind, slug))
    frames = []
    top_dx = (0, -1, 0, 1)
    top_dy = (0, 0, 0, 0)
    top_sx = (1.0, 0.99, 1.0, 0.99)
    top_sy = (1.0, 1.0, 1.0, 1.0)

    for index in range(4):
        if kind == "top":
            frame = scale_about_bbox(
                source,
                top_dx[index],
                top_dy[index],
                top_sx[index],
                top_sy[index],
            )
            if slug != "boho_patchwork_maxi_dress":
                frame = clear_above(frame, 206)
        else:
            frame = scale_about_bbox(
                source,
                profile.bottom_walk_dx[index],
                profile.bottom_walk_dy[index],
                profile.bottom_walk_sx[index],
                profile.bottom_walk_sy[index],
            )
        frames.append(frame)
    frames[0] = source.copy()
    return frames


def build_sitting_frame(kind: str, slug: str, profile: DressProfile) -> Image.Image:
    source = load(layer_path(kind, slug))
    if kind == "top":
        if slug == "boho_patchwork_maxi_dress":
            return fit_boho_sitting_top(source)
        return source.copy()
    fitted = fit_to_bbox(source, profile.bottom_sit_bbox)
    return apply_polygon_alpha(fitted, profile.bottom_sit_mask)


def apply_polygon_alpha(
    image: Image.Image,
    polygon: Iterable[tuple[int, int]],
) -> Image.Image:
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(tuple(polygon), fill=255)
    alpha = image.getchannel("A")
    clipped = Image.new("L", CANVAS, 0)
    clipped.paste(alpha, (0, 0), mask)
    out = image.copy()
    out.putalpha(clipped)
    return out


def build_shop_thumbnail(image: Image.Image) -> Image.Image:
    bbox = alpha_bbox(image)
    crop = image.crop(bbox)
    max_width = 184
    max_height = 164
    scale = min(max_width / crop.width, max_height / crop.height)
    size = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    resized = crop.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    y = round((220 - size[1]) / 2)
    y = max(22, y - 10)
    out.alpha_composite(resized, (round((220 - size[0]) / 2), y))
    return out


def generate_shop_thumbnails(profiles: list[DressProfile]) -> None:
    for profile in profiles:
        source = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        source.alpha_composite(load(layer_path("bottom", profile.slug)))
        source.alpha_composite(load(layer_path("top", profile.slug)))
        save(
            build_shop_thumbnail(source),
            thumbnail_path(profile.slug),
        )


def render_shop_thumbnail_qa(profiles: list[DressProfile]) -> None:
    cell_w, cell_h = (220, 260)
    sheet = Image.new("RGBA", (cell_w * len(profiles), cell_h), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)

    for index, profile in enumerate(profiles):
        x = index * cell_w
        draw.text((x + 8, 8), profile.name, fill=(73, 55, 67, 255))
        sheet.alpha_composite(load(thumbnail_path(profile.slug)), (x, 36))

    save(sheet.convert("RGB"), QA_DIR / "dress_reference_set_shop_thumbnail_contact_sheet.png")


def composite(
    base: Image.Image,
    top: Image.Image,
    bottom: Image.Image,
) -> Image.Image:
    out = Image.new("RGBA", CANVAS, (247, 237, 244, 255))
    out.alpha_composite(base)
    out.alpha_composite(bottom)
    out.alpha_composite(top)
    return out


def render_motion_qa(profiles: list[DressProfile]) -> None:
    columns = ["Static", "Walk f01", "Walk f02", "Walk f03", "Walk f04", "Sitting"]
    render_contact_sheet(
        profiles,
        columns,
        cell_size=(192, 248),
        preview_size=(128, 192),
        out_path=QA_DIR / "dress_reference_set_motion_fit_contact_sheet.png",
    )
    render_contact_sheet(
        profiles,
        columns,
        cell_size=(300, 430),
        preview_size=CANVAS,
        out_path=QA_DIR / "dress_reference_set_motion_fit_zoom_contact_sheet.png",
    )


def render_static_qa(profiles: list[DressProfile]) -> None:
    columns = [profile.name for profile in profiles]
    cell_w, cell_h = (300, 430)
    sheet = Image.new("RGBA", (cell_w * len(profiles), cell_h), (247, 237, 244, 255))
    draw = ImageDraw.Draw(sheet)
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")

    for index, profile in enumerate(profiles):
        preview = composite(
            base,
            load(layer_path("top", profile.slug)),
            load(layer_path("bottom", profile.slug)),
        )
        save(preview, QA_DIR / f"{profile.slug}_static_fit_qa.png")

        x = index * cell_w
        draw.text((x + 8, 8), columns[index], fill=(73, 55, 67, 255))
        sheet.alpha_composite(preview, (x + (cell_w - CANVAS[0]) // 2, 40))

    save(sheet.convert("RGB"), QA_DIR / "dress_reference_set_static_fit_contact_sheet.png")


def render_neckline_qa() -> None:
    base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
    targets = [
        ("boho_patchwork_maxi_dress", "Boho Patchwork Maxi"),
        ("embroidered_halter_wrap_dress", "Embroidered Halter Wrap"),
        ("ruched_patchwork_mini_dress", "Ruched Patchwork Mini"),
        ("white_lace_cami_mini_dress", "White Lace Cami Mini"),
    ]
    crop_box = (58, 168, 198, 250)
    preview_size = (560, 328)
    sheet = Image.new("RGBA", (preview_size[0] * 2, preview_size[1] * 2), (247, 237, 244, 255))

    for index, (slug, label) in enumerate(targets):
        preview = composite(
            base,
            load(layer_path("top", slug)),
            load(layer_path("bottom", slug)),
        )
        crop = preview.crop(crop_box).resize(preview_size, Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(crop)
        draw.text((8, 8), label, fill=(73, 55, 67, 255))
        sheet.alpha_composite(crop, ((index % 2) * preview_size[0], (index // 2) * preview_size[1]))

    save(sheet.convert("RGB"), QA_DIR / "dress_reference_set_neckline_refinement_contact_sheet.png")


def render_contact_sheet(
    profiles: list[DressProfile],
    columns: list[str],
    cell_size: tuple[int, int],
    preview_size: tuple[int, int],
    out_path: Path,
) -> None:
    cell_w, cell_h = cell_size
    sheet = Image.new(
        "RGBA",
        (cell_w * len(columns), cell_h * len(profiles)),
        (247, 237, 244, 255),
    )
    draw = ImageDraw.Draw(sheet)

    for row, profile in enumerate(profiles):
        y = row * cell_h
        draw.text((8, y + 8), profile.name, fill=(73, 55, 67, 255))
        top_static = load(layer_path("top", profile.slug))
        bottom_static = load(layer_path("bottom", profile.slug))
        static_base = load(ASSET_DIR / "avatar_room_base_female_v2.png")
        static_preview = composite(static_base, top_static, bottom_static)

        frames = [static_preview]
        for index in range(1, 5):
            suffix = f"walking_front_f0{index}"
            base = load(base_motion_path(suffix))
            top = load(motion_path("top", profile.slug, suffix))
            bottom = load(motion_path("bottom", profile.slug, suffix))
            frames.append(composite(base, top, bottom))
        sit_suffix = "sitting_front_f01"
        sit_base = load(base_motion_path(sit_suffix))
        sit_top = load(motion_path("top", profile.slug, sit_suffix))
        sit_bottom = load(motion_path("bottom", profile.slug, sit_suffix))
        frames.append(composite(sit_base, sit_top, sit_bottom))

        for col, preview in enumerate(frames):
            x = col * cell_w
            if row == 0:
                draw.text((x + 8, 30), columns[col], fill=(73, 55, 67, 255))
            resized = preview.resize(preview_size, Image.Resampling.NEAREST)
            sheet.alpha_composite(
                resized,
                (
                    x + max(0, (cell_w - preview_size[0]) // 2),
                    y + 46,
                ),
            )

    save(sheet.convert("RGB"), out_path)


def main() -> None:
    for profile in PROFILES:
        for kind in ("top", "bottom"):
            walking_frames = build_walking_frames(kind, profile.slug, profile)
            for index, frame in enumerate(walking_frames, start=1):
                save(frame, motion_path(kind, profile.slug, f"walking_front_f0{index}"))

            sitting_frame = build_sitting_frame(kind, profile.slug, profile)
            save(sitting_frame, motion_path(kind, profile.slug, "sitting_front_f01"))

    generate_shop_thumbnails(PROFILES)
    render_shop_thumbnail_qa(PROFILES)
    render_static_qa(PROFILES)
    render_neckline_qa()
    render_motion_qa(PROFILES)


if __name__ == "__main__":
    main()
