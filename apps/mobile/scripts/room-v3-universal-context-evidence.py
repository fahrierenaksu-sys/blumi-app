#!/usr/bin/env python3
"""Compose representative Universal Core items into the locked room shell.

The output is context evidence, not a runtime promotion registry. Positions are
normalized examples that mirror the Room V2 surface contracts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
MASTER = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
ASSET_ROOT = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates"


CONTEXTS = (
    {
        "id": "wall_context",
        "label": "wall: clock + artwork",
        "items": (
            ("universal_wall_clock_a", "wall", 0.34, 0.31, 0.10),
            ("universal_wall_artwork_a", "wall", 0.66, 0.31, 0.12),
        ),
    },
    {
        "id": "ceiling_context",
        "label": "ceiling: halo light",
        "items": (("universal_ceiling_light_a", "ceiling", 0.50, 0.20, 0.08),),
    },
    {
        "id": "tabletop_context",
        "label": "tabletop: desk + lamp",
        "items": (
            ("universal_tidy_work_desk_a", "floor", 0.50, 0.75, 0.28),
            ("universal_table_lamp_a", "tabletop", 0.46, 0.59, 0.07),
        ),
    },
    {
        "id": "floor_seating_context",
        "label": "floor: rug + loveseat",
        "items": (
            ("universal_rug_a", "floor", 0.50, 0.80, 0.40),
            ("universal_cloud_loveseat_a", "floor", 0.50, 0.73, 0.30),
        ),
    },
    {
        "id": "standing_context",
        "label": "floor: plant + mirror + speaker",
        "items": (
            ("universal_large_standing_plant_a", "floor", 0.27, 0.74, 0.15),
            ("universal_full_length_mirror_a", "floor", 0.73, 0.70, 0.14),
            ("universal_small_speaker_a", "floor", 0.82, 0.82, 0.06),
        ),
    },
    {
        "id": "social_context",
        "label": "social: sofa + table + tray",
        "items": (
            ("universal_long_sofa_a", "floor", 0.42, 0.76, 0.35),
            ("universal_arc_coffee_table_b", "floor", 0.55, 0.83, 0.20),
            ("universal_tea_coffee_tray_a", "tabletop", 0.55, 0.76, 0.09),
        ),
    },
)


def source_for(item_id: str) -> Path:
    directory = ASSET_ROOT / item_id
    for suffix in ("_front_runtime_v2.png", "_front_runtime_v1.png", "_front_pilot_v1.png"):
        candidate = directory / f"{item_id}{suffix}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(item_id)


def paste_item(canvas: Image.Image, item_id: str, x: float, y: float, width: float) -> None:
    source = Image.open(source_for(item_id)).convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError(f"{item_id} has no visible alpha")
    cropped = source.crop(bounds)
    target_width = round(width * canvas.width)
    target_height = max(1, round(cropped.height * target_width / cropped.width))
    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    left = round(x * canvas.width - target_width / 2)
    bottom = round(y * canvas.height)
    canvas.alpha_composite(resized, (left, bottom - target_height))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    master = Image.open(MASTER).convert("RGBA")
    cards = []
    manifest = []

    for context in CONTEXTS:
        canvas = master.copy()
        for item_id, surface, x, y, width in context["items"]:
            paste_item(canvas, item_id, x, y, width)
        label_height = 34
        card = Image.new("RGBA", (627, 390), (20, 21, 28, 255))
        preview = canvas.resize((627, 357), Image.Resampling.LANCZOS)
        card.alpha_composite(preview, (0, 0))
        ImageDraw.Draw(card).text((12, 367), context["label"], fill=(255, 255, 255, 255))
        cards.append(card)
        manifest.append({"id": context["id"], "label": context["label"], "items": [
            {"id": item_id, "surface": surface, "normalizedAnchor": {"x": x, "y": y}, "width": width}
            for item_id, surface, x, y, width in context["items"]
        ]})

    columns = 2
    rows = (len(cards) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * 627, rows * 390), (15, 16, 21, 255))
    for index, card in enumerate(cards):
        sheet.alpha_composite(card, ((index % columns) * 627, (index // columns) * 390))
    sheet.save(output_dir / "universal_core_room_context_contact_sheet.png", format="PNG", optimize=True)
    (output_dir / "universal_core_room_context_manifest.json").write_text(
        json.dumps({
            "reference": str(MASTER.relative_to(ROOT)),
            "contextCount": len(manifest),
            "runtimeReady": False,
            "status": "context_evidence_only_pending_simulator_and_artifact_verifier",
            "independentReviewerVerdict": "PASS_EVIDENCE_ONLY",
            "promotionVerdict": "BLOCKED",
            "contexts": manifest
        }, indent=2) + "\n",
        encoding="utf-8"
    )
    print(json.dumps({"outputDir": str(output_dir.relative_to(ROOT)), "contextCount": len(manifest)}, indent=2))


if __name__ == "__main__":
    main()
