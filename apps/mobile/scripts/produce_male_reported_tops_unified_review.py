#!/usr/bin/env python3
"""Review the two reported tops on the single unified male body layer."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

from render_male_wardrobe_54_progress_board import CANVAS, _checkerboard
from render_male_wardrobe_66_progress_board import (
    DEFAULT_CATALOG,
    DEFAULT_MANIFEST,
    DEFAULT_SELECTION,
    REPO_ROOT,
    compose_authoritative_item,
    resolve_authoritative_items,
)


EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
REVIEW_BOARD = EVIDENCE_ROOT / "male-reported-tops-unified-v3-review-board.png"
MANIFEST = EVIDENCE_ROOT / "male-reported-tops-unified-v3-manifest.json"
PROFILES = {
    "tonal_geometric_camp_collar_shirt": {
        "family": "shirt_open_camp_collar",
        "visibleNeck": True,
        "contract": "complete front collar leaves; rear plane hidden",
    },
    "modern_track_luxury_top": {
        "family": "hoodie_or_sweat_closed_neck",
        "visibleNeck": False,
        "contract": "high zipped collar seats against neck without fake opening",
    },
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _panel(item, composite: Image.Image) -> Image.Image:
    panel = Image.new("RGBA", (840, 760), (255, 248, 251, 255))
    draw = ImageDraw.Draw(panel)
    profile = PROFILES[item.slug]
    draw.text((20, 16), item.slug, fill=(48, 34, 44, 255))
    draw.text(
        (20, 36),
        f"{profile['family']} · visible neck: {profile['visibleNeck']}",
        fill=(105, 78, 94, 255),
    )
    draw.text((20, 56), profile["contract"], fill=(135, 78, 104, 255))

    full = _checkerboard(CANVAS)
    full.alpha_composite(composite)
    panel.alpha_composite(full, (36, 88))

    close_box = (78, 188, 178, 286)
    close = composite.crop(close_box).resize((500, 490), Image.Resampling.NEAREST)
    close_bg = _checkerboard(close.size, square=20)
    close_bg.alpha_composite(close)
    panel.alpha_composite(close_bg, (316, 88))

    raw = Image.open(item.layer_path).convert("RGBA")
    raw_close = raw.crop(close_box).resize((300, 294), Image.Resampling.NEAREST)
    raw_bg = _checkerboard(raw_close.size, square=16)
    raw_bg.alpha_composite(raw_close)
    panel.alpha_composite(raw_bg, (36, 470))
    draw.text((36, 448), "raw front-view garment layer", fill=(105, 78, 94, 255))
    return panel


def produce() -> dict:
    authoritative = resolve_authoritative_items(
        repository_root=REPO_ROOT,
        catalog_path=DEFAULT_CATALOG,
        manifest_path=DEFAULT_MANIFEST,
        selection_path=DEFAULT_SELECTION,
    )
    by_slug = {item.slug: item for item in authoritative}
    items = []
    board = Image.new("RGBA", (1680, 760), (244, 237, 242, 255))
    for index, (slug, profile) in enumerate(PROFILES.items()):
        item = by_slug[slug]
        if item.family != profile["family"]:
            raise ValueError(
                f"{slug}: expected {profile['family']}, received {item.family}"
            )
        composite = compose_authoritative_item(
            REPO_ROOT,
            item,
            DEFAULT_SELECTION,
        )
        board.alpha_composite(_panel(item, composite), (index * 840, 0))
        items.append(
            {
                "slug": slug,
                "family": item.family,
                "visibleNeck": profile["visibleNeck"],
                "layer": {
                    "path": _relative(item.layer_path),
                    "sha256": _sha256(item.layer_path),
                },
            }
        )

    board.convert("RGB").save(REVIEW_BOARD, optimize=True)
    manifest = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "status": "candidate_pending_independent_static_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "compositionContract": "single_unified_head_neck_body_layer",
        "items": items,
        "reviewBoard": {
            "path": _relative(REVIEW_BOARD),
            "sha256": _sha256(REVIEW_BOARD),
        },
        "explicitUserApproval": False,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    manifest = produce()
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
