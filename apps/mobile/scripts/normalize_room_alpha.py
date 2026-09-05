#!/usr/bin/env python3
"""Normalize fully transparent RGB without changing visible avatar pixels.

Only pixels with alpha == 0 are touched. The script verifies that every
non-transparent RGBA tuple is byte-for-byte identical after the PNG is
written, then emits an auditable JSON record for the visual QA report.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/deep-rig-qa"


def residue(pixels: list[tuple[int, int, int, int]]) -> int:
    return sum(1 for red, green, blue, alpha in pixels if alpha == 0 and (red or green or blue))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(path: Path) -> dict[str, object] | None:
    before = Image.open(path).convert("RGBA")
    original = list(before.getdata())
    count = residue(original)
    if count == 0:
        return None
    cleaned = [(0, 0, 0, alpha) if alpha == 0 else pixel for pixel in original for alpha in (pixel[3],)]
    if any(before_pixel != after_pixel for before_pixel, after_pixel in zip(original, cleaned) if before_pixel[3] > 0):
        raise RuntimeError(f"visible pixel would change: {path}")
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".png", delete=False) as handle:
        temp_path = Path(handle.name)
    try:
        before.putdata(cleaned)
        before.save(temp_path, format="PNG", optimize=True)
        verified = Image.open(temp_path).convert("RGBA")
        written = list(verified.getdata())
        if residue(written) != 0:
            raise RuntimeError(f"transparent RGB remains after write: {path}")
        if any(before_pixel != after_pixel for before_pixel, after_pixel in zip(original, written) if before_pixel[3] > 0):
            raise RuntimeError(f"visible pixels changed after write: {path}")
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return {
        "file": str(path.relative_to(ROOT)),
        "residueBefore": count,
        "residueAfter": residue(written),
        "visiblePixelsChanged": False,
        "sha256After": sha256(path),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    for directory in (ROOM, MOTION):
        for path in sorted(directory.glob("*.png")):
            record = normalize(path)
            if record:
                records.append(record)
    output = OUT / "2026-07-15-alpha-normalization.json"
    output.write_text(json.dumps({"files": records, "fileCount": len(records)}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"fileCount": len(records), "output": str(output.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
