"""Generate the onboarding scan laser textures.

The laser is built from smooth light falloffs (a hot core, a saturated inner
glow and a wide bloom) instead of a painted stroke, so it reads as light at
any size. Run from apps/mobile:

    python3 scripts/generate-scan-laser-textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

OUT_DIR = Path("src/features/session/assets/onboarding-scan-laser-v4")

HOT_WHITE = np.array([255, 246, 249], dtype=np.float64)
LASER_PINK = np.array([255, 52, 104], dtype=np.float64)
BRAND_PINK = np.array([232, 58, 96], dtype=np.float64)
SOFT_PINK = np.array([255, 128, 162], dtype=np.float64)

# Display sizes in points; textures are drawn at roughly 4x for @3x screens.
BEAM_POINTS = (268, 24)
BEAM_PIXELS = (1608, 144)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smooth_noise(length, seed, knots=14, amount=0.08):
    """Low-frequency 1D noise so the beam's intensity drifts organically."""
    rng = np.random.default_rng(seed)
    points = rng.uniform(-1.0, 1.0, knots)
    positions = np.linspace(0, length - 1, knots)
    values = np.interp(np.arange(length), positions, points)
    kernel = np.hanning(max(3, length // knots))
    kernel /= kernel.sum()
    padded = np.pad(values, len(kernel), mode="edge")
    smoothed = np.convolve(padded, kernel, mode="same")[len(kernel):-len(kernel)]
    return 1.0 + amount * smoothed


def composite(layers, height, width):
    """Stack (alpha, rgb) light layers back to front with "over" blending."""
    color = np.zeros((height, width, 3))
    alpha = np.zeros((height, width))
    for layer_alpha, rgb in layers:
        a = np.clip(layer_alpha, 0.0, 1.0)
        color = rgb * a[..., None] + color * (1.0 - a[..., None])
        alpha = a + alpha * (1.0 - a)
    straight = np.where(alpha[..., None] > 1e-4, color / np.maximum(alpha[..., None], 1e-4), 0.0)
    straight = np.clip(straight, 0, 255)
    return np.dstack([straight, np.clip(alpha, 0, 1) * 255]).astype(np.uint8)


def write(name, rgba):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(OUT_DIR / name, optimize=True)


def beam():
    width, height = BEAM_PIXELS
    scale = width / BEAM_POINTS[0]
    x = np.linspace(0.0, 1.0, width)[None, :]
    y = (np.arange(height)[:, None] - (height - 1) / 2.0) / scale
    # A real line laser is even along its length and dies off quickly at the ends.
    taper = smoothstep(0.0, 0.07, x) * smoothstep(0.0, 0.07, 1.0 - x)
    drift = smooth_noise(width, seed=7, amount=0.05)[None, :]
    # Fine grain along the core: the speckle every real laser line has.
    speckle = smooth_noise(width, seed=11, knots=220, amount=0.14)[None, :]
    energy = taper * drift
    layers = [
        (0.07 * np.exp(-np.abs(y) / 3.5) * taper, BRAND_PINK),
        (0.30 * np.exp(-(y / 1.6) ** 2) * energy, LASER_PINK),
        (0.95 * np.exp(-(y / 0.55) ** 2) * energy * speckle, LASER_PINK),
        (1.0 * np.exp(-(y / 0.22) ** 2) * np.minimum(1.0, energy * speckle * 1.1), HOT_WHITE),
    ]
    write("scan_laser_beam.png", composite(layers, height, width))


def curtain():
    """The faint sheet of light the beam leaves behind as it scans."""
    width, height = 256, 192
    x = np.linspace(0.0, 1.0, width)[None, :]
    y = np.linspace(0.0, 1.0, height)[:, None]
    taper = smoothstep(0.0, 0.2, x) * smoothstep(0.0, 0.2, 1.0 - x)
    falloff = y ** 2.6
    alpha = 0.12 * falloff * taper
    write("scan_laser_curtain.png", composite([(alpha, SOFT_PINK)], height, width))


if __name__ == "__main__":
    beam()
    curtain()
