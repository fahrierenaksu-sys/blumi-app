#!/usr/bin/env python3
"""Produce two fit-first replacement tops for the current 64-item male set."""

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

SWEATSHIRT_FIT = REDESIGN / "candidates/top/acid_washed_boxy_sweatshirt/rig/static-review-baseline-v3.png"
WORKSHIRT_FIT = REDESIGN / "candidates/top/soft_sage_linen_shirt/rig/static-review-baseline-v3.png"
HOOD_MASTER = REDESIGN / "candidates/top/fog_blue_relaxed_hoodie/rig/imagegen-hood-alpha-master-v1.png"

HOODIE_OUTPUT = REDESIGN / "candidates/top/fog_blue_relaxed_hoodie/rig/static-review-fit-first-v1.png"
WORKSHIRT_OUTPUT = REDESIGN / "candidates/top/indigo_denim_relaxed_workshirt/rig/static-review-fit-first-v1.png"
REVIEW_BOARD = REDESIGN / "male-replacement-tops-v1-review-board.png"
MANIFEST = REDESIGN / "male-replacement-tops-v1-manifest.json"


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS and path != HOOD_MASTER:
        raise ValueError(f"{path}: expected {CANVAS}, received {image.size}")
    return _clean(image)


def _recolor(image: Image.Image, shadow: tuple[int, int, int], light: tuple[int, int, int]) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    rgb = pixels[..., :3].astype(np.float32)
    raw_luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    blurred = np.asarray(
        Image.fromarray(raw_luminance.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2)),
        dtype=np.float32,
    )
    luminance = (0.28 * raw_luminance + 0.72 * blurred) / 255.0
    luminance = np.clip((luminance - 0.08) / 0.84, 0.0, 1.0)[..., None]
    low = np.array(shadow, dtype=np.float32)
    high = np.array(light, dtype=np.float32)
    recolored = low + (high - low) * luminance
    pixels[..., :3] = np.clip(recolored, 0, 255).astype(np.uint8)
    return _clean(Image.fromarray(pixels))


def _hood_layer() -> Image.Image:
    master = _load(HOOD_MASTER)
    bbox = master.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("hood master has no alpha")
    center_x = (bbox[0] + bbox[2]) // 2
    crop = master.crop((center_x - 170, bbox[1], center_x + 170, bbox[1] + 105))
    fitted = crop.resize((82, 25), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(fitted, (87, 210))
    return _clean(output)


def _draw_hoodie_details(image: Image.Image) -> Image.Image:
    scale = 4
    master = image.resize((CANVAS[0] * scale, CANVAS[1] * scale), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", master.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    pocket = [(108, 269), (113, 261), (143, 261), (148, 269)]
    points = [(x * scale, y * scale) for x, y in pocket]
    draw.line(points, fill=(37, 58, 75, 92), width=scale, joint="curve")
    draw.line([(128 * scale, 218 * scale), (128 * scale, 232 * scale)], fill=(218, 229, 236, 72), width=scale)
    master = Image.alpha_composite(master, overlay)
    return _clean(master.resize(CANVAS, Image.Resampling.LANCZOS))


def build_hoodie() -> Image.Image:
    hood = _hood_layer()
    body = _recolor(_load(SWEATSHIRT_FIT), (45, 65, 84), (174, 198, 214))
    output = Image.alpha_composite(hood, body)
    return _draw_hoodie_details(output)


def _draw_workshirt_details(image: Image.Image) -> Image.Image:
    scale = 4
    master = image.resize((CANVAS[0] * scale, CANVAS[1] * scale), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", master.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    seam = (202, 216, 224, 72)
    shadow = (22, 41, 57, 92)
    for box in ((104, 243, 120, 256), (136, 243, 152, 256)):
        rect = tuple(value * scale for value in box)
        draw.rounded_rectangle(rect, radius=2 * scale, outline=shadow, width=scale)
        draw.line([(box[0] * scale, (box[1] + 2) * scale), (box[2] * scale, (box[1] + 2) * scale)], fill=seam, width=scale)
    for y in (244, 254, 264, 274, 284):
        draw.ellipse(((127 * scale), (y * scale), (129 * scale), ((y + 2) * scale)), fill=(184, 170, 145, 176))
    draw.line([(128 * scale, 233 * scale), (128 * scale, 291 * scale)], fill=seam, width=scale)
    master = Image.alpha_composite(master, overlay)
    return _clean(master.resize(CANVAS, Image.Resampling.LANCZOS))


def build_workshirt() -> Image.Image:
    body = _recolor(_load(WORKSHIRT_FIT), (28, 45, 62), (112, 142, 162))
    return _draw_workshirt_details(body)


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


def _panel(title: str, family: str, layer: Image.Image) -> Image.Image:
    panel = Image.new("RGBA", (520, 760), (255, 248, 251, 255))
    draw = ImageDraw.Draw(panel)
    draw.text((16, 14), title, fill=(48, 34, 44, 255))
    draw.text((16, 36), family, fill=(116, 74, 96, 255))
    checker = _checkerboard()
    checker.alpha_composite(_compose(layer))
    panel.alpha_composite(checker, (132, 64))
    raw = layer.crop((68, 198, 188, 310)).resize((360, 336), Image.Resampling.NEAREST)
    raw_bg = Image.new("RGBA", raw.size, (20, 20, 24, 255))
    raw_bg.alpha_composite(raw)
    panel.alpha_composite(raw_bg, (80, 414))
    return panel


def _save(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _clean(image).save(path, optimize=True)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def produce() -> dict:
    hoodie = build_hoodie()
    workshirt = build_workshirt()
    _save(HOODIE_OUTPUT, hoodie)
    _save(WORKSHIRT_OUTPUT, workshirt)

    board = Image.new("RGBA", (1040, 760), (244, 237, 242, 255))
    board.alpha_composite(_panel("fog_blue_relaxed_hoodie", "hoodie_or_sweat_closed_neck", hoodie), (0, 0))
    board.alpha_composite(_panel("indigo_denim_relaxed_workshirt", "shirt_open_camp_collar", workshirt), (520, 0))
    board.convert("RGB").save(REVIEW_BOARD, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_visual_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "explicitUserApproval": False,
        "items": [
            {"slug": "fog_blue_relaxed_hoodie", "category": "top", "family": "hoodie_or_sweat_closed_neck", "candidate": _relative(HOODIE_OUTPUT), "sha256": _sha256(HOODIE_OUTPUT)},
            {"slug": "indigo_denim_relaxed_workshirt", "category": "top", "family": "shirt_open_camp_collar", "candidate": _relative(WORKSHIRT_OUTPUT), "sha256": _sha256(WORKSHIRT_OUTPUT)},
        ],
        "reviewBoard": {"path": _relative(REVIEW_BOARD), "sha256": _sha256(REVIEW_BOARD)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
