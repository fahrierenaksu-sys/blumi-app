#!/usr/bin/env python3
"""Package a candidate-only seated layer from the approved on-base master.

This keeps the seated master at its native 4x registration.  It deliberately
does not borrow a standing silhouette or reshape each leg into a generic mask.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
MOTION = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room/motion"
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
EVIDENCE = REPO_ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6/family-specific-extraction-v1"
)
MASTER = REPO_ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6/family-specific-extraction-v1/"
    "warm-sand-relaxed-pants-on-base-master-v3-1024.png"
)
SHOES = MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
OUTPUT = EVIDENCE / "room_avatar_bottom_male_warm_sand_relaxed_pants_v1_sitting_front_f01-candidate-v2.png"
COMPOSITE = EVIDENCE / "warm-sand-relaxed-pants-canonical-sitting-v2.png"
CONTACT = EVIDENCE / "warm-sand-relaxed-pants-canonical-sitting-v2-contact.png"


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def _keep_largest_component(mask: np.ndarray) -> np.ndarray:
    """Remove detached antialias islands from an otherwise atomic garment."""
    seen = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for row, col in zip(*np.where(mask & ~seen)):
        if seen[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        seen[row, col] = True
        component: list[tuple[int, int]] = []
        while queue:
            current_row, current_col = queue.popleft()
            component.append((current_row, current_col))
            for delta_row, delta_col in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row = current_row + delta_row
                next_col = current_col + delta_col
                if (
                    0 <= next_row < mask.shape[0]
                    and 0 <= next_col < mask.shape[1]
                    and mask[next_row, next_col]
                    and not seen[next_row, next_col]
                ):
                    seen[next_row, next_col] = True
                    queue.append((next_row, next_col))
        components.append(component)

    cleaned = np.zeros_like(mask, dtype=bool)
    if components:
        rows, cols = zip(*max(components, key=len))
        cleaned[np.asarray(rows), np.asarray(cols)] = True
    return cleaned


def _remove_master_background_and_source_shoes(pixels: np.ndarray) -> np.ndarray:
    """Keep only the master’s native seated trouser pixels.

    The full master is 4x the runtime canvas, so a single high-quality resize
    preserves its authored pose.  Its warm-sand material has a distinct
    reddish-gold relationship that is separate from the blue top and white
    backdrop; extraction is deliberately item-specific rather than generic.
    """
    rows, cols = np.indices(pixels.shape[:2])
    rgb = pixels[..., :3]
    lower_body = (rows >= 280) & (rows <= 335) & (cols >= 72) & (cols <= 184)
    red, green, blue = (rgb[..., index].astype(np.int16) for index in range(3))
    warm_sand = (red >= 145) & (red >= green + 8) & (green >= blue + 8)
    material = lower_body & warm_sand

    # The on-base master contains the seated arms beside the relaxed thighs.
    # They can share the garment's warm palette, so color alone is not a safe
    # separator.  In this fixed sitting frame the hands/forearms own the two
    # outer side zones; remove those pixels from the atomic bottom layer.
    side_arm_zone = (rows >= 280) & (rows <= 326) & ((cols <= 91) | (cols >= 164))
    material[side_arm_zone] = False

    # At the first visible waist rows the bottom must meet the canonical tee,
    # not flare out from behind it.  The relaxed volume is then introduced
    # progressively over the seated hips instead of appearing as a pasted
    # rectangle.  This envelope is specific to the approved male sitting base.
    waist_progress = np.clip((rows - 289) / 11, 0, 1)
    left_waist = 103 - np.rint(11 * waist_progress).astype(np.int16)
    right_waist = 153 + np.rint(10 * waist_progress).astype(np.int16)
    waist_transition = (rows > 300) | ((cols >= left_waist) & (cols <= right_waist))
    material &= waist_transition

    shoes = np.asarray(load(SHOES))[..., 3] > 24
    material[shoes] = False

    # This relaxed item uses a narrow bottomOverShoeUpper contact role.  The
    # cuff descends at each shoe's inner/outer side while the central tongue
    # and laces remain owned by the canonical shoe layer.  The pixels come
    # from the newly illustrated on-base master; only their visibility is
    # selected here.
    cuff_overlap = np.zeros_like(material)
    for center, start, end in ((110, 92, 128), (146, 128, 166)):
        distance = np.abs(cols - center) / max(center - start, end - center)
        cuff_limit = 333 + np.rint(2 * np.clip(distance, 0, 1)).astype(np.int16)
        cuff_overlap |= (
            (cols >= start)
            & (cols < end)
            & (rows >= 329)
            & (rows <= cuff_limit)
        )
    material |= cuff_overlap & warm_sand
    material = _keep_largest_component(material)

    output = np.zeros_like(pixels)
    output[material] = pixels[material]
    output[output[..., 3] == 0, :3] = 0
    return output


def build_candidate() -> Image.Image:
    master = load(MASTER).resize((256, 384), Image.Resampling.LANCZOS)
    return Image.fromarray(_remove_master_background_and_source_shoes(np.asarray(master).copy()))


def _compose(candidate: Image.Image) -> Image.Image:
    result = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    for layer in (
        load(MOTION / "room_avatar_base_male_light_v1_sitting_front_f01.png"),
        load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        load(SHOES),
        candidate,
        load(MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"),
        load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    ):
        result.alpha_composite(layer)
    return result


def produce() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    candidate = build_candidate()
    candidate.save(OUTPUT, optimize=True)
    composite = _compose(candidate)
    composite.save(COMPOSITE, optimize=True)
    composite.crop((70, 282, 186, 352)).resize((696, 420), Image.Resampling.NEAREST).save(CONTACT, optimize=True)


if __name__ == "__main__":
    produce()
