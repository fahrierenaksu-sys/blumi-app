#!/usr/bin/env python3
"""Remove reviewed low-alpha body-outline residue from two male top candidates.

The operation is deliberately narrow: it preserves every strong garment pixel,
keeps only nearby antialiasing, removes tiny disconnected components, and writes
versioned candidate evidence. It never reshapes the garment or touches runtime.
"""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
REDESIGN = (
    REPO / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
CANDIDATES = REDESIGN / "candidates/top"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
STRONG_ALPHA = 128
SUPPORT_DIAMETER = 5
MIN_COMPONENT_PIXELS = 8
VERSION = "v2"
ITEMS = {
    "contemporary_resort_street_top": "shirt_open_camp_collar",
    "dusty_blue_weekend_crew_sweatshirt": "hoodie_or_sweat_closed_neck",
}
SOURCE_SHA256 = {
    "contemporary_resort_street_top":
        "91ebe2ecdc22e1107650f8571d439f977351fc88c8816f56d841bd187271954d",
    "dusty_blue_weekend_crew_sweatshirt":
        "b92c3e8300330e5d4bde17d85e2f4e8c5599c5d45303b9bed94e015946fc0857",
}


def source_path(slug: str) -> Path:
    return CANDIDATES / slug / "rig/static.png"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            component: list[tuple[int, int]] = []
            while queue:
                current_y, current_x = queue.popleft()
                component.append((current_y, current_x))
                for next_y, next_x in (
                    (current_y - 1, current_x),
                    (current_y + 1, current_x),
                    (current_y, current_x - 1),
                    (current_y, current_x + 1),
                ):
                    if (
                        0 <= next_y < height
                        and 0 <= next_x < width
                        and mask[next_y, next_x]
                        and not seen[next_y, next_x]
                    ):
                        seen[next_y, next_x] = True
                        queue.append((next_y, next_x))
            components.append(component)
    return components


def connected_component_sizes(mask: np.ndarray) -> list[int]:
    return sorted((len(component) for component in connected_components(mask)), reverse=True)


def clean_residue(source: Image.Image) -> Image.Image:
    if source.size != CANVAS or source.mode != "RGBA":
        raise ValueError(f"expected 256x384 RGBA source, received {source.size} {source.mode}")
    pixels = np.asarray(source).copy()
    alpha = pixels[..., 3]
    strong = Image.fromarray(((alpha > STRONG_ALPHA) * 255).astype(np.uint8))
    support = np.asarray(strong.filter(ImageFilter.MaxFilter(SUPPORT_DIAMETER))) > 0
    pixels[~support] = 0

    visible = pixels[..., 3] > 0
    for component in connected_components(visible):
        if len(component) >= MIN_COMPONENT_PIXELS:
            continue
        for y, x in component:
            pixels[y, x] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load_room(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


def composite(top: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layers = (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
        "avatar_room_bottom_male_navy_straight_pants_v1.png",
    )
    for name in layers:
        result = Image.alpha_composite(result, _load_room(name))
    result = Image.alpha_composite(result, top)
    return Image.alpha_composite(
        result,
        _load_room("avatar_room_hair_front_male_espresso_crop_v1.png"),
    )


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


def render_proof(cleaned: Image.Image, destination: Path) -> None:
    crop = (70, 198, 186, 352)
    size = ((crop[2] - crop[0]) * 4, (crop[3] - crop[1]) * 4)
    layer = cleaned.crop(crop).resize(size, Image.Resampling.LANCZOS)
    combined = composite(cleaned).crop(crop).resize(size, Image.Resampling.LANCZOS)
    panels = []
    for background in (
        _checkerboard(size, 16),
        Image.new("RGBA", size, (0, 0, 0, 255)),
    ):
        background.alpha_composite(layer)
        panels.append(background)
    combination = _checkerboard(size, 16)
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
    candidate_root = CANDIDATES / slug
    rig = candidate_root / "rig"
    review = candidate_root / f"static-review-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_path = rig / f"static-review-alpha-{VERSION}.png"
    composite_path = rig / f"composite-review-alpha-{VERSION}.png"
    proof_path = review / f"{slug}-alpha-{VERSION}-proof.png"
    manifest_path = review / f"{slug}-alpha-{VERSION}-manifest.json"

    cleaned = clean_residue(Image.open(source).convert("RGBA"))
    cleaned.save(static_path)
    composite(cleaned).save(composite_path)
    render_proof(cleaned, proof_path)

    repository_path = lambda path: path.relative_to(REPO).as_posix()
    manifest = {
        "schemaVersion": 1,
        "itemId": slug,
        "family": family,
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "locked-strong-alpha-neighborhood-cleanup",
        "forbiddenTransform": "no reshape, warp, blur, crop, or runtime overwrite",
        "inputs": {repository_path(source): SOURCE_SHA256[slug]},
        "outputs": {
            repository_path(static_path): _sha256(static_path),
            repository_path(composite_path): _sha256(composite_path),
            repository_path(proof_path): _sha256(proof_path),
        },
        "independentReview": "PENDING",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    for slug, family in ITEMS.items():
        produce_item(slug, family)


if __name__ == "__main__":
    main()
