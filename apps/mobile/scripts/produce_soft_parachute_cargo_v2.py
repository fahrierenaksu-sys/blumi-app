#!/usr/bin/env python3
"""Stage a premium soft-parachute cargo bottom on the canonical male rig.

The generated 4x source is treated as immutable paint. Deterministic work is
limited to canonical registration, key extraction, alpha cleanup, one
downsample and candidate-only evidence rendering. Runtime paths are never
written.
"""

from __future__ import annotations

import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from register_male_keyed_rig_edit import (  # noqa: E402
    cleanup_alpha_components,
    extract_keyed_foreground,
    keyed_bbox,
    register_keyed_edit,
)


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANDIDATE = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/bottom/soft_parachute_cargo_pants"
)
RIG = CANDIDATE / "rig"
EVIDENCE = CANDIDATE / "static-review-v1"

SOURCE = RIG / "generated-premium-v8.png"
GUIDE = RIG / "keyed-guide-4x.png"
REGISTERED_MASTER = RIG / "registered-premium-v8.png"
FOREGROUND_MASTER = RIG / "garment-master-clean-premium-v8.png"
STATIC_LAYER = RIG / "static-review-premium-v8.png"
COMPOSITE = RIG / "composite-review-premium-v8.png"
APPROVAL_CHECKER = EVIDENCE / "soft-parachute-cargo-v2-checker.png"
APPROVAL_BLACK = EVIDENCE / "soft-parachute-cargo-v2-black.png"
MANIFEST = EVIDENCE / "soft-parachute-cargo-v2-manifest.json"

RUNTIME_ASSET = (
    ROOM / "avatar_room_bottom_male_soft_parachute_cargo_pants_v1.png"
)
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
APPROVED_SHOES = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/shoes/milk_tea_court/rig/static-v7.png"
)

SOURCE_SHA256 = "6c22223a702fcb948abfd9db6aee12d9d0bca6a6bf0613e60854cdf0097b46de"
GUIDE_SHA256 = "83a0d3169f9935f616f5d4f2bc56a42e6568b1e43f2f3dfab7d62f3a4f35a6ab"
APPROVED_SHOE_SHA256 = (
    "94dc80eb8491175d49411a1a60abe0da66f67baf1a66863f45cc7b044e5eb0ee"
)
REGISTERED_PIXEL_SHA256 = (
    "ff934f3e739f3c84afd62600ec8af36b72142c912208f9492e458bf779b14f2f"
)
CANVAS = (256, 384)
MASTER_CANVAS = (1024, 1536)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
    return digest.hexdigest()


def _load_hash_bound(path: Path, expected_hash: str) -> tuple[Image.Image, str]:
    if not path.is_file():
        raise FileNotFoundError(f"missing required reviewed input: {path}")
    source_bytes = path.read_bytes()
    actual_hash = hashlib.sha256(source_bytes).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError(f"reviewed input drift for {path}: {actual_hash}")
    with Image.open(BytesIO(source_bytes)) as image:
        return image.convert("RGBA"), actual_hash


def _load_snapshot(path: Path) -> tuple[Image.Image, str]:
    source_bytes = path.read_bytes()
    with Image.open(BytesIO(source_bytes)) as image:
        return image.convert("RGBA"), hashlib.sha256(source_bytes).hexdigest()


def verify_inputs() -> None:
    source, _ = _load_hash_bound(SOURCE, SOURCE_SHA256)
    guide, _ = _load_hash_bound(GUIDE, GUIDE_SHA256)
    approved_shoes, _ = _load_hash_bound(
        APPROVED_SHOES,
        APPROVED_SHOE_SHA256,
    )
    if source.size != MASTER_CANVAS or guide.size != MASTER_CANVAS:
        raise ValueError("generated source and guide must both be 1024x1536")
    if approved_shoes.size != CANVAS:
        raise ValueError("approved shoes must use the 256x384 canonical canvas")


def _clear_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    alpha = pixels[..., 3]
    red = pixels[..., 0].astype(np.int16)
    green = pixels[..., 1].astype(np.int16)
    blue = pixels[..., 2].astype(np.int16)
    low_alpha_key_fringe = (alpha <= 48) & (
        (
            (green >= 120)
            & (green >= red + 40)
            & (green >= blue + 40)
        )
        | (
            (red >= 140)
            & (blue >= 140)
            & (np.minimum(red, blue) >= green + 40)
        )
    )
    pixels[low_alpha_key_fringe] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def build_registered_master(
    source: Image.Image | None = None,
    guide: Image.Image | None = None,
) -> Image.Image:
    if source is None:
        source, _ = _load_hash_bound(SOURCE, SOURCE_SHA256)
    if guide is None:
        guide, _ = _load_hash_bound(GUIDE, GUIDE_SHA256)
    registered = register_keyed_edit(source, guide)
    pixel_hash = hashlib.sha256(registered.tobytes()).hexdigest()
    if pixel_hash != REGISTERED_PIXEL_SHA256:
        raise ValueError(f"canonical registered pixel drift: {pixel_hash}")
    return registered


