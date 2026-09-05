#!/usr/bin/env python3
"""Package a 6x5 Blumi arrival sheet into 30 fixed-pivot RGBA frames."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


COLS = 6
ROWS = 5
FRAME_SIZE = (256, 384)
BACKGROUND_MIN = 225
BACKGROUND_CHANNEL_SPREAD = 10
RUN_HANDOFF_BASELINE_Y = 380
RUN_HANDOFF_TAIL_START_INDEX = 22
RUN_HANDOFF_SCALE = {
    "female": 0.802,
    "male": 1.092,
}


def build_runtime_atlas(frames: list[Image.Image]) -> Image.Image:
    if len(frames) != COLS * ROWS:
        raise ValueError(f"Expected {COLS * ROWS} frames, got {len(frames)}")
    atlas = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * COLS, FRAME_SIZE[1] * ROWS),
        (0, 0, 0, 0),
    )
    for index, frame in enumerate(frames):
        if frame.size != FRAME_SIZE or frame.mode != "RGBA":
            raise ValueError(
                f"Frame {index + 1} must be {FRAME_SIZE[0]}x{FRAME_SIZE[1]} RGBA"
            )
        atlas.alpha_composite(
            frame,
            ((index % COLS) * FRAME_SIZE[0], (index // COLS) * FRAME_SIZE[1]),
        )
    return atlas


def _looks_like_checker(pixel: tuple[int, int, int]) -> bool:
    return min(pixel) >= BACKGROUND_MIN and max(pixel) - min(pixel) <= BACKGROUND_CHANNEL_SPREAD


def remove_connected_checker_background(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    source = rgb.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not _looks_like_checker(source[x, y]):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    rgba = rgb.convert("RGBA")
    output = rgba.load()
    for y in range(height):
        offset = y * width
        for x in range(width):
            if visited[offset + x]:
                r, g, b, _ = output[x, y]
                output[x, y] = (r, g, b, 0)
    return rgba


def _foreground_components(sheet: Image.Image) -> list[tuple[int, int, int, int]]:
    alpha = sheet.getchannel("A")
    width, height = sheet.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] == 0:
                continue
            visited[index] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            count = 0
            left = right = x
            top = bottom = y
            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            if count >= 500:
                components.append((left, top, right + 1, bottom + 1, count))

    if len(components) != COLS * ROWS:
        raise ValueError(f"Expected 30 connected character poses, got {len(components)}")

    # The generator spaces rows unevenly, so sorting all centroids globally can
    # scramble row-major order. Group the six nearest vertical centers first.
    by_vertical_center = sorted(components, key=lambda item: (item[1] + item[3]) / 2)
    ordered: list[tuple[int, int, int, int]] = []
    for row in range(ROWS):
        row_components = by_vertical_center[row * COLS:(row + 1) * COLS]
        row_components.sort(key=lambda item: (item[0] + item[2]) / 2)
        ordered.extend((left, top, right, bottom) for left, top, right, bottom, _ in row_components)
    return ordered


def split_fixed_pivot_frames(sheet: Image.Image, role: str) -> list[Image.Image]:
    bounds = _foreground_components(sheet)
    max_width = max(right - left for left, _, right, _ in bounds)
    max_height = max(bottom - top for _, top, _, bottom in bounds)
    scale = 0.88 * min(FRAME_SIZE[0] / max_width, FRAME_SIZE[1] / max_height)
    frames: list[Image.Image] = []
    for index, (left, top, right, bottom) in enumerate(bounds):
        pose = sheet.crop((left, top, right, bottom))
        resized = pose.resize(
            (round(pose.width * scale), round(pose.height * scale)),
            Image.Resampling.LANCZOS,
        )
        if index >= RUN_HANDOFF_TAIL_START_INDEX:
            tail_progress = (
                (index - RUN_HANDOFF_TAIL_START_INDEX)
                / ((COLS * ROWS - 1) - RUN_HANDOFF_TAIL_START_INDEX)
            )
            role_scale = 1 + (RUN_HANDOFF_SCALE[role] - 1) * tail_progress
            resized = resized.resize(
                (
                    max(1, round(resized.width * role_scale)),
                    max(1, round(resized.height * role_scale)),
                ),
                Image.Resampling.LANCZOS,
            )
        frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
        y = (
            RUN_HANDOFF_BASELINE_Y - resized.height
            if index >= RUN_HANDOFF_TAIL_START_INDEX
            else (FRAME_SIZE[1] - resized.height) // 2
        )
        frame.alpha_composite(
            resized,
            ((FRAME_SIZE[0] - resized.width) // 2, y),
        )
        frames.append(frame)
    return frames


def package_role(source: Path, output_dir: Path, role: str) -> None:
    cleaned = remove_connected_checker_background(Image.open(source))
    frames = split_fixed_pivot_frames(cleaned, role)
    if len(frames) != 30:
        raise ValueError(f"Expected 30 {role} frames, got {len(frames)}")
    for index, frame in enumerate(frames, start=1):
        alpha = frame.getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError(f"{role} frame {index} is empty")
        if bounds[0] <= 0 or bounds[1] <= 0 or bounds[2] >= FRAME_SIZE[0] or bounds[3] >= FRAME_SIZE[1]:
            raise ValueError(f"{role} frame {index} touches the canvas edge: {bounds}")
        frame.save(output_dir / f"blumi_intro_arrival_{role}_f{index:02d}.png", optimize=True)
    build_runtime_atlas(frames).save(
        output_dir / f"blumi_intro_arrival_{role}_atlas.png",
        optimize=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--female-sheet", type=Path, required=True)
    parser.add_argument("--male-sheet", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    package_role(args.female_sheet, args.output_dir, "female")
    package_role(args.male_sheet, args.output_dir, "male")


if __name__ == "__main__":
    main()
