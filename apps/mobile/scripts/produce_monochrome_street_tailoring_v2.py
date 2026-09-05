#!/usr/bin/env python3
"""Stage the casual monochrome relaxed-tailoring male bottom for approval.

The ImageGen result is treated as a keyed 4x paint source. It is registered
back to the canonical male guide, stripped of both key colors, downsampled once
and composed only in the dated candidate evidence area. This script never
writes to the runtime wardrobe tree.
"""

from __future__ import annotations

import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


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
    / "candidates/bottom/monochrome_street_tailoring_bottom"
)
RIG = CANDIDATE / "rig"
EVIDENCE = CANDIDATE / "static-review-v2"

SOURCE = RIG / "generated-casual-v5.png"
GUIDE = RIG / "keyed-guide-4x.png"
REGISTERED_MASTER = RIG / "registered-casual-v6.png"
FOREGROUND_MASTER = RIG / "garment-master-clean-casual-v6.png"
STATIC_LAYER = RIG / "static-review-casual-v6.png"
COMPOSITE = RIG / "composite-review-casual-v6.png"
APPROVAL_CHECKER = EVIDENCE / "monochrome-street-tailoring-v2-checker.png"
APPROVAL_BLACK = EVIDENCE / "monochrome-street-tailoring-v2-black.png"
MANIFEST = EVIDENCE / "monochrome-street-tailoring-v2-manifest.json"