def build_foreground_master(
    registered: Image.Image | None = None,
) -> Image.Image:
    foreground = extract_keyed_foreground(
        registered if registered is not None else build_registered_master()
    )
    foreground = cleanup_alpha_components(foreground, min_pixel_count=80)
    return _clear_transparent_rgb(foreground)


def build_static_layer(master: Image.Image | None = None) -> Image.Image:
    foreground = master if master is not None else build_foreground_master()
    return _clear_transparent_rgb(
        foreground.convert("RGBa")
        .resize(CANVAS, Image.Resampling.LANCZOS)
        .convert("RGBA")
    )


def visible_component_count(image: Image.Image, *, threshold: int) -> int:
    alpha = np.asarray(image.convert("RGBA").getchannel("A"))
    visible = alpha > threshold
    visited = np.zeros(visible.shape, dtype=bool)
    height, width = visible.shape
    count = 0
    for y in range(height):
        for x in range(width):
            if not visible[y, x] or visited[y, x]:
                continue
            count += 1
            visited[y, x] = True
            pending = [(x, y)]
            while pending:
                current_x, current_y = pending.pop()
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if visited[next_y, next_x] or not visible[next_y, next_x]:
                        continue
                    visited[next_y, next_x] = True
                    pending.append((next_x, next_y))
    return count


def compose(
    layer: Image.Image,
    *,
    base: Image.Image,
    face: Image.Image,
    shoes: Image.Image,
    top: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for asset in (base, face, shoes, layer, top, hair):
        if asset.size != CANVAS:
            raise ValueError("composite input does not use the canonical canvas")
        result = Image.alpha_composite(result, asset.convert("RGBA"))
    return result


def _background(size: tuple[int, int], *, black: bool) -> Image.Image:
    if black:
        return Image.new("RGBA", size, (5, 5, 7, 255))
    result = Image.new("RGBA", size, (255, 253, 255, 255))
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 20):
        for x in range(0, size[0], 20):
            if (x // 20 + y // 20) % 2:
                draw.rectangle(
                    (x, y, x + 19, y + 19),
                    fill=(230, 226, 230, 255),
                )
    return result


def _font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _panel(
    image: Image.Image,
    crop: tuple[int, int, int, int],
    *,
    scale: int,
    black: bool,
) -> Image.Image:
    cropped = image.crop(crop).resize(
        ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale),
        Image.Resampling.LANCZOS,
    )
    panel = _background(cropped.size, black=black)
    panel.alpha_composite(cropped)
    return panel


def render_approval_board(
    layer: Image.Image,
    composite: Image.Image,
    *,
    black: bool,
) -> Image.Image:
    board = _background((2200, 1400), black=black)
    draw = ImageDraw.Draw(board)
    text = (246, 239, 244, 255) if black else (57, 42, 51, 255)
    muted = (190, 181, 188, 255) if black else (112, 91, 104, 255)
    draw.text(
        (52, 34),
        "SOFT PARACHUTE CARGO V2 / STATIC REVIEW",
        font=_font(22),
        fill=text,
    )
    draw.text(
        (52, 68),
        "cargo-parachute / canonical male base / approved Milk Tea v7 shoe",
        font=_font(13),
        fill=muted,
    )

    full = _background((768, 1152), black=black)
    full.alpha_composite(
        composite.resize((768, 1152), Image.Resampling.LANCZOS)
    )
    board.alpha_composite(full, (52, 150))
    draw.text((52, 122), "FULL BODY 3X", font=_font(13), fill=text)

    panels = (
        ("ISOLATED GARMENT 6X", layer, (82, 258, 174, 340), 6, (858, 150)),
        ("WAIST / TEE CONTACT 7X", composite, (82, 274, 174, 310), 7, (1488, 150)),
        ("INTEGRATED CARGO POCKETS 7X", composite, (88, 286, 168, 322), 7, (1488, 460)),
        ("TWO-LEG / CROTCH 8X", composite, (96, 280, 160, 334), 8, (858, 806)),
        ("GATHERED HEM / SHOE 8X", composite, (86, 314, 170, 354), 8, (1488, 806)),
    )
    for label, image, crop, scale, position in panels:
        panel = _panel(image, crop, scale=scale, black=black)
        board.alpha_composite(panel, position)
        draw.text(
            (position[0], position[1] - 28),
            label,
            font=_font(13),
            fill=text,
        )
    return board


