"""Normalize generated Blumi run-cycle sheets without promoting them to runtime.

The source sheets are review candidates. This script only performs deterministic
cell extraction, uniform scaling and anchor normalization; it does not invent,
interpolate, mirror or reorder poses.
"""

import json
from collections import deque
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


MOBILE_ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_ROOT = (
    MOBILE_ROOT / "artifacts/onboarding-intro-v3/run-cycle-candidates"
)
SOURCES = {
    "female": CANDIDATE_ROOT / "female-run-cycle-candidate-v1.png",
    "male": CANDIDATE_ROOT / "male-run-cycle-candidate-v2-alpha.png",
}
WAVE_CANDIDATE_ROOT = (
    MOBILE_ROOT / "artifacts/onboarding-intro-v3/wave-cycle-candidates"
)
WAVE_SOURCES = {
    "female": WAVE_CANDIDATE_ROOT / "female-wave-cycle-candidate-v2.png",
    "male": WAVE_CANDIDATE_ROOT / "male-wave-cycle-candidate-v1.png",
}
CANVAS_SIZE = (256, 384)
FRAME_COUNT = 6
FOOT_BASELINE_Y = 360
MAX_VISIBLE_SIZE = (224, 326)
MIN_ALPHA_COMPONENT_AREA = 160


def split_sheet(sheet: Image.Image, role: str) -> list[Image.Image]:
    if "A" not in sheet.getbands() or sheet.getchannel("A").getextrema()[0] == 255:
        raise ValueError(f"{role} sheet must use genuine transparent RGBA pixels")
    if sheet.width < FRAME_COUNT:
        raise ValueError(f"{role} sheet must contain six cells")
    # Generated review sheets can carry a few remainder pixels. Fractional
    # boundaries preserve the six authored poses without stretching a cell.
    boundaries = [round(index * sheet.width / FRAME_COUNT) for index in range(7)]
    return [
        sheet.crop((boundaries[index], 0, boundaries[index + 1], sheet.height))
        for index in range(FRAME_COUNT)
    ]


def alpha_bounds(image: Image.Image, role: str, index: int) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"{role} frame {index + 1} is fully transparent")
    return bounds


def alpha_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    remaining = mask.copy()
    components: list[list[tuple[int, int]]] = []
    height, width = remaining.shape
    for row, col in zip(*np.where(remaining)):
        if not remaining[row, col]:
            continue
        component: list[tuple[int, int]] = []
        queue = deque([(int(row), int(col))])
        remaining[row, col] = False
        while queue:
            current_row, current_col = queue.popleft()
            component.append((current_row, current_col))
            for row_delta, col_delta in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row = current_row + row_delta
                next_col = current_col + col_delta
                if (
                    0 <= next_row < height
                    and 0 <= next_col < width
                    and remaining[next_row, next_col]
                ):
                    remaining[next_row, next_col] = False
                    queue.append((next_row, next_col))
        components.append(component)
    return components


def remove_alpha_specks(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] <= 24] = 0
    for component in alpha_components(pixels[..., 3] > 24):
        if len(component) >= MIN_ALPHA_COMPONENT_AREA:
            continue
        rows, cols = zip(*component)
        pixels[np.asarray(rows), np.asarray(cols)] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def normalize_frames(frames: Iterable[Image.Image], role: str) -> list[Image.Image]:
    rgba_frames = [remove_alpha_specks(frame) for frame in frames]
    bounds = [alpha_bounds(frame, role, index) for index, frame in enumerate(rgba_frames)]
    max_width = max(right - left for left, _, right, _ in bounds)
    max_height = max(bottom - top for _, top, _, bottom in bounds)
    scale = min(
        MAX_VISIBLE_SIZE[0] / max_width,
        MAX_VISIBLE_SIZE[1] / max_height,
    )
    resampling = getattr(Image, "Resampling", Image).LANCZOS
    normalized: list[Image.Image] = []

    for frame, (left, top, right, bottom) in zip(rgba_frames, bounds):
        visible = frame.crop((left, top, right, bottom))
        target_size = (
            max(1, round(visible.width * scale)),
            max(1, round(visible.height * scale)),
        )
        resized = visible.resize(target_size, resampling)
        canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        x = (CANVAS_SIZE[0] - resized.width) // 2
        resized_alpha = np.asarray(resized)[..., 3]
        visible_rows = np.where(resized_alpha > 24)[0]
        if not len(visible_rows):
            raise ValueError(f"{role} frame lost visible alpha during normalization")
        y = FOOT_BASELINE_Y - int(visible_rows.max())
        canvas.alpha_composite(resized, (x, y))

        canvas = remove_alpha_specks(canvas)
        pixels = np.asarray(canvas).copy()
        pixels[pixels[..., 3] == 0, :3] = 0
        normalized.append(Image.fromarray(pixels))

    return normalized


def prepare_candidates(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    role_reports: dict[str, object] = {}

    for role, source_path in SOURCES.items():
        with Image.open(source_path) as source:
            frames = normalize_frames(split_sheet(source.convert("RGBA"), role), role)
        for index, frame in enumerate(frames, start=1):
            frame.save(
                output / f"blumi_intro_run_{role}_f{index:02}.png",
                optimize=True,
            )
        role_reports[role] = {
            "source": str(source_path.relative_to(MOBILE_ROOT)),
            "frames": len(frames),
            "footBaselineY": FOOT_BASELINE_Y,
        }

    manifest: dict[str, object] = {
        "contract": "blumi-onboarding-run-candidate-v1",
        "status": "candidate-only",
        "runtimePromotionAllowed": False,
        "frameCountPerRole": FRAME_COUNT,
        "canvas": list(CANVAS_SIZE),
        "roles": role_reports,
        "blockingReason": (
            "Requires independent continuity review, native motion evidence and "
            "explicit user approval before runtime promotion."
        ),
    }
    (output / "candidate-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def prepare_wave_candidates(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    role_reports: dict[str, object] = {}

    for role, source_path in WAVE_SOURCES.items():
        with Image.open(source_path) as source:
            frames = normalize_frames(split_sheet(source.convert("RGBA"), role), role)
        for index, frame in enumerate(frames, start=1):
            frame.save(
                output / f"blumi_intro_wave_{role}_f{index:02}.png",
                optimize=True,
            )
        role_reports[role] = {
            "source": str(source_path.relative_to(MOBILE_ROOT)),
            "frames": len(frames),
            "footBaselineY": FOOT_BASELINE_Y,
        }

    manifest: dict[str, object] = {
        "contract": "blumi-onboarding-wave-candidate-v1",
        "status": "candidate-only",
        "runtimePromotionAllowed": False,
        "frameCountPerRole": FRAME_COUNT,
        "canvas": list(CANVAS_SIZE),
        "roles": role_reports,
        "blockingReason": (
            "Requires independent continuity review, native motion evidence and "
            "explicit user approval before runtime promotion."
        ),
    }
    (output / "candidate-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    prepare_candidates(CANDIDATE_ROOT / "normalized")
    prepare_wave_candidates(WAVE_CANDIDATE_ROOT / "normalized")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
