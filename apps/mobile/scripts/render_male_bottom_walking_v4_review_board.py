#!/usr/bin/env python3
"""Render a focused walking contact board for the two V4 replacements."""

from pathlib import Path

from PIL import Image, ImageDraw

import repair_male_bottom_motion_pose_native_v4 as v4


ROOT = v4.REPO_ROOT
OUTPUT = v4.EVIDENCE / "straight-trouser-walking-v4-review-board.png"


def produce() -> None:
    board = Image.new("RGB", (1450, 850), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((24, 18), "STRAIGHT TROUSERS · WALKING V4", font=v4.v3.v2._font(28, True), fill="#382c37")
    draw.text((24, 56), "shoe-owned hem · per-leg taper · candidate only · runtime unchanged", font=v4.v3.v2._font(18), fill="#796976")
    states = v4.WALK_STATES
    for row, slug in enumerate(sorted(v4.TARGETS)):
        item = next(candidate for candidate in v4.ITEMS if candidate.slug == slug)
        y = 100 + row * 360
        draw.text((24, y), slug, font=v4.v3.v2._font(19, True), fill="#382c37")
        for col, state in enumerate(states):
            frame = v4.build_frame(item, state)
            composite = v4.v3.v2._compose(item, state, frame)
            panel = composite.crop((72, 270, 184, 354)).resize((280, 210), Image.Resampling.NEAREST)
            bg = v4.v3.v2._checker(panel.size)
            bg.alpha_composite(panel)
            x = 24 + col * 285
            board.paste(bg.convert("RGB"), (x, y + 32))
            draw.text((x + 8, y + 38), f"WALK {state[-2:]}", font=v4.v3.v2._font(13, True), fill="#5b4050")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    board.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    produce()
