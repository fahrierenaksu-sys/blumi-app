#!/usr/bin/env python3
"""Remove body-outline residue from the final three failed male bottom layers."""

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
CANDIDATES = REDESIGN / "candidates/bottom"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
VERSION = "v2"
MIN_BOTTOM_COMPONENT_PIXELS = 64
ITEMS = {
    "washed_baggy_denim": "male_relaxed_baggy",
    "creative_utility_bottom": "male_cargo_parachute_track",
    "colorblock_nylon_track_pants": "male_cargo_parachute_track",
}
SOURCE_SHA256 = {
    "washed_baggy_denim":
        "c5b38f5a16fed15796cc93a5399f34e10ffb05d168ff692bf7c678137f938264",
    "creative_utility_bottom":
        "55f3bf7797dbeef062505b9342fa22b0a35b303766a91f9af0d2e40494a02759",
    "colorblock_nylon_track_pants":
        "4f2baa53ce00a0a923c4a2829b038b66eefefe19d09172d77b29ab4b735a0669",
}


def _load_cleanup_module():
    path = Path(__file__).with_name("produce_male_top_alpha_residue_repairs.py")
    spec = importlib.util.spec_from_file_location("_shared_male_alpha_cleanup_bottoms", path)
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


def source_path(slug: str) -> Path:
    return CANDIDATES / slug / "rig/static.png"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_residue(source: Image.Image) -> Image.Image:
    cleaned = _CLEANUP.clean_residue(source)
    pixels = np.asarray(cleaned).copy()
    visible = pixels[..., 3] > 0
    for component in _CLEANUP.connected_components(visible):
        if len(component) >= MIN_BOTTOM_COMPONENT_PIXELS:
            continue
        if any(int(pixels[y, x, 3]) > STRONG_ALPHA for y, x in component):
            raise ValueError("refusing to delete a strong isolated garment component")
        for y, x in component:
            pixels[y, x] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


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


def render_proof(bottom: Image.Image, destination: Path) -> None:
    crop = (78, 258, 178, 352)
    size = ((crop[2] - crop[0]) * 5, (crop[3] - crop[1]) * 5)
    isolated = bottom.crop(crop).resize(size, Image.Resampling.LANCZOS)
    combined = composite(bottom).crop(crop).resize(size, Image.Resampling.LANCZOS)
    panels = []
    for background in (
        _checkerboard(size),
        Image.new("RGBA", size, (0, 0, 0, 255)),
    ):
        background.alpha_composite(isolated)
        panels.append(background)
    combination = _checkerboard(size)
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


def produce_item(slug: str, family: str) -> None:
    source = source_path(slug)
    if _sha256(source) != SOURCE_SHA256[slug]:
        raise ValueError(f"{slug}: reviewed source checksum drift")
    candidate = CANDIDATES / slug
    rig = candidate / "rig"
    review = candidate / f"static-review-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_output = rig / f"static-review-alpha-{VERSION}.png"
    composite_output = rig / f"composite-review-alpha-{VERSION}.png"
    proof_output = review / f"{slug}-alpha-{VERSION}-proof.png"
    manifest_output = review / f"{slug}-alpha-{VERSION}-manifest.json"

    cleaned = clean_residue(Image.open(source).convert("RGBA"))
    cleaned.save(static_output)
    composite(cleaned).save(composite_output)
    render_proof(cleaned, proof_output)
    relative = lambda path: path.relative_to(REPO).as_posix()
    manifest = {
        "schemaVersion": 1,
        "itemId": slug,
        "family": family,
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "locked-strong-alpha-neighborhood-cleanup",
        "forbiddenTransform": "no reshape, warp, blur, crop, or runtime overwrite",
        "inputs": {relative(source): SOURCE_SHA256[slug]},
        "outputs": {
            relative(static_output): _sha256(static_output),
            relative(composite_output): _sha256(composite_output),
            relative(proof_output): _sha256(proof_output),
        },
        "independentReview": "PENDING",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
    }
    manifest_output.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    for slug, family in ITEMS.items():
        produce_item(slug, family)


if __name__ == "__main__":
    main()
