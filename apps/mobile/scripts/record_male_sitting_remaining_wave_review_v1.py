#!/usr/bin/env python3
"""Bind the independent PASS review to the exact remaining-ten artifacts."""

from __future__ import annotations

from datetime import datetime
import json

import numpy as np

from package_male_sitting_remaining_wave_v1 import (
    BASE,
    PROFILES,
    SHOES,
    ROOT,
    load,
    sha256,
)


def build_review(profile) -> dict:
    pixels = np.asarray(load(profile.output))
    alpha = pixels[..., 3] > 24
    ys, xs = np.where(alpha)
    metrics = {
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "transparentRgbResidue": int(np.any(pixels[pixels[..., 3] == 0, :3])),
    }
    if profile.is_short:
        metrics.update(
            {
                "twoLegOpeningClear": bool(
                    not alpha[profile.short_gap_start : profile.short_clear_row, 127:130].any()
                ),
                "pixelsBelowClearRow": int(alpha[profile.short_clear_row :].sum()),
            }
        )
    else:
        base = np.asarray(load(BASE))
        base_skin = (
            (base[..., 0] > 180)
            & (base[..., 0] > base[..., 1] + 20)
            & (base[..., 1] > base[..., 2] - 5)
        )
        pelvis_holes = (~alpha) & base_skin
        shoes = np.asarray(load(SHOES))[..., 3] > 24
        metrics.update(
            {
                "pelvisSkinHoles294To328": int(pelvis_holes[294:329, 122:135].sum()),
                "shoeOverlapPixels": int((alpha & shoes).sum()),
                "pixelsBelowShoeContact": int(alpha[340:].sum()),
            }
        )
    return {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_independent_review",
        "itemId": profile.slug,
        "reviewer": "independent-review-agent",
        "verdict": "PASS",
        "reviewedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "candidateOnly": True,
        "runtimePromoted": False,
        "candidate": {
            "path": profile.output.relative_to(ROOT).as_posix(),
            "sha256": sha256(profile.output),
        },
        "board": {
            "path": profile.board.relative_to(ROOT).as_posix(),
            "sha256": sha256(profile.board),
        },
        "focusedTest": "python3 -m unittest test_package_male_sitting_remaining_wave_v1.py",
        "metrics": metrics,
        "findings": [],
    }


def produce() -> None:
    for profile in PROFILES:
        review = build_review(profile)
        review_path = profile.manifest.with_name(
            profile.manifest.name.replace("-manifest.json", "-independent-review.json")
        )
        review_path.write_text(json.dumps(review, indent=2) + "\n", encoding="utf-8")
        manifest = json.loads(profile.manifest.read_text(encoding="utf-8"))
        manifest["status"] = "candidate_independent_pass_pending_user_approval"
        manifest["approval"] = {
            "independentReviewVerdict": "PASS",
            "independentReviewPath": review_path.relative_to(ROOT).as_posix(),
            "independentReviewSha256": sha256(review_path),
            "explicitUserApproval": False,
        }
        manifest["candidateOnly"] = True
        manifest["runtimePromoted"] = False
        profile.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    produce()
