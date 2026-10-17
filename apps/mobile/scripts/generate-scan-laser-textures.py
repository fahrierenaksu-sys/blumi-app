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

HOT_WHITE = np.array([255, 244, 248], dtype=np.float64)
HOT_PINK = np.array([255, 92, 132], dtype=np.float64)
BRAND_PINK = np.array([232, 58, 96], dtype=np.float64)
SOFT_PINK = np.array([255, 128, 162], dtype=np.float64)

# Display sizes in points; textures are drawn at roughly 4x for @3x screens.
BEAM_POINTS = (268, 34)
BEAM_PIXELS = (1072, 136)


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
    # Bright in the middle, tapering to fine points at the emitters.
    taper = smoothstep(0.0, 0.16, x) * smoothstep(0.0, 0.16, 1.0 - x)
    centre = 0.78 + 0.22 * np.exp(-((x - 0.5) / 0.34) ** 2)
    drift = smooth_noise(width, seed=7)[None, :]
    energy = taper * centre * drift
    core_width = 0.35 + 0.5 * taper
    layers = [
        (0.14 * np.exp(-np.abs(y) / 9.0) * taper, BRAND_PINK),
        (0.42 * np.exp(-(y / 6.0) ** 2) * energy, BRAND_PINK),
        (0.78 * np.exp(-(y / (1.9 * core_width)) ** 2) * energy, HOT_PINK),
        (0.98 * np.exp(-(y / (0.62 * core_width)) ** 2) * np.minimum(1.0, energy * 1.15), HOT_WHITE),
    ]
    write("scan_laser_beam.png", composite(layers, height, width))


def curtain():
    """The faint sheet of light the beam leaves behind as it scans."""
    width, height = 256, 192
    x = np.linspace(0.0, 1.0, width)[None, :]
    y = np.linspace(0.0, 1.0, height)[:, None]
    taper = smoothstep(0.0, 0.2, x) * smoothstep(0.0, 0.2, 1.0 - x)
    falloff = y ** 2.6
    lines = 0.82 + 0.18 * (0.5 + 0.5 * np.cos(np.arange(height)[:, None] * 2 * np.pi / 6.0))
    alpha = 0.24 * falloff * taper * lines
    write("scan_laser_curtain.png", composite([(alpha, SOFT_PINK)], height, width))


def flare():
    """A round hotspot with a thin anamorphic streak."""
    size = 256
    axis = np.linspace(-1.0, 1.0, size)
    dx, dy = np.meshgrid(axis, axis)
    r = np.hypot(dx, dy)
    edge = smoothstep(1.0, 0.82, r)
    streak = np.exp(-(dy / 0.03) ** 2) * np.exp(-np.abs(dx) / 0.38) * smoothstep(1.0, 0.7, np.abs(dx))
    layers = [
        (0.42 * np.exp(-(r / 0.42) ** 2) * edge, BRAND_PINK),
        (0.85 * streak, HOT_PINK),
        (0.9 * np.exp(-(r / 0.16) ** 2), HOT_PINK),
        (1.0 * np.exp(-(r / 0.07) ** 2), HOT_WHITE),
    ]
    write("scan_laser_flare.png", composite(layers, size, size))


if __name__ == "__main__":
    beam()
    curtain()
    flare()
