#!/usr/bin/env python3
"""Create candidate-only 4W+1S for the three live tops absent from the 66 record.

The live catalog is 54 items while the historical 66 static board contains
three record-only replacements. These tops still need the same motion evidence
before the 54-item runtime ledger can be complete. No runtime files are
written here; each item is emitted as a versioned candidate manifest.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path

from produce_male_wardrobe_66_motion_refresh_v1 import (
    MOTION,
    OUTPUT_ROOT,
    REVIEW_ROOT,
    STATES,
    _fit_to_pose,
    _manifest,
    _motion_output_dir,
    _write_item_sheet,
    load,
    relative,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
STATUS_SCRIPT = REPO_ROOT / "apps/mobile/scripts/male-wardrobe-redesign-status.mjs"
LIVE_REPLACEMENT_TOPS = frozenset(
    {
        "dusty_blue_weekend_crew_sweatshirt",
        "modern_track_luxury_top",
        "cocoa_sage_canvas_shacket",
    }
)
NEUTRAL_TOP_AUTHORITY = "powder_blue_crew_tee"


def load_live_replacement_items() -> tuple[dict, ...]:
    result = subprocess.run(
        ["node", str(STATUS_SCRIPT)],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    items = json.loads(result.stdout).get("items", [])
    selected = []
    for item in items:
        if item.get("slug") not in LIVE_REPLACEMENT_TOPS:
            continue
        static = item.get("states", {}).get("static", {})
        path = static.get("path")
        if not isinstance(path, str) or not path:
            raise ValueError(f"{item['slug']}: missing selected static path")
        static_path = REPO_ROOT / path
        selected.append(
            {
                "slug": item["slug"],
                "category": "top",
                "family": item["family"],
                "static_path": static_path,
            }
        )
    if {item["slug"] for item in selected} != LIVE_REPLACEMENT_TOPS:
        raise ValueError("live replacement top inventory is incomplete")
    return tuple(sorted(selected, key=lambda item: item["slug"]))


def build_top_frame(item: dict, state: str):
    source = load(item["static_path"])
    if state == "static":
        return source
    authority = load(
        MOTION
        / f"room_avatar_top_male_{NEUTRAL_TOP_AUTHORITY}_v1_{state}.png"
    )
    return _fit_to_pose(source, authority)


def produce() -> dict:
    items = load_live_replacement_items()
    manifests = []
    boards = []
    for item in items:
        frames = {state: build_top_frame(item, state) for state in ("static", *STATES)}
        board = _write_item_sheet(item, {state: frames[state] for state in STATES})
        manifest = _manifest(item, frames, board)
        manifest_path = _motion_output_dir(item) / "motion-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        manifests.append(relative(manifest_path))
        boards.append(relative(board))
    summary = {
        "schemaVersion": 1,
        "status": "candidate_motion_pending_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "itemCount": len(items),
        "states": list(STATES),
        "manifests": manifests,
        "boards": boards,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    output = REVIEW_ROOT / "male-live-replacement-tops-motion-v1-manifest.json"
    output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
