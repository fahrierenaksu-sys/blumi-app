#!/usr/bin/env python3
"""Build candidate-only 4W+1S motion for the three user-approved male tops.

Each product uses its own approved static layer and an existing same-family male
top as pose authority. Outputs stay outside runtime until independent visual QA.
"""

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
OUTPUT_ROOT = REDESIGN / "replacement-tops-motion-v1"
BOARD = REDESIGN / "male-replacement-tops-motion-v1-review-board.png"
MANIFEST = REDESIGN / "male-replacement-tops-motion-v1-manifest.json"
CANVAS = (256, 384)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


@dataclass(frozen=True)
class MotionItem:
    slug: str
    family: str
    authority_slug: str
    approval_record: Path

    @property
    def static_path(self) -> Path:
        return (
            REDESIGN
            / "candidates/top"
            / self.slug
            / "rig/static-review-fit-locked-v2.png"
        )

    def authority_motion_path(self, state: str) -> Path:
        return (
            RUNTIME_MOTION
            / f"room_avatar_top_male_{self.authority_slug}_v1_{state}.png"
        )

    @property
    def output_directory(self) -> Path:
        return OUTPUT_ROOT / self.slug


ITEMS = (
    MotionItem(
        slug="fog_blue_relaxed_hoodie",
        family="hoodie_or_sweat_closed_neck",
        authority_slug="acid_washed_boxy_sweatshirt",
        approval_record=REDESIGN / "fog-blue-relaxed-hoodie-user-approval-v2.json",
    ),
    MotionItem(
        slug="indigo_denim_relaxed_workshirt",
        family="shirt_open_camp_collar",
        authority_slug="soft_sage_linen_shirt",
        approval_record=REDESIGN / "indigo-denim-relaxed-workshirt-user-approval.json",
    ),
    MotionItem(
        slug="oatmeal_fine_gauge_crewneck",
        family="tshirt_closed_crew",
        authority_slug="cream_basic_tee",
        approval_record=REDESIGN / "oatmeal-fine-gauge-crewneck-user-approval.json",
    ),
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, received {image.size}")
    return _clean(image)


def approval_matches_static(item: MotionItem) -> bool:
    record = json.loads(item.approval_record.read_text(encoding="utf-8"))
    return (
        record.get("verdict") == "USER_APPROVED"
        and record.get("candidatePath") == _relative(item.static_path)
        and record.get("candidateSha256") == _sha256(item.static_path)
    )


def _fit_to_authority(source: Image.Image, authority: Image.Image) -> Image.Image:
    source_bbox = source.getchannel("A").getbbox()
    target_bbox = authority.getchannel("A").getbbox()
    if source_bbox is None or target_bbox is None:
        raise ValueError("motion source and authority must contain visible pixels")
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


def build_frame(item: MotionItem, state: str) -> Image.Image:
    if state not in STATES:
        raise ValueError(f"unsupported state: {state}")
    if not approval_matches_static(item):
        raise ValueError(f"{item.slug}: static layer is not bound to current user approval")
    source = _load(item.static_path)
    if state == "walking_front_f01":
        return source.copy()
    return _fit_to_authority(source, _load(item.authority_motion_path(state)))


def _motion_path(name: str, state: str) -> Path:
    return RUNTIME_MOTION / f"room_avatar_{name}_{state}.png"


def _compose(item: MotionItem, state: str, top: Image.Image) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layers = (
        _load(_motion_path("base_male_light_v1", state)),
        _load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        _load(_motion_path("bottom_male_navy_straight_pants_v1", state)),
        _load(_motion_path("shoes_male_milk_tea_court_v1", state)),
        top,
        _load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    for layer in layers:
        output = Image.alpha_composite(output, layer)
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
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, x + 11, y + 11), fill=(228, 224, 228, 255))
    return output


def _review_board(frames: dict[str, dict[str, Image.Image]]) -> None:
    cell_width, row_height = 240, 330
    board = Image.new(
        "RGBA",
        (cell_width * len(STATES), row_height * len(ITEMS)),
        (255, 248, 251, 255),
    )
    draw = ImageDraw.Draw(board)
    for row, item in enumerate(ITEMS):
        draw.text(
            (12, row * row_height + 10),
            f"{item.slug} · {item.family}",
            font=_font(15, True),
            fill=(56, 38, 48, 255),
        )
        for column, state in enumerate(STATES):
            composite = _compose(item, state, frames[item.slug][state])
            preview = composite.resize((160, 240), Image.Resampling.LANCZOS)
            background = _checkerboard(preview.size)
            background.alpha_composite(preview)
            x = column * cell_width + 40
            y = row * row_height + 48
            board.alpha_composite(background, (x, y))
            draw.text(
                (column * cell_width + 16, row * row_height + 294),
                state.replace("_front_", " "),
                font=_font(11, True),
                fill=(76, 52, 64, 255),
            )
    board.convert("RGB").save(BOARD, optimize=True)


def produce() -> dict:
    frames_by_item: dict[str, dict[str, Image.Image]] = {}
    records = []
    for item in ITEMS:
        if not approval_matches_static(item):
            raise ValueError(f"{item.slug}: approval hash mismatch")
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
                "family": item.family,
                "staticApproval": _relative(item.approval_record),
                "staticSha256": _sha256(item.static_path),
                "poseAuthority": item.authority_slug,
                "frames": files,
            }
        )
    _review_board(frames_by_item)
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
        "reviewBoard": {"path": _relative(BOARD), "sha256": _sha256(BOARD)},
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    print(json.dumps(produce(), indent=2))
