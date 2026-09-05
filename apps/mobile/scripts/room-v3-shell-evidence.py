#!/usr/bin/env python3
"""Create same-state Room V3 shell evidence without promoting candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
MASTER_PATH = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
SHELLS = (
    ("master", MASTER_PATH),
    ("cocoa_navy_modern_studio", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_cocoa_navy_modern_studio_candidate_v1.png"),
    ("forest_terracotta_creative_loft", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_forest_terracotta_creative_loft_candidate_v1.png"),
    ("blush_petal_cottage", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_blush_petal_cottage_candidate_v1.png"),
    ("lavender_moon_atelier", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_lavender_moon_atelier_candidate_v1.png"),
    ("sage_cloud_scandinavian", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_sage_cloud_scandinavian_candidate_v1.png"),
    ("apricot_sky_social_loft", ROOT / "apps/mobile/src/features/roomV2/assets/runtime/candidates/room_v3_shell_apricot_sky_social_loft_candidate_v1.png"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def card(image: Image.Image, label: str, size: tuple[int, int]) -> Image.Image:
    card_image = Image.new("RGBA", (size[0], size[1] + 34), (25, 25, 31, 255))
    preview = image.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    card_image.alpha_composite(preview, (0, 0))
    draw = ImageDraw.Draw(card_image)
    draw.text((12, size[1] + 8), label, fill=(255, 255, 255, 255))
    return card_image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--candidate-suffix", default="v2")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    master = Image.open(MASTER_PATH).convert("RGBA")
    records = []
    cards = []
    for name, path in SHELLS:
        if name != "master":
            path = path.with_name(path.name.replace("candidate_v1", f"candidate_{args.candidate_suffix}"))
        image = Image.open(path).convert("RGBA")
        records.append({
            "id": name,
            "path": str(path.relative_to(ROOT)),
            "sha256": sha256(path),
            "canvasSize": {"width": image.width, "height": image.height},
            "alphaBounds": list(image.getchannel("A").getbbox() or ()),
            "cornerAlpha": [image.getpixel(point)[3] for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))],
            "status": "candidate_evidence_only_visual_review_required" if name != "master" else "approved_reference",
        })
        cards.append(card(image, name, (600, 342)))

        if name != "master":
            overlay = Image.blend(master, image, 0.5)
            overlay.save(output_dir / f"{name}_same_state_overlay.png", format="PNG", optimize=True)

    columns = 2
    rows = (len(cards) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * 600, rows * 376), (16, 16, 20, 255))
    for index, preview in enumerate(cards):
        sheet.alpha_composite(preview, ((index % columns) * 600, (index // columns) * 376))
    sheet.save(output_dir / "six_shell_same_state_contact_sheet.png", format="PNG", optimize=True)
    (output_dir / "six_shell_manifest.json").write_text(
        json.dumps({
            "reference": str(MASTER_PATH.relative_to(ROOT)),
            "canvasSize": {"width": master.width, "height": master.height},
            "shells": records,
            "producerVerdict": "BLOCKED_VISUAL_REVIEW_REQUIRED",
            "independentReviewerVerdict": "PENDING",
            "promotionVerdict": "BLOCKED",
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"outputDir": str(output_dir.relative_to(ROOT)), "shellCount": len(records) - 1, "canvasSize": [master.width, master.height]}, indent=2))


if __name__ == "__main__":
    main()
