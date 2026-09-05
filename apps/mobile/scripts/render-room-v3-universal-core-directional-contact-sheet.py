#!/usr/bin/env python3
"""Render a visual four-direction contact sheet for the completed floor wave."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates"
OUTPUT_ROOT = ROOT / "docs/room-v3-qa/2026-07-18-universal-core-wave"
DIRECTIONS = ("front", "back", "left", "right")
ITEMS = (
    "universal_rug_a",
    "universal_small_speaker_a",
    "universal_full_length_mirror_a",
    "universal_open_display_shelf_a",
    "universal_room_divider_a",
)


def font(size: int):
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


def main() -> None:
    cell_w, cell_h = 330, 300
    sheet = Image.new("RGBA", (cell_w * 4, cell_h * len(ITEMS)), (244, 239, 236, 255))
    manifest = []
    for row, item_id in enumerate(ITEMS):
        row_files = []
        for col, direction in enumerate(DIRECTIONS):
            path = ASSET_ROOT / item_id / f"{item_id}_{direction}_runtime_v2.png"
            image = Image.open(path).convert("RGBA")
            image.thumbnail((cell_w - 28, cell_h - 54), Image.Resampling.LANCZOS)
            x = col * cell_w + (cell_w - image.width) // 2
            y = row * cell_h + 32 + (cell_h - 54 - image.height) // 2
            sheet.alpha_composite(image, (x, y))
            draw = ImageDraw.Draw(sheet)
            draw.text((col * cell_w + 12, row * cell_h + 10), direction, fill=(70, 58, 58, 255), font=font(16))
            row_files.append({"direction": direction, "path": str(path.relative_to(ROOT))})
        ImageDraw.Draw(sheet).text((12, row * cell_h + cell_h - 22), item_id, fill=(70, 58, 58, 255), font=font(12))
        manifest.append({"id": item_id, "directions": row_files})

    output_path = OUTPUT_ROOT / "universal_core_directional_contact_sheet.png"
    sheet.save(output_path)
    (OUTPUT_ROOT / "universal_core_directional_manifest.json").write_text(
        json.dumps(
            {
                "artifactId": "universal-core-directional-wave-2026-07-18",
                "status": "evidence_only_pending_independent_review",
                "directions": list(DIRECTIONS),
                "items": manifest,
                "promotionVerdict": "BLOCKED_PENDING_FULL_QA_AND_SIMULATOR",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