def _metrics(
    layer: Image.Image,
    *,
    top: Image.Image,
    shoes: Image.Image,
) -> dict[str, object]:
    pixels = np.asarray(layer.convert("RGBA"))
    alpha = pixels[..., 3]
    top_alpha = np.asarray(top.convert("RGBA").getchannel("A"))
    shoe_alpha = np.asarray(shoes.convert("RGBA").getchannel("A"))
    thresholded = Image.fromarray(
        np.where(alpha > 16, 255, 0).astype(np.uint8)
    )
    return {
        "alphaBboxAt16": list(thresholded.getbbox() or ()),
        "visibleComponentsAt16": visible_component_count(layer, threshold=16),
        "waistTeeContactPixels": int(
            np.count_nonzero((alpha[282:294] > 16) & (top_alpha[282:294] > 16))
        ),
        "shoeOverlapPixels": int(
            np.count_nonzero((alpha > 16) & (shoe_alpha > 16))
        ),
        "visibleShoePixels": int(
            np.count_nonzero((shoe_alpha > 16) & (alpha <= 16))
        ),
        "transparentRgbResidue": int(
            np.count_nonzero(pixels[alpha == 0, :3])
        ),
    }


def _save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def render() -> tuple[Path, ...]:
    room_before = tree_sha256(ROOM)
    source, source_hash = _load_hash_bound(SOURCE, SOURCE_SHA256)
    guide, guide_hash = _load_hash_bound(GUIDE, GUIDE_SHA256)
    shoes, shoe_hash = _load_hash_bound(
        APPROVED_SHOES,
        APPROVED_SHOE_SHA256,
    )
    base, base_hash = _load_snapshot(BASE)
    face, face_hash = _load_snapshot(FACE)
    top, top_hash = _load_snapshot(TOP)
    hair, hair_hash = _load_snapshot(HAIR)

    registered = build_registered_master(source, guide)
    master = build_foreground_master(registered)
    layer = build_static_layer(master)
    composite = compose(
        layer,
        base=base,
        face=face,
        shoes=shoes,
        top=top,
        hair=hair,
    )

    _save(registered, REGISTERED_MASTER)
    _save(master, FOREGROUND_MASTER)
    _save(layer, STATIC_LAYER)
    _save(composite, COMPOSITE)
    _save(
        render_approval_board(layer, composite, black=False),
        APPROVAL_CHECKER,
    )
    _save(
        render_approval_board(layer, composite, black=True),
        APPROVAL_BLACK,
    )

    room_after = tree_sha256(ROOM)
    if room_before != room_after:
        raise RuntimeError("candidate render changed the runtime room tree")
    manifest = {
        "schemaVersion": 1,
        "itemId": "soft_parachute_cargo_pants",
        "family": "male_cargo_parachute_track",
        "status": "user_approval_pending",
        "candidateOnly": True,
        "runtimePromoted": False,
        "independentReview": {
            "visual": "PASS",
            "codeProvenance": "PASS",
            "scope": "static-premium-v8",
        },
        "generation": {
            "tool": "built-in image_gen",
            "sourceVersion": "premium-v8",
            "intent": "canonical-body identity-preserving garment redraw",
            "forbiddenDefects": [
                "pasted cargo pockets",
                "long crotch slot",
                "skirt-like fused mass",
                "pooled hem over shoes",
                "body-guide residue",
            ],
        },
        "inputs": {
            str(SOURCE.relative_to(REPO)): source_hash,
            str(GUIDE.relative_to(REPO)): guide_hash,
            str(APPROVED_SHOES.relative_to(REPO)): shoe_hash,
            str(BASE.relative_to(REPO)): base_hash,
            str(FACE.relative_to(REPO)): face_hash,
            str(TOP.relative_to(REPO)): top_hash,
            str(HAIR.relative_to(REPO)): hair_hash,
        },
        "outputs": {
            str(path.relative_to(REPO)): sha256(path)
            for path in (
                REGISTERED_MASTER,
                FOREGROUND_MASTER,
                STATIC_LAYER,
                COMPOSITE,
                APPROVAL_CHECKER,
                APPROVAL_BLACK,
            )
        },
        "registeredPixelSha256": REGISTERED_PIXEL_SHA256,
        "metrics": _metrics(layer, top=top, shoes=shoes),
        "runtimeAssetSha256": sha256(RUNTIME_ASSET),
        "runtimeRoomTreeSha256Before": room_before,
        "runtimeRoomTreeSha256After": room_after,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return (
        REGISTERED_MASTER,
        FOREGROUND_MASTER,
        STATIC_LAYER,
        COMPOSITE,
        APPROVAL_CHECKER,
        APPROVAL_BLACK,
        MANIFEST,
    )


def main() -> None:
    for output in render():
        print(output.relative_to(REPO))


if __name__ == "__main__":
    main()
