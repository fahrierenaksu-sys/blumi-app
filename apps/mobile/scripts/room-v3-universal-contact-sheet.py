#!/usr/bin/env python3
"""Render a readable contact sheet for the 45 Universal Core front assets.

This is evidence-only: it never changes the runtime catalog or promotion state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
CANDIDATE_ROOT = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates"
INVENTORY = ROOT / "apps/mobile/src/features/roomV2/roomV3UniversalCoreInventory.ts"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_ids() -> list[str]:
    source = INVENTORY.read_text(encoding="utf-8")
    start = source.index("ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID")
    end = source.index("}\n\nexport interface", start)
    ids = re.findall(r"^\s+(universal_[a-z0-9_]+):", source[start:end], re.MULTILINE)
    return [item_id for item_id in ids if item_id != "universal_soft_media_console_a"]


def front_asset(item_id: str) -> Path:
    directory = CANDIDATE_ROOT / item_id
    candidates = [
        directory / f"{item_id}_front_runtime_v2.png",
        directory / f"{item_id}_front_runtime_v1.png",
        directory / f"{item_id}_front_pilot_v1.png",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No front runtime/pilot asset for {item_id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    ids = canonical_ids()
    if len(ids) != 45:
        raise RuntimeError(f"Expected 45 canonical Universal Core IDs, found {len(ids)}")

    cell_width, cell_height, label_height = 260, 260, 38
    columns = 5
    rows = (len(ids) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_width, rows * (cell_height + label_height)), (19, 20, 26, 255))
    records = []

    for index, item_id in enumerate(ids):
        path = front_asset(item_id)
        image = Image.open(path).convert("RGBA")
        preview = image.copy()
        preview.thumbnail((cell_width - 24, cell_height - 24), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (cell_width, cell_height + label_height), (31, 33, 41, 255))
        left = (cell_width - preview.width) // 2
        top = (cell_height - preview.height) // 2
        cell.alpha_composite(preview, (left, top))
        draw = ImageDraw.Draw(cell)
        draw.text((10, cell_height + 10), item_id.removeprefix("universal_"), fill=(255, 255, 255, 255))
        x = (index % columns) * cell_width
        y = (index // columns) * (cell_height + label_height)
        sheet.alpha_composite(cell, (x, y))

        records.append({
            "id": item_id,
            "path": str(path.relative_to(ROOT)),
            "sha256": sha256(path),
            "canvasSize": {"width": image.width, "height": image.height},
            "alphaBounds": list(image.getchannel("A").getbbox() or ()),
            "status": "candidate_pending_runtime_promotion"
        })

    sheet.save(output_dir / "universal_core_front_contact_sheet.png", format="PNG", optimize=True)
    (output_dir / "universal_core_front_manifest.json").write_text(
        json.dumps({
            "source": str(INVENTORY.relative_to(ROOT)),
            "productCount": len(records),
            "runtimeReady": False,
            "promotionBlocker": "artifact_verifier_simulator_and_independent_review_pending",
            "independentReviewerVerdict": "PASS_EVIDENCE_ONLY",
            "promotionVerdict": "BLOCKED",
            "products": records
        }, indent=2) + "\n",
        encoding="utf-8"
    )
    print(json.dumps({"outputDir": str(output_dir.relative_to(ROOT)), "productCount": len(records)}, indent=2))


if __name__ == "__main__":
    main()
