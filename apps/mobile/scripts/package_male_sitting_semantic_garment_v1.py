#!/usr/bin/env python3
"""Build a seated bottom from garment-colored pixels only.

This is deliberately not a rectangular source crop.  It extracts just the
fitted fabric silhouette from a pose-specific master while preserving the
canonical seated arms, skin, legs and shoes beneath it.
"""

from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_male_sitting_source_integrated_v1 as source_pipeline


ROOT = source_pipeline.ROOT
CANVAS = source_pipeline.CANVAS
SHOE_LOCK_Y = 326
MASTER = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v14-hem-reillustration/"
    "colorblock-nylon-track-pants-seated-master-v5.png"
)
SHOES = source_pipeline.MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"


def source_rgba() -> np.ndarray:
    return np.asarray(source_pipeline.normalized_source(MASTER))


def canonical_underlay() -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (
        source_pipeline.load(source_pipeline.BASE),
        source_pipeline.load(source_pipeline.FACE),
        source_pipeline.load(source_pipeline.TOP),
        source_pipeline.load(source_pipeline.HAIR),
        source_pipeline.load(SHOES),
    ):
        result.alpha_composite(layer)
    return result


def colorblock_garment_mask(source: np.ndarray) -> np.ndarray:
    """Select navy fabric and its orange/blue piping, never source body pixels."""
    rows, cols = np.indices((CANVAS[1], CANVAS[0]))
    r, g, b, a = (source[..., index].astype(np.int16) for index in range(4))
    fabric = (b >= r - 16) & (b >= g - 6) & (r < 105) & (g < 120) & (b < 150)
    orange_piping = (r > 125) & (g < 115) & (b < 95)
    blue_piping = (b > r + 12) & (b > g + 4) & (r < 105) & (g < 145)
    envelope = (rows >= 278) & (rows < SHOE_LOCK_Y) & (cols >= 86) & (cols <= 170)
    return (a > 8) & envelope & (fabric | orange_piping | blue_piping)


def compose_colorblock() -> Image.Image:
    result = np.asarray(canonical_underlay()).copy()
    source = source_rgba()
    mask = colorblock_garment_mask(source)
    result[mask] = source[mask]
    result[result[..., 3] <= 8, :3] = 0
    result[result[..., 3] <= 8, 3] = 0
    return Image.fromarray(result)
