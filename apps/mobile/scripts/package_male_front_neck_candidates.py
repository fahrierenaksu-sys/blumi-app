#!/usr/bin/env python3
"""Package seven front-neck candidates without altering their reviewed pixels."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO = Path(__file__).resolve().parents[3]
REDESIGN = REPO / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
CANDIDATES = REDESIGN / "candidates/top"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
VERSION = "v2"
NECK_CORE_PROBES = (
    (124, 219),
    (128, 219),
    (132, 219),
    (124, 220),
    (128, 220),
    (132, 220),
    (124, 221),
    (128, 221),
    (132, 221),
)
ITEMS = {
    "midnight_relaxed_tailoring_jacket": {
        "family": "jacket_open_lapel",
        "sha256": "dc5993753466838574dd6e05f8dddd6daf53015d84c428362f6e8f2866cda5a8",
    },
    "warm_sand_deconstructed_jacket": {
        "family": "jacket_open_lapel",
        "sha256": "72b7eb3a6ced911c703551dda3fb4b8b1c0333bc0d2fb7d1d4c9f82ca1e2a59a",
    },
    "monochrome_street_tailoring_top": {
        "family": "shirt_open_camp_collar",
        "sha256": "20f90e790dfe374cc72acdad50be58ca131f731ae777f95a46bcb886d020cb6b",
    },
    "creative_utility_top": {
        "family": "shirt_open_camp_collar",
        "sha256": "82b073bb2e78b8e7580b64a2dbddd075545c7c124788a2ad3ab3d3d3a53c8174",
    },
    "striped_chunky_cardigan": {
        "family": "jacket_open_lapel",
        "sha256": "8077773a493fa632977a85ae4dce9176093f1d194e0a12facb9eaf46b0369354",
    },
    "cocoa_sage_canvas_shacket": {
        "family": "shirt_open_camp_collar",
        "sha256": "bd8d27297e0ccf6a4936ea51369134921686628f9be498de32d6eff0f04ed94c",
    },
    "soft_panel_overshirt_bomber": {
        "family": "jacket_open_lapel",
        "sha256": "d3da04b7d9df890b65261615b36de53aa51cdac844fa594b59630373c7fb5b06",
    },
}


def source_path(slug: str) -> Path:
    return CANDIDATES / slug / "rig/static.png"


def composite_path(slug: str) -> Path:
    return CANDIDATES / slug / "rig/composite.png"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package_static(source: Image.Image) -> Image.Image:
    if source.size != CANVAS or source.mode != "RGBA":
        raise ValueError(f"expected 256x384 RGBA source, received {source.size} {source.mode}")
    pixels = np.asarray(source).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


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


def _canonical_neck_stack() -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
    ):
        result = Image.alpha_composite(
            result,
            Image.open(ROOM / name).convert("RGBA"),
        )
    return result


def render_proof(top: Image.Image, composite: Image.Image, destination: Path) -> None:
    crop = (106, 204, 150, 244)
    size = ((crop[2] - crop[0]) * 10, (crop[3] - crop[1]) * 10)
    isolated = top.crop(crop).resize(size, Image.Resampling.NEAREST)
    base_neck = _canonical_neck_stack().crop(crop).resize(size, Image.Resampling.NEAREST)
    combined = composite.crop(crop).resize(size, Image.Resampling.NEAREST)

    checker = _checkerboard(size)
    checker.alpha_composite(isolated)
    base_panel = _checkerboard(size)
    base_panel.alpha_composite(base_neck)
    combo_panel = _checkerboard(size)
    combo_panel.alpha_composite(combined)
    panels = (checker, base_panel, combo_panel)
    labels = ("TOP LAYER", "CANONICAL BASE + FACE", "ACTUAL COMPOSITE")
    header = 42
    board = Image.new("RGBA", (size[0] * 3, size[1] + header), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    for index, (label, panel) in enumerate(zip(labels, panels)):
        x = index * size[0]
        draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        board.paste(panel, (x, header))
    board.save(destination)


def package_item(slug: str, item: dict[str, str]) -> None:
    source = source_path(slug)
    if _sha256(source) != item["sha256"]:
        raise ValueError(f"{slug}: reviewed static source checksum drift")
    current_composite = composite_path(slug)
    rig = source.parent
    review = source.parent.parent / f"static-review-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_output = rig / f"static-review-front-neck-{VERSION}.png"
    composite_output = rig / f"composite-review-front-neck-{VERSION}.png"
    proof_output = review / f"{slug}-front-neck-{VERSION}-proof.png"
    manifest_output = review / f"{slug}-front-neck-{VERSION}-manifest.json"

    package_static(Image.open(source).convert("RGBA")).save(static_output)
    package_static(Image.open(current_composite).convert("RGBA")).save(composite_output)
    render_proof(
        Image.open(static_output).convert("RGBA"),
        Image.open(composite_output).convert("RGBA"),
        proof_output,
    )
    relative = lambda path: path.relative_to(REPO).as_posix()
    manifest = {
        "schemaVersion": 1,
        "itemId": slug,
        "family": item["family"],
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "pixel-identity-front-neck-evidence-package",
        "inputs": {
            relative(source): item["sha256"],
            relative(current_composite): _sha256(current_composite),
        },
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
    for slug, item in ITEMS.items():
        package_item(slug, item)


if __name__ == "__main__":
    main()
