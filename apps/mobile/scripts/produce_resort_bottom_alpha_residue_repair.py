#!/usr/bin/env python3
"""Produce a residue-free candidate for contemporary resort street bottoms."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO = Path(__file__).resolve().parents[3]
REDESIGN = REPO / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
CANDIDATE = REDESIGN / "candidates/bottom/contemporary_resort_street_bottom"
SOURCE = CANDIDATE / "rig/static.png"
SOURCE_SHA256 = "40d4d99c3854c82a8a582122b5df3bd06302fb44c80a9473d8a55ee8a291928b"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
VERSION = "v2"


def _load_cleanup_module():
    path = Path(__file__).with_name("produce_male_top_alpha_residue_repairs.py")
    spec = importlib.util.spec_from_file_location("_shared_male_alpha_cleanup", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load shared male alpha cleanup")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_CLEANUP = _load_cleanup_module()
STRONG_ALPHA = _CLEANUP.STRONG_ALPHA
SUPPORT_DIAMETER = _CLEANUP.SUPPORT_DIAMETER
connected_component_sizes = _CLEANUP.connected_component_sizes
MIN_BOTTOM_COMPONENT_PIXELS = 64


def clean_residue(source: Image.Image) -> Image.Image:
    cleaned = _CLEANUP.clean_residue(source)
    pixels = np.asarray(cleaned).copy()
    visible = pixels[..., 3] > 0
    for component in _CLEANUP.connected_components(visible):
        if len(component) >= MIN_BOTTOM_COMPONENT_PIXELS:
            continue
        for y, x in component:
            pixels[y, x] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_room(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


def composite(bottom: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
    ):
        result = Image.alpha_composite(result, _load_room(name))
    result = Image.alpha_composite(result, bottom)
    for name in (
        "avatar_room_top_male_cream_basic_tee_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
    ):
        result = Image.alpha_composite(result, _load_room(name))
    return result


def _checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
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


def render_proof(bottom: Image.Image, destination: Path) -> None:
    crop = (78, 268, 178, 352)
    size = ((crop[2] - crop[0]) * 5, (crop[3] - crop[1]) * 5)
    isolated = bottom.crop(crop).resize(size, Image.Resampling.LANCZOS)
    combined = composite(bottom).crop(crop).resize(size, Image.Resampling.LANCZOS)
    panels = []
    for background in (
        _checkerboard(size, 14),
        Image.new("RGBA", size, (0, 0, 0, 255)),
    ):
        background.alpha_composite(isolated)
        panels.append(background)
    combination = _checkerboard(size, 14)
    combination.alpha_composite(combined)
    panels.append(combination)
    header = 42
    board = Image.new("RGBA", (size[0] * 3, size[1] + header), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    for index, (label, panel) in enumerate(
        zip(("LAYER / CHECKER", "LAYER / BLACK", "CANONICAL COMBINATION"), panels)
    ):
        x = index * size[0]
        draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        board.paste(panel, (x, header))
    board.save(destination)


def main() -> None:
    if _sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("contemporary resort bottom source checksum drift")
    rig = CANDIDATE / "rig"
    review = CANDIDATE / f"static-review-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_path = rig / f"static-review-alpha-{VERSION}.png"
    composite_path = rig / f"composite-review-alpha-{VERSION}.png"
    proof_path = review / f"contemporary-resort-bottom-alpha-{VERSION}-proof.png"
    manifest_path = review / f"contemporary-resort-bottom-alpha-{VERSION}-manifest.json"
    cleaned = clean_residue(Image.open(SOURCE).convert("RGBA"))
    cleaned.save(static_path)
    composite(cleaned).save(composite_path)
    render_proof(cleaned, proof_path)

    relative = lambda path: path.relative_to(REPO).as_posix()
    manifest = {
        "schemaVersion": 1,
        "itemId": "contemporary_resort_street_bottom",
        "family": "male_relaxed_baggy",
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "locked-strong-alpha-neighborhood-cleanup",
        "forbiddenTransform": "no reshape, warp, blur, crop, or runtime overwrite",
        "inputs": {relative(SOURCE): SOURCE_SHA256},
        "outputs": {
            relative(static_path): _sha256(static_path),
            relative(composite_path): _sha256(composite_path),
            relative(proof_path): _sha256(proof_path),
        },
        "independentReview": "PENDING",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
