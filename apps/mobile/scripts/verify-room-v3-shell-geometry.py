#!/usr/bin/env python3
"""Verify that Room V3 shell candidates keep the approved master geometry.

The material pass is allowed to change RGB values, but the architectural alpha
mask must remain byte-for-byte identical to the approved master. This audit is
deliberately evidence-only: it never promotes a shell into the runtime picker.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
MASTER_PATH = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
SHELL_IDS = (
    "cocoa_navy_modern_studio",
    "forest_terracotta_creative_loft",
    "blush_petal_cottage",
    "lavender_moon_atelier",
    "sage_cloud_scandinavian",
    "apricot_sky_social_loft",
)


def alpha_bytes(image: Image.Image) -> bytes:
    return image.convert("RGBA").getchannel("A").tobytes()


def audit_shells(output_path: Path) -> dict[str, object]:
    master = Image.open(MASTER_PATH).convert("RGBA")
    master_alpha = alpha_bytes(master)
    records: list[dict[str, object]] = []

    for shell_id in SHELL_IDS:
        candidate_path = ROOT / (
            "apps/mobile/src/features/roomV2/assets/runtime/candidates/"
            f"room_v3_shell_{shell_id}_candidate_v2.png"
        )
        candidate = Image.open(candidate_path).convert("RGBA")
        candidate_alpha = alpha_bytes(candidate)
        same_canvas = candidate.size == master.size
        alpha_diff = (
            sum(left != right for left, right in zip(master_alpha, candidate_alpha))
            if same_canvas
            else None
        )
        corner_alpha = [
            candidate.getpixel(point)[3]
            for point in (
                (0, 0),
                (candidate.width - 1, 0),
                (0, candidate.height - 1),
                (candidate.width - 1, candidate.height - 1),
            )
        ]
        locked_geometry = same_canvas and alpha_diff == 0
        records.append({
            "id": shell_id,
            "candidatePath": str(candidate_path.relative_to(ROOT)),
            "canvasSize": {"width": candidate.width, "height": candidate.height},
            "masterAlphaSha256": hashlib.sha256(master_alpha).hexdigest(),
            "candidateAlphaSha256": hashlib.sha256(candidate_alpha).hexdigest(),
            "alphaDiffPixelCount": alpha_diff,
            "cornerAlpha": corner_alpha,
            "lockedGeometry": "PASS" if locked_geometry else "FAIL",
            "emptyShellVisualReview": "NOT_EVALUATED",
        })

    report = {
        "schemaVersion": 1,
        "reference": str(MASTER_PATH.relative_to(ROOT)),
        "method": "exact RGBA alpha-mask comparison against the approved master",
        "scope": list(SHELL_IDS),
        "reviewedArtifacts": [
            "six_shell_same_state_contact_sheet.png",
            *[f"{shell_id}_same_state_overlay.png" for shell_id in SHELL_IDS],
        ],
        "records": records,
        "allLockedGeometryPass": all(
            record["lockedGeometry"] == "PASS" for record in records
        ),
        "promotionVerdict": "BLOCKED_PENDING_ARTIFACT_AND_SIMULATOR_EVIDENCE",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = audit_shells(args.output.resolve())
    print(json.dumps({
        "output": str(args.output),
        "shellCount": len(report["records"]),
        "allLockedGeometryPass": report["allLockedGeometryPass"],
    }, indent=2))


if __name__ == "__main__":
    main()
