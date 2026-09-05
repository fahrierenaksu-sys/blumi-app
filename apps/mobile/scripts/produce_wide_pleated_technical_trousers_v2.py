#!/usr/bin/env python3
"""Stage premium wide pleated technical trousers on the canonical male rig.

The ImageGen source is immutable art. Deterministic work is restricted to key
extraction, a hash-locked item-specific registration, despill, one
premultiplied-alpha downsample and candidate-only evidence rendering. Runtime
assets are never written.
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
)


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANDIDATE = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/bottom/wide_pleated_technical_trousers"
)
RIG = CANDIDATE / "rig"
EVIDENCE = CANDIDATE / "static-review-v1"

SOURCE = RIG / "generated-premium-local-v11.png"
GUIDE = RIG / "localized-guide-v2.png"
REGISTERED_MASTER = RIG / "registered-premium-v11.png"
FOREGROUND_MASTER = RIG / "garment-master-clean-premium-v11.png"
STATIC_LAYER = RIG / "static-review-premium-v11.png"
COMPOSITE = RIG / "composite-review-premium-v11.png"
APPROVAL_CHECKER = EVIDENCE / "wide-pleated-technical-v2-checker.png"
APPROVAL_BLACK = EVIDENCE / "wide-pleated-technical-v2-black.png"
MANIFEST = EVIDENCE / "wide-pleated-technical-v2-manifest.json"

RUNTIME_ASSET = (
    ROOM / "avatar_room_bottom_male_wide_pleated_technical_trousers_v1.png"
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

SOURCE_SHA256 = "45244ed491dd4ba83818034e5bc57fc92c71fdd95c673085d7c7e7a988491b7b"
GUIDE_SHA256 = "35209dface0d35860649fd2f115609827ae07a6c89300f21550e67a2f30844e4"
APPROVED_SHOE_SHA256 = (
    "94dc80eb8491175d49411a1a60abe0da66f67baf1a66863f45cc7b044e5eb0ee"
)
REGISTERED_PIXEL_SHA256 = (
    "0349c26e7bc4fe9d989a777f399efa29fd2a5d9e0e2644166fbd76b44f495e9c"
)

CANVAS = (256, 384)
MASTER_CANVAS = (1024, 1536)
GUIDE_SIZE = (1024, 1024)
GUIDE_KEYED_BBOX = (43, 0, 981, 928)
SOURCE_ENVELOPE = (180, 220, 1081, 1161)
SOURCE_GARMENT_BBOX = (254, 225, 1001, 1161)
CANONICAL_GARMENT_BOX = (384, 1136, 640, 1344)


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
    shoes, _ = _load_hash_bound(APPROVED_SHOES, APPROVED_SHOE_SHA256)
    if source.size != (1254, 1254):
        raise ValueError("reviewed ImageGen source must remain 1254x1254")
    if guide.size != GUIDE_SIZE or keyed_bbox(guide) != GUIDE_KEYED_BBOX:
        raise ValueError("localized canonical guide geometry drifted")
    if shoes.size != CANVAS:
        raise ValueError("approved shoes must use the canonical canvas")


def _despill_key_colors(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    alpha = pixels[..., 3]
    red = pixels[..., 0].astype(np.int16)
    green = pixels[..., 1].astype(np.int16)
    blue = pixels[..., 2].astype(np.int16)
    key_fringe = (
        (green >= red + 20) & (green >= blue + 20)
    ) | (
        (np.minimum(red, blue) >= green + 20)
        & (red >= 90)
        & (blue >= 90)
    )
    luminance = np.clip(
        red * 0.27 + green * 0.62 + blue * 0.11,
        0,
        255,
    ).astype(np.uint8)
    pixels[..., 0][key_fringe] = luminance[key_fringe]
    pixels[..., 1][key_fringe] = luminance[key_fringe]
    pixels[..., 2][key_fringe] = np.minimum(
        255,
        luminance[key_fringe].astype(np.int16) + 4,
    ).astype(np.uint8)
    pixels[alpha == 0, :3] = 0
    return Image.fromarray(pixels)


def build_foreground_master(
    source: Image.Image | None = None,
) -> Image.Image:
    if source is None:
        source, _ = _load_hash_bound(SOURCE, SOURCE_SHA256)
    foreground = extract_keyed_foreground(source)
    pixels = np.asarray(foreground).copy()
    y_coordinates, x_coordinates = np.indices(
        (foreground.height, foreground.width)
    )
    left, top, right, bottom = SOURCE_ENVELOPE
    outside = (
        (x_coordinates < left)
        | (x_coordinates >= right)
        | (y_coordinates < top)
        | (y_coordinates >= bottom)
    )
    pixels[outside] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    isolated = cleanup_alpha_components(
        Image.fromarray(pixels),
        min_pixel_count=80,
    )
    isolated = _despill_key_colors(isolated)
    if isolated.getchannel("A").getbbox() != SOURCE_GARMENT_BBOX:
        raise ValueError("reviewed source garment envelope drifted")
    return isolated


def build_registered_master(
    foreground: Image.Image | None = None,
) -> Image.Image:
    source = foreground if foreground is not None else build_foreground_master()
    garment = source.crop(SOURCE_GARMENT_BBOX)
    target_width = CANONICAL_GARMENT_BOX[2] - CANONICAL_GARMENT_BOX[0]
    target_height = CANONICAL_GARMENT_BOX[3] - CANONICAL_GARMENT_BOX[1]
    registered = Image.new("RGBA", MASTER_CANVAS, (0, 0, 0, 0))
    registered.alpha_composite(
        garment.convert("RGBa")
        .resize((target_width, target_height), Image.Resampling.LANCZOS)
        .convert("RGBA"),
        (CANONICAL_GARMENT_BOX[0], CANONICAL_GARMENT_BOX[1]),
    )
    registered = _despill_key_colors(registered)
    pixel_hash = hashlib.sha256(registered.tobytes()).hexdigest()
    if pixel_hash != REGISTERED_PIXEL_SHA256:
        raise ValueError(f"canonical registered pixel drift: {pixel_hash}")
    return registered


def build_static_layer(master: Image.Image | None = None) -> Image.Image:
    registered = master if master is not None else build_registered_master()
    return _despill_key_colors(
        registered.convert("RGBa")
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
    title: str = "WIDE PLEATED TECHNICAL V2 / STATIC REVIEW",
) -> Image.Image:
    board = _background((2200, 1400), black=black)
    draw = ImageDraw.Draw(board)
    text = (246, 239, 244, 255) if black else (57, 42, 51, 255)
    muted = (190, 181, 188, 255) if black else (112, 91, 104, 255)
    draw.text(
        (52, 34),
        title,
        font=_font(22),
        fill=text,
    )
    draw.text(
        (52, 68),
        "relaxed-wide / canonical male base / approved Milk Tea v7 shoe",
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
        ("ISOLATED GARMENT 7X", layer, (88, 276, 168, 340), 7, (858, 150)),
        ("WAIST / TEE CONTACT 8X", composite, (88, 278, 168, 306), 8, (1488, 150)),
        ("PLEATS / TWO-LEG V 9X", composite, (94, 288, 162, 326), 9, (858, 806)),
        ("WIDE HEM / SHOE 9X", composite, (88, 316, 168, 352), 9, (1488, 806)),
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
    shoes, shoe_hash = _load_hash_bound(APPROVED_SHOES, APPROVED_SHOE_SHA256)
    base, base_hash = _load_snapshot(BASE)
    face, face_hash = _load_snapshot(FACE)
    top, top_hash = _load_snapshot(TOP)
    hair, hair_hash = _load_snapshot(HAIR)

    foreground = build_foreground_master(source)
    registered = build_registered_master(foreground)
    layer = build_static_layer(registered)
    composite = compose(
        layer,
        base=base,
        face=face,
        shoes=shoes,
        top=top,
        hair=hair,
    )

    _save(registered, REGISTERED_MASTER)
    _save(foreground, FOREGROUND_MASTER)
    _save(layer, STATIC_LAYER)
    _save(composite, COMPOSITE)
    _save(render_approval_board(layer, composite, black=False), APPROVAL_CHECKER)
    _save(render_approval_board(layer, composite, black=True), APPROVAL_BLACK)

    room_after = tree_sha256(ROOM)
    if room_before != room_after:
        raise RuntimeError("candidate render changed the runtime room tree")
    manifest = {
        "schemaVersion": 1,
        "itemId": "wide_pleated_technical_trousers",
        "family": "male_relaxed_wide",
        "status": "independent_review_pending",
        "candidateOnly": True,
        "runtimePromoted": False,
        "producerVerdict": "PASS",
        "independentReview": {
            "visual": "PENDING",
            "codeProvenance": "PENDING",
            "scope": "static-premium-v8",
        },
        "generation": {
            "tool": "built-in image_gen",
            "sourceVersion": "premium-local-v11",
            "intent": "item-specific canonical relaxed-wide registration",
            "canonicalGarmentBox": list(CANONICAL_GARMENT_BOX),
            "forbiddenDefects": [
                "culotte or skirt mass",
                "delayed artificial leg division",
                "long rectangular crotch slot",
                "sudden hip shelf",
                "shoe-covering hem flap",
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
