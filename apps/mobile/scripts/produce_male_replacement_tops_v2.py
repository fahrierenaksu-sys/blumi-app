#!/usr/bin/env python3
"""Build fit-locked replacement tops from premium source art.

The generated masters supply material and garment detail only. Canonical accepted
male layers remain the authority for silhouette, anchors, waist, neck, and hands.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[3]
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
CANVAS = (256, 384)

BODY = REDESIGN / "candidates/canonical/body/rig/body-male-light-unified-v3.png"
HAIR = REDESIGN / "candidates/hair/espresso_crop/rig/hair-front-review-natural-v3.png"
BOTTOM = REDESIGN / "candidates/bottom/navy_straight_pants/rig/static-review-natural-v4.png"
SHOES = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room/avatar_room_shoes_male_milk_tea_court_v1.png"

ITEMS = (
    {
        "slug": "fog_blue_relaxed_hoodie",
        "family": "hoodie_or_sweat_closed_neck",
        "fit": REDESIGN / "candidates/top/acid_washed_boxy_sweatshirt/rig/static-review-baseline-v3.png",
        "source": REDESIGN / "candidates/top/fog_blue_relaxed_hoodie/rig/imagegen-source-v2.png",
        "source_background": "light",
        "shadow": (48, 59, 85),
        "light": (150, 167, 194),
    },
    {
        "slug": "indigo_denim_relaxed_workshirt",
        "family": "shirt_open_camp_collar",
        "fit": REDESIGN / "candidates/top/soft_sage_linen_shirt/rig/static-review-baseline-v3.png",
        "source": REDESIGN / "candidates/top/indigo_denim_relaxed_workshirt/rig/imagegen-source-v2.png",
        "source_background": "dark",
        "shadow": (25, 47, 73),
        "light": (84, 123, 157),
    },
    {
        "slug": "oatmeal_fine_gauge_crewneck",
        "family": "tshirt_closed_crew",
        "fit": REDESIGN / "candidates/top/cream_basic_tee/rig/static-review-neck-continuity-v2.png",
        "source": REDESIGN / "candidates/top/oatmeal_fine_gauge_crewneck/rig/imagegen-source-v1.png",
        "source_background": "dark",
        "shadow": (173, 142, 101),
        "light": (255, 238, 201),
    },
)

REVIEW_BOARD = REDESIGN / "male-replacement-tops-v2-review-board.png"
MANIFEST = REDESIGN / "male-replacement-tops-v2-manifest.json"


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path, expected: tuple[int, int] | None = CANVAS) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if expected is not None and image.size != expected:
        raise ValueError(f"{path}: expected {expected}, received {image.size}")
    return _clean(image)


def _recolor(
    image: Image.Image,
    shadow: tuple[int, int, int],
    light: tuple[int, int, int],
) -> Image.Image:
    pixels = np.asarray(image).copy()
    rgb = pixels[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    luminance = np.asarray(
        Image.fromarray(luminance.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)),
        dtype=np.float32,
    )
    value = np.clip((luminance - 18.0) / 210.0, 0.0, 1.0)[..., None]
    low = np.asarray(shadow, dtype=np.float32)
    high = np.asarray(light, dtype=np.float32)
    pixels[..., :3] = np.clip(low + (high - low) * value, 0, 255).astype(np.uint8)
    return _clean(Image.fromarray(pixels))


def _source_cutout(path: Path, background: str) -> Image.Image:
    source = _load(path, expected=None)
    pixels = np.asarray(source).copy()
    rgb = pixels[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    if background == "dark":
        alpha = np.clip((luminance - 3.0) * 18.0, 0.0, 255.0)
    elif background == "light":
        alpha = np.clip((224.0 - luminance) * 14.0, 0.0, 255.0)
    else:
        raise ValueError(f"unsupported source background: {background}")
    alpha_image = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
    pixels[..., 3] = np.asarray(alpha_image)
    cutout = _clean(Image.fromarray(pixels))
    bbox = cutout.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{path}: source extraction produced no garment")
    return cutout.crop(bbox)


def _repair_hoodie_contacts(image: Image.Image, fit_alpha: Image.Image) -> Image.Image:
    pixels = np.asarray(image).copy()
    body_alpha = np.asarray(_load(BODY).getchannel("A"))
    yy, xx = np.indices(body_alpha.shape)

    # The accepted oversized sweatshirt source covers the hands. A real cuff
    # ends above the wrist; it must not carve a U-shaped hole around the hand.
    sleeve_tail_mask = (yy >= 275) & ((xx < 106) | (xx > 150))
    pixels[sleeve_tail_mask] = 0

    # Remove the adult-sized source hood artwork and rebuild only the compact
    # front-facing hood seat that the canonical neck can physically pass through.
    authority = np.asarray(fit_alpha)
    for y in range(212, 240):
        blend = (y - 212) / 28.0
        color = np.array(
            [
                int(105 - 26 * blend),
                int(119 - 28 * blend),
                int(150 - 30 * blend),
            ],
            dtype=np.uint8,
        )
        row_mask = (authority[y] > 0) & (xx[y] >= 99) & (xx[y] <= 157)
        pixels[y, row_mask, :3] = color

    repaired = Image.fromarray(pixels)
    scale = 4
    large = repaired.resize((CANVAS[0] * scale, CANVAS[1] * scale), Image.Resampling.LANCZOS)

    opening = Image.new("L", large.size, 0)
    opening_draw = ImageDraw.Draw(opening)
    opening_draw.ellipse(
        (119 * scale, 207 * scale, 137 * scale, 226 * scale),
        fill=255,
    )
    large_alpha = large.getchannel("A")
    large_alpha = Image.fromarray(
        np.minimum(
            np.asarray(large_alpha),
            255 - np.asarray(opening),
        ).astype(np.uint8)
    )
    large.putalpha(large_alpha)

    detail = Image.new("RGBA", large.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(detail, "RGBA")
    outer = (48, 58, 82, 210)
    draw.line(
        [(102 * scale, 222 * scale), (113 * scale, 213 * scale),
         (120 * scale, 216 * scale)],
        fill=outer,
        width=2 * scale,
        joint="curve",
    )
    draw.line(
        [(136 * scale, 216 * scale), (143 * scale, 213 * scale),
         (154 * scale, 222 * scale)],
        fill=outer,
        width=2 * scale,
        joint="curve",
    )
    for x in (121, 135):
        draw.line(
            [(x * scale, 224 * scale), (x * scale, 239 * scale)],
            fill=(45, 54, 76, 220),
            width=scale,
        )
        draw.ellipse(
            ((x - 1) * scale, 238 * scale, (x + 1) * scale, 241 * scale),
            fill=(38, 46, 66, 235),
        )
    for left, right in ((82, 104), (152, 174)):
        draw.rounded_rectangle(
            (left * scale, 267 * scale, right * scale, 275 * scale),
            radius=3 * scale,
            fill=(50, 61, 85, 225),
            outline=(159, 172, 197, 120),
            width=scale,
        )
    large = Image.alpha_composite(large, detail)
    final = np.asarray(large.resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    final[..., 3] = np.minimum(final[..., 3], authority)
    final[sleeve_tail_mask] = 0
    return _clean(Image.fromarray(final))


def _repair_workshirt_opening(image: Image.Image, fit_alpha: Image.Image) -> Image.Image:
    """Remove the rear-collar wedge from the front-facing camp-collar opening."""
    scale = 4
    large = image.resize(
        (CANVAS[0] * scale, CANVAS[1] * scale),
        Image.Resampling.LANCZOS,
    )
    opening = Image.new("L", large.size, 0)
    draw = ImageDraw.Draw(opening)
    draw.polygon(
        [
            (121 * scale, 228 * scale),
            (128 * scale, 245 * scale),
            (135 * scale, 228 * scale),
        ],
        fill=255,
    )
    alpha = np.asarray(large.getchannel("A"), dtype=np.uint8)
    cutout = np.asarray(opening, dtype=np.uint8)
    large.putalpha(Image.fromarray(np.minimum(alpha, 255 - cutout)))
    final = np.asarray(large.resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    final[..., 3] = np.minimum(final[..., 3], np.asarray(fit_alpha))
    return _clean(Image.fromarray(final))


def _fit_material(item: dict) -> Image.Image:
    fit = _load(item["fit"])
    fit_alpha = fit.getchannel("A")
    bbox = fit_alpha.getbbox()
    if bbox is None:
        raise ValueError(f"{item['fit']}: empty fit authority")

    base = _recolor(fit, item["shadow"], item["light"])
    cutout = _source_cutout(item["source"], item["source_background"])
    material = cutout.resize((bbox[2] - bbox[0], bbox[3] - bbox[1]), Image.Resampling.LANCZOS)

    material_pixels = np.asarray(material).copy()
    authority = np.asarray(fit_alpha.crop(bbox), dtype=np.uint8)
    material_pixels[..., 3] = np.minimum(material_pixels[..., 3], authority)
    if item["slug"] == "fog_blue_relaxed_hoodie":
        material_pixels[:26, :, 3] = 0
    material = _clean(Image.fromarray(material_pixels))

    overlay = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    overlay.alpha_composite(material, (bbox[0], bbox[1]))
    output = Image.alpha_composite(base, overlay)

    # The accepted fit alpha is the final authority: no adult-width spill, hand
    # coverage, waist overrun, or detached material pixels can survive.
    output_pixels = np.asarray(output).copy()
    output_pixels[..., 3] = np.asarray(fit_alpha)
    fitted = _clean(Image.fromarray(output_pixels))
    if item["slug"] == "fog_blue_relaxed_hoodie":
        return _repair_hoodie_contacts(fitted, fit_alpha)
    if item["slug"] == "indigo_denim_relaxed_workshirt":
        return _repair_workshirt_opening(fitted, fit_alpha)
    return fitted


def _checkerboard() -> Image.Image:
    output = Image.new("RGBA", CANVAS, (250, 247, 249, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, CANVAS[1], 12):
        for x in range(0, CANVAS[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, x + 11, y + 11), fill=(229, 225, 229, 255))
    return output


def _compose(top: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (_load(BODY), _load(BOTTOM), _load(SHOES), top, _load(HAIR)):
        output = Image.alpha_composite(output, layer)
    return _clean(output)


def _panel(item: dict, layer: Image.Image) -> Image.Image:
    panel = Image.new("RGBA", (520, 760), (255, 248, 251, 255))
    draw = ImageDraw.Draw(panel)
    draw.text((16, 14), item["slug"], fill=(48, 34, 44, 255))
    draw.text((16, 36), item["family"], fill=(116, 74, 96, 255))
    checker = _checkerboard()
    checker.alpha_composite(_compose(layer))
    panel.alpha_composite(checker, (132, 64))
    closeup = _checkerboard().crop((68, 190, 188, 310)).resize((360, 360), Image.Resampling.NEAREST)
    garment = layer.crop((68, 190, 188, 310)).resize((360, 360), Image.Resampling.NEAREST)
    closeup.alpha_composite(garment)
    panel.alpha_composite(closeup, (80, 400))
    return panel


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def produce() -> dict:
    outputs: list[tuple[dict, Path, Image.Image]] = []
    for item in ITEMS:
        layer = _fit_material(item)
        output = REDESIGN / "candidates/top" / item["slug"] / "rig/static-review-fit-locked-v2.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        layer.save(output, optimize=True)
        outputs.append((item, output, layer))

    board = Image.new("RGBA", (520 * len(outputs), 760), (244, 237, 242, 255))
    for index, (item, _, layer) in enumerate(outputs):
        board.alpha_composite(_panel(item, layer), (520 * index, 0))
    board.convert("RGB").save(REVIEW_BOARD, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_visual_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "explicitUserApproval": False,
        "items": [
            {
                "slug": item["slug"],
                "category": "top",
                "family": item["family"],
                "candidate": _relative(output),
                "sha256": _sha256(output),
            }
            for item, output, _ in outputs
        ],
        "reviewBoard": {"path": _relative(REVIEW_BOARD), "sha256": _sha256(REVIEW_BOARD)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
