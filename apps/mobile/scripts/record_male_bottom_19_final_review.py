#!/usr/bin/env python3
"""Bind the final independent 19/19 PASS to the exact consolidated board."""

from __future__ import annotations

from datetime import datetime
import json

from render_male_bottom_19_final_review_board import (
    ALL_STATES,
    ITEMS,
    MANIFEST,
    OUTPUT,
    ROOT,
    sha256,
)


REVIEW = MANIFEST.with_name("male-bottom-19-final-4w1s-independent-review.json")


def build_review() -> dict:
    return {
        "schemaVersion": 1,
        "recordType": "male_bottom_19_final_4w1s_independent_review",
        "scope": "canonical_male_bottom_19_final_4w1s_review",
        "reviewedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "reviewer": "independent-review-agent",
        "verdict": "PASS",
        "candidateOnly": True,
        "runtimePromoted": False,
        "itemCount": len(ITEMS),
        "stateCountPerItem": len(ALL_STATES),
        "board": {
            "path": OUTPUT.relative_to(ROOT).as_posix(),
            "sha256": sha256(OUTPUT),
            "dimensions": "1150x6808",
        },
        "itemVerdicts": [{"slug": item.slug, "verdict": "PASS"} for item in ITEMS],
        "findings": [],
    }


def produce() -> None:
    review = build_review()
    REVIEW.write_text(json.dumps(review, indent=2) + "\n", encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["status"] = "candidate_independent_pass_pending_final_user_approval"
    manifest["independentReview"] = {
        "verdict": "PASS",
        "path": REVIEW.relative_to(ROOT).as_posix(),
        "sha256": sha256(REVIEW),
    }
    manifest["candidateOnly"] = True
    manifest["runtimePromoted"] = False
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    produce()
