#!/usr/bin/env python3
"""Extract verified Blumi room-avatar motion frames from a generated strip.

This is an import-prep tool. It writes frames to a staging directory only after
checking the generated strip against the manifest contract. It intentionally
does not modify the app asset catalog.
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
DEFAULT_OUT_DIR = "docs/avatar-motion-pipeline/extracted-frames"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract verified Blumi room-avatar motion frames."
    )
    parser.add_argument(
        "--asset-prefix",
        required=True,
        help="Manifest expectedAssetKeyPrefix to extract.",
    )
    parser.add_argument(
        "--strip",
        help="Generated strip PNG. Defaults to the manifest editCanvasPath.",
    )
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument(
        "--allow-edit-canvas",
        action="store_true",
        help="Allow blank unchanged slots. Use only for pipeline debugging.",
    )
    return parser.parse_args()


def load_plan(manifest_path: Path, asset_prefix: str) -> dict[str, object]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for plan in manifest["plans"]:
        if plan["expectedAssetKeyPrefix"] == asset_prefix:
            return plan
    raise SystemExit(f"No manifest plan found for {asset_prefix}.")


def is_blank_frame(frame: Image.Image) -> bool:
    alpha = frame.getchannel("A")
    return alpha.getbbox() is None


def frames_differ(first: Image.Image, second: Image.Image) -> bool:
    return ImageChops.difference(first, second).getbbox() is not None


def main() -> None:
    args = parse_args()
    plan = load_plan(Path(args.manifest), args.asset_prefix)
    canvas = plan["canvas"]
    frame_width = int(canvas["width"])
    frame_height = int(canvas["height"])
    frame_count = max(1, int(plan["minimumFrameCount"]))
    strip_path = Path(args.strip or str(plan["editCanvasPath"]))
    seed_path = Path(str(plan["seedPath"]))
    out_dir = Path(args.out_dir) / str(plan["expectedAssetKeyPrefix"])

    if not strip_path.exists():
        raise SystemExit(f"Generated strip not found: {strip_path}")
    if not seed_path.exists():
        raise SystemExit(f"Seed not found: {seed_path}")

    strip = Image.open(strip_path).convert("RGBA")
    seed = Image.open(seed_path).convert("RGBA")
    expected_size = (frame_width * frame_count, frame_height)
    if strip.size != expected_size:
        raise SystemExit(f"{strip_path} size {strip.size} != {expected_size}")
    if seed.size != (frame_width, frame_height):
        raise SystemExit(f"{seed_path} size {seed.size} != {(frame_width, frame_height)}")

    frames = [
        strip.crop((
            index * frame_width,
            0,
            (index + 1) * frame_width,
            frame_height,
        ))
        for index in range(frame_count)
    ]

    if frames_differ(seed, frames[0]):
        raise SystemExit("Frame 01 must match the approved seed exactly.")

    blank_indexes = [
        index + 1
        for index, frame in enumerate(frames)
        if is_blank_frame(frame)
    ]
    if blank_indexes and not args.allow_edit_canvas:
        raise SystemExit(f"Blank generated frame slots: {blank_indexes}")

    requires_animation = bool(plan["requiresAnimation"])
    if (
        requires_animation and
        not args.allow_edit_canvas and
        not any(frames_differ(frames[0], frame) for frame in frames[1:])
    ):
        raise SystemExit("Animated motion strip has no changed frames after frame 01.")

    out_dir.mkdir(parents=True, exist_ok=True)
    for frame, file_name in zip(frames, plan["expectedFileNames"]):
        frame.save(out_dir / str(file_name))

    print(f"extracted {len(frames)} frames to {out_dir}")


if __name__ == "__main__":
    main()
