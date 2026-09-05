#!/usr/bin/env python3
"""Verify Blumi room-avatar motion edit canvases.

The verifier checks the production handoff contract before generated strips are
trusted by the app catalog: correct dimensions, transparent RGBA mode, and an
unchanged seed frame in slot 01.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install it with `python3 -m pip install pillow`."
    ) from exc


DEFAULT_MANIFEST = "docs/avatar-motion-pipeline/room-avatar-motion-missing-assets.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify Blumi room-avatar motion edit canvases."
    )
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--include-optional",
        action="store_true",
        help="Reserved for future non-v1 plans if the manifest includes them.",
    )
    return parser.parse_args()


def verify_plan(plan: dict[str, object]) -> list[str]:
    errors: list[str] = []
    canvas = plan["canvas"]
    frame_width = int(canvas["width"])
    frame_height = int(canvas["height"])
    frame_count = max(1, int(plan["minimumFrameCount"]))
    expected_size = (frame_width * frame_count, frame_height)
    seed_path = Path(str(plan["seedPath"]))
    strip_path = Path(str(plan["editCanvasPath"]))

    if not seed_path.exists():
        return [f"missing seed: {seed_path}"]
    if not strip_path.exists():
        return [f"missing canvas: {strip_path}"]

    seed = Image.open(seed_path).convert("RGBA")
    strip = Image.open(strip_path).convert("RGBA")

    if seed.size != (frame_width, frame_height):
        errors.append(
            f"{seed_path} seed size {seed.size} != {(frame_width, frame_height)}"
        )
    if strip.size != expected_size:
        errors.append(f"{strip_path} strip size {strip.size} != {expected_size}")
    if strip.mode != "RGBA":
        errors.append(f"{strip_path} mode {strip.mode} != RGBA")

    first_slot = strip.crop((0, 0, frame_width, frame_height))
    diff = ImageChops.difference(seed, first_slot)
    if diff.getbbox() is not None:
        errors.append(f"{strip_path} slot 01 does not match seed {seed_path}")

    return errors


def main() -> None:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    plans = [
        plan for plan in manifest["plans"]
        if args.include_optional or plan["productionBlocking"]
    ]

    all_errors = [
        error
        for plan in plans
        for error in verify_plan(plan)
    ]
    if all_errors:
        for error in all_errors:
            print(error)
        raise SystemExit(1)

    print(f"verified {len(plans)} room-avatar motion edit canvases")


if __name__ == "__main__":
    main()
