#!/usr/bin/env python3
"""Refresh candidate-only 4W+1S motion from the current 19 male bottom statics."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
RUNTIME_MOTION = ROOM / "motion"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
OUTPUT_ROOT = REDESIGN / "bottom-motion-refresh-v1"
OVERVIEW_BOARD = REDESIGN / "male-bottom-motion-refresh-v1-overview-board.png"
CONTACT_BOARD = REDESIGN / "male-bottom-motion-refresh-v1-contact-board.png"
MANIFEST = REDESIGN / "male-bottom-motion-refresh-v1-manifest.json"
CANVAS = (256, 384)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class BottomItem:
    slug: str

    @property
    def static_path(self) -> Path:
        if self.slug == "creative_utility_bottom":
            return (
                REDESIGN
                / "candidates/bottom/creative_utility_bottom/rig/"
                "static-review-edge-clean-v2.png"
            )
        return ROOM / f"avatar_room_bottom_male_{self.slug}_v1.png"

    def authority_path(self, state: str) -> Path:
        return RUNTIME_MOTION / f"room_avatar_bottom_male_{self.slug}_v1_{state}.png"

    @property
    def output_directory(self) -> Path:
        return OUTPUT_ROOT / self.slug


ITEMS = tuple(
    BottomItem(slug)
    for slug in (
        "sage_cuffed_shorts",
        "navy_straight_pants",
        "mid_blue_straight_jeans",
        "charcoal_tapered_chinos",
        "warm_sand_relaxed_pants",
        "wide_pleated_technical_trousers",
        "straight_utility_tailored_trousers",
        "midnight_relaxed_tailoring_trousers",
        "warm_sand_deconstructed_trousers",
        "monochrome_street_tailoring_bottom",
        "modern_track_luxury_bottom",
        "contemporary_resort_street_bottom",
        "creative_utility_bottom",
        "relaxed_tailored_shorts",
        "refined_utility_cargo_shorts",
        "technical_sport_shorts",
        "washed_baggy_denim",
        "soft_parachute_cargo_pants",
        "colorblock_nylon_track_pants",
    )
)


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, received {image.size}")
    return _clean(image)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _fit_to_pose(source: Image.Image, authority: Image.Image) -> Image.Image:
    source_bbox = source.getchannel("A").getbbox()
    target_bbox = authority.getchannel("A").getbbox()
    if source_bbox is None or target_bbox is None:
        raise ValueError("bottom source and pose authority must be visible")
    source_width = source_bbox[2] - source_bbox[0]
    source_height = source_bbox[3] - source_bbox[1]
    target_width = target_bbox[2] - target_bbox[0]
    target_height = target_bbox[3] - target_bbox[1]
    scale_x = target_width / source_width
    scale_y = target_height / source_height
    offset_x = target_bbox[0] - source_bbox[0] * scale_x
    offset_y = target_bbox[1] - source_bbox[1] * scale_y
    transformed = source.transform(
        CANVAS,
        Image.Transform.AFFINE,
        (
            1.0 / scale_x,
            0,
            -offset_x / scale_x,
            0,
            1.0 / scale_y,
            -offset_y / scale_y,
        ),
        Image.Resampling.BICUBIC,
    )
    pixels = np.asarray(transformed).copy()
    authority_alpha = np.asarray(authority.getchannel("A"))
    pixels[..., 3] = np.minimum(pixels[..., 3], authority_alpha)
    return _clean(Image.fromarray(pixels))


def _keep_largest_alpha_component(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image).copy()
    remaining = pixels[..., 3] > 0
    components: list[list[tuple[int, int]]] = []
    height, width = remaining.shape
    for y in range(height):
        for x in range(width):
            if not remaining[y, x]:
                continue
            component: list[tuple[int, int]] = []
            stack = [(y, x)]
            remaining[y, x] = False
            while stack:
                cy, cx = stack.pop()
                component.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < height and 0 <= nx < width and remaining[ny, nx]:
                        remaining[ny, nx] = False
                        stack.append((ny, nx))
            components.append(component)
    if not components:
        raise ValueError("motion frame contains no garment component")
    keep = set(max(components, key=len))
    for component in components:
        if set(component) == keep:
            continue
        for y, x in component:
            pixels[y, x] = 0
    return _clean(Image.fromarray(pixels))


def creative_gap_mask(item: BottomItem, state: str) -> np.ndarray:
    source = _load(item.static_path)
    source_bbox = source.getchannel("A").getbbox()
    if source_bbox is None:
        raise ValueError("creative utility static is empty")
    target_bbox = (
        source_bbox
        if state == "walking_front_f01"
        else _load(item.authority_path(state)).getchannel("A").getbbox()
    )
    if target_bbox is None:
        raise ValueError("creative utility pose authority is empty")
    scale_x = (target_bbox[2] - target_bbox[0]) / (source_bbox[2] - source_bbox[0])
    scale_y = (target_bbox[3] - target_bbox[1]) / (source_bbox[3] - source_bbox[1])
    offset_x = target_bbox[0] - source_bbox[0] * scale_x
    offset_y = target_bbox[1] - source_bbox[1] * scale_y
    source_points = ((124, 301), (132, 301), (144, 326), (112, 326))
    scale = 4
    points = [
        (
            int(round((x * scale_x + offset_x) * scale)),
            int(round((y * scale_y + offset_y) * scale)),
        )
        for x, y in source_points
    ]
    mask = Image.new("L", (CANVAS[0] * scale, CANVAS[1] * scale), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return np.asarray(mask.resize(CANVAS, Image.Resampling.LANCZOS))


def build_frame(item: BottomItem, state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    source = _load(item.static_path)
    if state == "walking_front_f01":
        return source.copy()
    frame = _fit_to_pose(source, _load(item.authority_path(state)))
    if item.slug != "creative_utility_bottom":
        return frame
    pixels = np.asarray(frame).copy()
    pixels[creative_gap_mask(item, state) > 0] = 0
    return _keep_largest_alpha_component(_clean(Image.fromarray(pixels)))


def _motion_path(name: str, state: str) -> Path:
    return RUNTIME_MOTION / f"room_avatar_{name}_{state}.png"


def _compose(item: BottomItem, state: str, bottom: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    base_layers = (
        _load(_motion_path("base_male_light_v1", state)),
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _load(_motion_path("top_male_powder_blue_crew_tee_v1", state)),
    )
    for layer in base_layers:
        output = Image.alpha_composite(output, layer)
    shoes = _load(_motion_path("shoes_male_milk_tea_court_v1", state))
    if item.slug == "charcoal_tapered_chinos":
        output = Image.alpha_composite(output, bottom)
        output = Image.alpha_composite(output, shoes)
    else:
        output = Image.alpha_composite(output, shoes)
        output = Image.alpha_composite(output, bottom)
    output = Image.alpha_composite(
        output,
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    return _clean(output)


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    path = f"/System/Library/Fonts/Supplemental/{'Arial Bold.ttf' if bold else 'Arial.ttf'}"
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def _checkerboard(size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGBA", size, (248, 246, 248, 255))
    draw = ImageDraw.Draw(output)
    for y in range(0, size[1], 10):
        for x in range(0, size[0], 10):
            if (x // 10 + y // 10) % 2:
                draw.rectangle((x, y, x + 9, y + 9), fill=(228, 224, 228, 255))
    return output


def _boards(frames_by_item: dict[str, dict[str, Image.Image]]) -> None:
    width, row_height = 1000, 280
    overview = Image.new("RGBA", (width, row_height * len(ITEMS)), (255, 248, 251, 255))
    contact = Image.new("RGBA", (width, row_height * len(ITEMS)), (255, 248, 251, 255))
    overview_draw = ImageDraw.Draw(overview)
    contact_draw = ImageDraw.Draw(contact)
    for row, item in enumerate(ITEMS):
        y0 = row * row_height
        for draw in (overview_draw, contact_draw):
            draw.text((10, y0 + 8), item.slug, font=_font(14, True), fill=(56, 38, 48, 255))
        for column, state in enumerate(STATES):
            composite = _compose(item, state, frames_by_item[item.slug][state])
            full = composite.resize((140, 210), Image.Resampling.LANCZOS)
            full_bg = _checkerboard(full.size)
            full_bg.alpha_composite(full)
            x = column * 200 + 30
            overview.alpha_composite(full_bg, (x, y0 + 36))
            crop = composite.crop((70, 272, 186, 356)).resize((174, 126), Image.Resampling.NEAREST)
            crop_bg = _checkerboard(crop.size)
            crop_bg.alpha_composite(crop)
            contact.alpha_composite(crop_bg, (column * 200 + 13, y0 + 62))
            label = state.replace("_front_", " ")
            overview_draw.text((column * 200 + 10, y0 + 252), label, font=_font(10, True), fill=(76, 52, 64, 255))
            contact_draw.text((column * 200 + 10, y0 + 204), label, font=_font(10, True), fill=(76, 52, 64, 255))
    overview.convert("RGB").save(OVERVIEW_BOARD, optimize=True)
    contact.convert("RGB").save(CONTACT_BOARD, optimize=True)


def produce() -> dict:
    frames_by_item: dict[str, dict[str, Image.Image]] = {}
    records = []
    for item in ITEMS:
        item.output_directory.mkdir(parents=True, exist_ok=True)
        frames = {state: build_frame(item, state) for state in STATES}
        frames_by_item[item.slug] = frames
        files = {}
        for state, frame in frames.items():
            destination = item.output_directory / f"{state}.png"
            frame.save(destination, optimize=True)
            files[state] = {"path": _relative(destination), "sha256": _sha256(destination)}
        records.append(
            {
                "slug": item.slug,
                "staticPath": _relative(item.static_path),
                "staticSha256": _sha256(item.static_path),
                "frames": files,
            }
        )
    _boards(frames_by_item)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "candidate_motion_pending_independent_review",
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "states": list(STATES),
        "candidateOnly": True,
        "runtimePromoted": False,
        "items": records,
        "reviewBoards": [
            {"path": _relative(OVERVIEW_BOARD), "sha256": _sha256(OVERVIEW_BOARD)},
            {"path": _relative(CONTACT_BOARD), "sha256": _sha256(CONTACT_BOARD)},
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
