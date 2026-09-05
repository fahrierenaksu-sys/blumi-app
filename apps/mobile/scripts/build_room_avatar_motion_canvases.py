#!/usr/bin/env python3
"""Build Blumi room-avatar motion edit canvases from the JSON manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required. Install it with `python3 -m pip install pillow`."
    ) from exc


DEFAULT_MANIFEST = "docs/avatar-motion-pipeline/room-avatar-motion-missing-assets.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build transparent Blumi room-avatar motion edit canvases."
    )
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--include-optional",
        action="store_true",
        help="Reserved for future non-v1 plans if the manifest includes them.",
    )
    return parser.parse_args()


def build_canvas(plan: dict[str, object]) -> None:
    canvas = plan["canvas"]
    frame_width = int(canvas["width"])
    frame_height = int(canvas["height"])
    frame_count = max(1, int(plan["minimumFrameCount"]))

    seed_path = Path(str(plan["seedPath"]))
    seed = Image.open(seed_path).convert("RGBA")
    if seed.size != (frame_width, frame_height):
        raise SystemExit(
            f"{seed_path} must be {frame_width}x{frame_height}, got {seed.width}x{seed.height}."
        )

    output = Image.new(
        "RGBA",
        (frame_width * frame_count, frame_height),
        (0, 0, 0, 0),
    )
    output.alpha_composite(seed, (0, 0))

    out_path = Path(str(plan["editCanvasPath"]))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(out_path)


def main() -> None:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    plans = [
        plan for plan in manifest["plans"]
        if args.include_optional or plan["productionBlocking"]
    ]
    for plan in plans:
        build_canvas(plan)
    print(f"built {len(plans)} room-avatar motion edit canvases")


if __name__ == "__main__":
    main()
