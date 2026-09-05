#!/usr/bin/env python3
"""Package the re-illustrated colorblock track pant on the canonical male rig."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO = Path(__file__).resolve().parents[3]
REDESIGN = REPO / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
CANDIDATE = REDESIGN / "candidates/bottom/colorblock_nylon_track_pants"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
SOURCE = CANDIDATE / "source-v4/colorblock-track-integrated-v4-alpha.png"
CHROMA_SOURCE = CANDIDATE / "source-v4/colorblock-track-integrated-v4-chroma.png"
SOURCE_SHA256 = "c3e0a19b0d78f4c9e003b6029d94a3dc92388c4aa11a9a39104d31d3c1d8bbee"
CANVAS = (256, 384)
TARGET_TOP = 265
TARGET_BOTTOM = 338
TARGET_HEIGHT = TARGET_BOTTOM - TARGET_TOP
VERSION = "v4"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _clean_hidden_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def build_registered_layer(source: Image.Image) -> Image.Image:
    """Uniformly scale the purpose-drawn chibi master and register its anchors."""

    rgba = _clean_hidden_rgb(source)
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("re-illustrated source has no visible garment")
    artwork = rgba.crop(bbox)
    target_width = round(artwork.width * TARGET_HEIGHT / artwork.height)
    fitted = artwork.resize(
        (target_width, TARGET_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    left = (CANVAS[0] - target_width) // 2
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(fitted, (left, TARGET_TOP))
    return _clean_hidden_rgb(layer)


def _load_room(filename: str) -> Image.Image:
    return Image.open(ROOM / filename).convert("RGBA")


def composite(layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for filename in (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
    ):
        result = Image.alpha_composite(result, _load_room(filename))
    result = Image.alpha_composite(result, layer)
    for filename in (
        "avatar_room_top_male_cream_basic_tee_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        result = Image.alpha_composite(result, _load_room(filename))
    return result


def _checkerboard(size: tuple[int, int], cell: int = 14) -> Image.Image:
    image = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(image)
    colors = ((255, 253, 254, 255), (226, 222, 226, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def _render_triptych(
    layer: Image.Image,
    combined: Image.Image,
    crop: tuple[int, int, int, int],
    scale: int,
    labels: tuple[str, str, str],
    destination: Path,
) -> None:
    width = (crop[2] - crop[0]) * scale
    height = (crop[3] - crop[1]) * scale
    isolated = layer.crop(crop).resize((width, height), Image.Resampling.NEAREST)
    outfit = combined.crop(crop).resize((width, height), Image.Resampling.NEAREST)
    panels = []
    for background in (
        _checkerboard((width, height)),
        Image.new("RGBA", (width, height), (0, 0, 0, 255)),
    ):
        background.alpha_composite(isolated)
        panels.append(background)
    canonical = _checkerboard((width, height))
    canonical.alpha_composite(outfit)
    panels.append(canonical)

    header = 42
    board = Image.new(
        "RGBA",
        (width * 3, height + header),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    for index, (label, panel) in enumerate(zip(labels, panels)):
        x = index * width
        draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        board.paste(panel, (x, header))
    board.save(destination)


def produce() -> dict[str, Path]:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("colorblock re-illustrated source checksum drift")

    rig = CANDIDATE / "rig"
    review = CANDIDATE / f"static-review-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_output = rig / f"static-review-reillustrated-{VERSION}.png"
    composite_output = rig / f"composite-review-reillustrated-{VERSION}.png"
    proof_output = review / f"colorblock_nylon_track_pants-reillustrated-{VERSION}-proof.png"
    waist_output = review / f"colorblock_nylon_track_pants-reillustrated-{VERSION}-waist.png"
    hem_output = review / f"colorblock_nylon_track_pants-reillustrated-{VERSION}-hem-shoe.png"
    manifest_output = review / f"colorblock_nylon_track_pants-reillustrated-{VERSION}-manifest.json"

    layer = build_registered_layer(Image.open(SOURCE).convert("RGBA"))
    combined = composite(layer)
    layer.save(static_output)
    combined.save(composite_output)
    _render_triptych(
        layer,
        combined,
        (78, 255, 178, 352),
        5,
        ("LAYER / CHECKER", "LAYER / BLACK", "CANONICAL COMBINATION"),
        proof_output,
    )
    _render_triptych(
        layer,
        combined,
        (88, 258, 168, 294),
        7,
        ("WAIST / CHECKER", "WAIST / BLACK", "WAIST / COMBINATION"),
        waist_output,
    )
    _render_triptych(
        layer,
        combined,
        (86, 318, 170, 350),
        7,
        ("HEM / CHECKER", "HEM / BLACK", "HEM / COMBINATION"),
        hem_output,
    )

    relative = lambda path: path.relative_to(REPO).as_posix()
    outputs = (static_output, composite_output, proof_output, waist_output, hem_output)
    manifest = {
        "schemaVersion": 1,
        "itemId": "colorblock_nylon_track_pants",
        "family": "male_cargo_parachute_track",
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "imagegen-chibi-reillustration-plus-uniform-anchor-registration",
        "generationMode": "built-in-imagegen-chroma-key",
        "sourceUse": "purpose-drawn isolated chibi garment; no runtime body pixels",
        "forbiddenTransform": "no nonuniform scale, warp, patch mask, or runtime overwrite",
        "inputs": {
            relative(CHROMA_SOURCE): _sha256(CHROMA_SOURCE),
            relative(SOURCE): SOURCE_SHA256,
        },
        "anchors": {
            "canvas": [256, 384],
            "waistTopY": TARGET_TOP,
            "hemExclusiveY": TARGET_BOTTOM,
            "centerlineX": 128,
            "uniformScale": True,
        },
        "outputs": {relative(path): _sha256(path) for path in outputs},
        "independentReview": "PENDING",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
    }
    manifest_output.write_text(json.dumps(manifest, indent=2) + "\n")
    return {
        "static": static_output,
        "composite": composite_output,
        "proof": proof_output,
        "waist": waist_output,
        "hem": hem_output,
        "manifest": manifest_output,
    }


def main() -> None:
    produce()


if __name__ == "__main__":
    main()