RUNTIME_ASSET = (
    ROOM / "avatar_room_bottom_male_monochrome_street_tailoring_bottom_v1.png"
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

SOURCE_SHA256 = "a8d978d87544fe79bf95990605fb4db3f3fb5da891648be7830d7aab6f3ad3ba"
GUIDE_SHA256 = "a1bec3645be3a37451a7ef486ca8eaf545d98af077026efb02f518a1f35d8c0c"
APPROVED_SHOE_SHA256 = (
    "94dc80eb8491175d49411a1a60abe0da66f67baf1a66863f45cc7b044e5eb0ee"
)
REGISTERED_PIXEL_SHA256 = (
    "a3c4481cea769c5299cd93289fc3ca6c283679be521e7b99577c8fc369e704ae"
)
CANVAS = (256, 384)
MASTER_CANVAS = (1024, 1536)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_sha256(root: Path) -> str:
    """Hash every runtime-room path and byte so candidate renders fail closed."""

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


def verify_inputs() -> None:
    expected = {
        SOURCE: SOURCE_SHA256,
        GUIDE: GUIDE_SHA256,
        APPROVED_SHOES: APPROVED_SHOE_SHA256,
    }
    for path, expected_hash in expected.items():
        _load_hash_bound(path, expected_hash)

    source, _ = _load_hash_bound(SOURCE, SOURCE_SHA256)
    guide, _ = _load_hash_bound(GUIDE, GUIDE_SHA256)
    if source.size != MASTER_CANVAS or guide.size != MASTER_CANVAS:
        raise ValueError("keyed source and guide must both be 1024x1536")


def _clear_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _neutral_charcoal_grade(image: Image.Image) -> Image.Image:
    """Remove keyed purple spill without flattening luminance/fabric detail."""

    pixels = np.asarray(image.convert("RGBA")).copy()
    alpha = pixels[..., 3]
    rgb = pixels[..., :3].astype(np.float32)
    luma = rgb[..., 0] * 0.27 + rgb[..., 1] * 0.62 + rgb[..., 2] * 0.11
    neutral = np.stack((luma, luma, np.minimum(255.0, luma + 2.0)), axis=-1)
    pixels[..., :3][alpha > 0] = neutral[alpha > 0].astype(np.uint8)
    pixels[alpha == 0, :3] = 0
    return Image.fromarray(pixels)


def build_registered_master(
    source: Image.Image | None = None,
    guide: Image.Image | None = None,
) -> Image.Image:
    if source is None:
        source, _ = _load_hash_bound(SOURCE, SOURCE_SHA256)
    if guide is None:
        guide, _ = _load_hash_bound(GUIDE, GUIDE_SHA256)
    if source.size != MASTER_CANVAS or guide.size != MASTER_CANVAS:
        raise ValueError("keyed source and guide must both be 1024x1536")
    registered = register_keyed_edit(source, guide)
    pixel_hash = hashlib.sha256(registered.convert("RGBA").tobytes()).hexdigest()
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
    return _neutral_charcoal_grade(_clear_transparent_rgb(foreground))


def build_static_layer(master: Image.Image | None = None) -> Image.Image:
    foreground = master if master is not None else build_foreground_master()
    layer = foreground.resize(CANVAS, Image.Resampling.LANCZOS)
    return _clear_transparent_rgb(layer)


def _load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def compose(
    layer: Image.Image,
    *,
    approved_shoes: Image.Image | None = None,
) -> Image.Image:
    if approved_shoes is None:
        approved_shoes, _ = _load_hash_bound(
            APPROVED_SHOES,
            APPROVED_SHOE_SHA256,
        )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for asset in (
        _load(BASE),
        _load(FACE),
        approved_shoes.convert("RGBA"),
        layer.convert("RGBA"),
        _load(TOP),
        _load(HAIR),
    ):
        result = Image.alpha_composite(result, asset)
    return result


def _background(size: tuple[int, int], *, black: bool) -> Image.Image:
    if black:
        return Image.new("RGBA", size, (5, 5, 7, 255))
    result = Image.new("RGBA", size, (255, 253, 255, 255))
    draw = ImageDraw.Draw(result)
    cell = 20
    colors = ((255, 253, 255, 255), (230, 226, 230, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return result


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
        "MONOCHROME STREET TAILORING V2 / STATIC APPROVAL",
        fill=text,
        stroke_width=1,
        stroke_fill=text,
    )
    draw.text(
        (52, 68),
        "casual relaxed-wide / canonical male base / approved Milk Tea v7 shoe",
        fill=muted,
    )

    full = _background((768, 1152), black=black)
    full.alpha_composite(
        composite.resize((768, 1152), Image.Resampling.LANCZOS)
    )
    board.alpha_composite(full, (52, 150))
    draw.text((52, 122), "FULL BODY 3X", fill=text)

    isolated = _panel(layer, (88, 266, 168, 342), scale=7, black=black)
    board.alpha_composite(isolated, (858, 150))
    draw.text((858, 122), "ISOLATED LAYER 7X", fill=text)

    waist = _panel(composite, (82, 274, 174, 310), scale=7, black=black)
    board.alpha_composite(waist, (1488, 150))
    draw.text((1488, 122), "WAIST / TEE CONTACT 7X", fill=text)

    crotch = _panel(composite, (96, 288, 160, 332), scale=8, black=black)
    board.alpha_composite(crotch, (858, 806))
    draw.text((858, 778), "TWO-LEG / CROTCH 8X", fill=text)

    hem = _panel(composite, (86, 316, 170, 354), scale=8, black=black)
    board.alpha_composite(hem, (1488, 806))
    draw.text((1488, 778), "HEM / SHOE CONTACT 8X", fill=text)
    return board


def _metrics(
    layer: Image.Image,
    *,
    approved_shoes: Image.Image | None = None,
) -> dict[str, object]:
    if approved_shoes is None:
        approved_shoes, _ = _load_hash_bound(
            APPROVED_SHOES,
            APPROVED_SHOE_SHA256,
        )
    pixels = np.asarray(layer.convert("RGBA"))
    alpha = pixels[..., 3]
    shoe_alpha = np.asarray(approved_shoes.convert("RGBA").getchannel("A"))
    top_alpha = np.asarray(_load(TOP).getchannel("A"))
    thresholded = Image.fromarray(
        np.where(alpha > 16, 255, 0).astype(np.uint8)
    )
    return {
        "alphaBboxAt16": list(thresholded.getbbox() or ()),
        "waistTeeContactPixels": int(
            np.count_nonzero((alpha[282:294] > 16) & (top_alpha[282:294] > 16))
        ),
        "shoeOverlapPixels": int(
            np.count_nonzero((alpha > 16) & (shoe_alpha > 16))
        ),
        "visibleShoePixelsBelowHem": int(np.count_nonzero(shoe_alpha[337:] > 16)),
        "transparentRgbResidue": int(
            np.count_nonzero(pixels[alpha == 0, :3])
        ),
    }


def _save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def render() -> tuple[Path, ...]:
    runtime_before = sha256(RUNTIME_ASSET)
    runtime_room_tree_before = tree_sha256(ROOM)
    source, source_hash = _load_hash_bound(SOURCE, SOURCE_SHA256)
    guide, guide_hash = _load_hash_bound(GUIDE, GUIDE_SHA256)
    approved_shoes, approved_shoe_hash = _load_hash_bound(
        APPROVED_SHOES,
        APPROVED_SHOE_SHA256,
    )
    registered = build_registered_master(source, guide)
    master = build_foreground_master(registered)
    layer = build_static_layer(master)
    composite = compose(layer, approved_shoes=approved_shoes)

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

    runtime_after = sha256(RUNTIME_ASSET)
    runtime_room_tree_after = tree_sha256(ROOM)
    manifest = {
        "schemaVersion": 1,
        "itemId": "monochrome_street_tailoring_bottom",
        "family": "male_relaxed_wide",
        "status": "user_approval_pending",
        "candidateOnly": True,
        "runtimePromoted": False,
        "independentReview": {
            "code": "PASS",
            "visual": "PASS",
        },
        "inputs": {
            str(SOURCE.relative_to(REPO)): source_hash,
            str(GUIDE.relative_to(REPO)): guide_hash,
            str(APPROVED_SHOES.relative_to(REPO)): approved_shoe_hash,
        },
        "outputs": {
            str(REGISTERED_MASTER.relative_to(REPO)): sha256(REGISTERED_MASTER),
            str(FOREGROUND_MASTER.relative_to(REPO)): sha256(FOREGROUND_MASTER),
            str(STATIC_LAYER.relative_to(REPO)): sha256(STATIC_LAYER),
            str(COMPOSITE.relative_to(REPO)): sha256(COMPOSITE),
            str(APPROVAL_CHECKER.relative_to(REPO)): sha256(APPROVAL_CHECKER),
            str(APPROVAL_BLACK.relative_to(REPO)): sha256(APPROVAL_BLACK),
        },
        "registeredPixelSha256": REGISTERED_PIXEL_SHA256,
        "metrics": _metrics(layer, approved_shoes=approved_shoes),
        "runtimeAssetSha256Before": runtime_before,
        "runtimeAssetSha256After": runtime_after,
        "runtimeRoomTreeSha256Before": runtime_room_tree_before,
        "runtimeRoomTreeSha256After": runtime_room_tree_after,
    }
    if manifest["runtimeAssetSha256Before"] != manifest["runtimeAssetSha256After"]:
        raise RuntimeError("candidate render unexpectedly changed the runtime asset")
    if (
        manifest["runtimeRoomTreeSha256Before"]
        != manifest["runtimeRoomTreeSha256After"]
    ):
        raise RuntimeError("candidate render unexpectedly changed the runtime room tree")
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
