#!/usr/bin/env python3
"""Render the 19-item board with the V8 seated short replacements."""

from pathlib import Path
import sys

import render_male_bottom_19_corrected_review_board as v7_board


ROOT = Path(__file__).resolve().parents[3]
V8 = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v8"
)


_ORIGINAL_EVIDENCE = v7_board.EVIDENCE


def _sitting_path(slug: str) -> Path:
    if slug in {"technical_sport_shorts", "contemporary_resort_street_bottom"}:
        return V8 / f"{slug.replace('_', '-')}-canonical-sitting-v2.png"
    if slug in v7_board.OLD_SITTING_NAMES:
        return v7_board.OLD_SITTING / v7_board.OLD_SITTING_NAMES[slug]
    return _ORIGINAL_EVIDENCE / f"{slug.replace('_', '-')}-canonical-sitting-v1.png"


def produce() -> dict:
    v7_board.EVIDENCE = V8
    v7_board.OUTPUT = V8 / "male-bottom-19-v8-4w1s-review-board.png"
    v7_board.MANIFEST = V8 / "male-bottom-19-v8-4w1s-review-manifest.json"
    v7_board.sitting_path = _sitting_path
    return v7_board.produce()


if __name__ == "__main__":
    import json

    print(json.dumps(produce(), indent=2))
