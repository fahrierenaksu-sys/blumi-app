#!/usr/bin/env python3
"""Build candidate-only 4W+1S motion for the unresolved male wardrobe set.

The static layers are the exact layers selected by the canonical 66-item static
record.  Motion is retargeted against the same item's existing pose envelope:
the source pixels are never redrawn, pasted from an adult reference, or
promoted into runtime.  This script only emits versioned candidate evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
STATIC_RECORD = REDESIGN / "male-wardrobe-66-static-approval-record.json"
STATUS_SCRIPT = REPO_ROOT / "apps/mobile/scripts/male-wardrobe-redesign-status.mjs"
OUTPUT_ROOT = REDESIGN / "candidates"
REVIEW_ROOT = REDESIGN / "motion-refresh-v1"
CANVAS = (256, 384)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)

# These items already have current-static-bound 4W+1S candidate evidence.  The
# refresh must never overwrite them or silently downgrade their evidence.
CURRENT_ITEMS = frozenset(
    {
        "monochrome_street_tailoring_bottom",
        "creative_utility_bottom",
        "soft_parachute_cargo_pants",
        "colorblock_nylon_track_pants",
        "warm_sand_relaxed_pants",
        "midnight_relaxed_tailoring_trousers",
        "wide_pleated_technical_trousers",
        "navy_straight_pants",
        "mid_blue_straight_jeans",
        "charcoal_tapered_chinos",
        "milk_tea_court",
        "cloud_white_trainers",
        "cocoa_penny_loafers",
        "dusty_blue_canvas_sneakers",
        "retro_colorblock_runner",
        "chunky_skate_sneakers",
        "suede_penny_mules",
        "lightweight_trail_sneakers",
    }
)

# These four source layers were rejected by independent visual QA as cropped
# silhouettes. Their v5 re-illustrations are now the canonical static record;
# do not let an older status-ledger artifact win selection for this refresh.
STATIC_RECORD_AUTHORITATIVE_REBUILDS = frozenset(
    {
        "contemporary_resort_street_bottom",
        "modern_track_luxury_bottom",
        "straight_utility_tailored_trousers",
        "warm_sand_deconstructed_trousers",
    }
)

POSE_OFFSETS = {
    "walking_front_f01": (0, 0),
    "walking_front_f02": (-2, 1),
    "walking_front_f03": (2, -1),
    "walking_front_f04": (-1, 1),
    "sitting_front_f01": (0, 1),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()


def clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, received {image.size}")
    return clean(image)


def load_inventory() -> list[dict]:
    record = json.loads(STATIC_RECORD.read_text(encoding="utf-8"))
    if record.get("itemCount") != 66 or len(record.get("items", [])) != 66:
        raise ValueError("static record must describe exactly 66 items")
    live_static_paths: dict[str, str] = {}
    if STATUS_SCRIPT.is_file():
        status = subprocess.run(
            ["node", str(STATUS_SCRIPT)],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        status_items = json.loads(status.stdout).get("items", [])
        live_static_paths = {
            item["slug"]: item["states"]["static"]["path"]
            for item in status_items
            if item.get("states", {}).get("static", {}).get("path")
        }
    inventory = []
    for item in record["items"]:
        selected_path = (
            item["layerPath"]
            if item["slug"] in STATIC_RECORD_AUTHORITATIVE_REBUILDS
            else live_static_paths.get(item["slug"], item["layerPath"])
        )
        static_path = REPO_ROOT / selected_path
        if not static_path.is_file():
            raise FileNotFoundError(static_path)
        inventory.append(
            {
                **item,
                "layerPath": selected_path,
                "layerSha256": sha256(static_path),
                "static_path": static_path,
            }
        )
    return inventory


def _items_to_refresh() -> tuple[dict, ...]:
    inventory = load_inventory()
    return tuple(item for item in inventory if item["slug"] not in CURRENT_ITEMS)


MOTION_ITEMS = _items_to_refresh()


def _authority_path(item: dict, state: str) -> Path:
    category = item["category"]
    if category in {"top", "bottom"}:
        return MOTION / f"room_avatar_{category}_male_{item['slug']}_v1_{state}.png"
    return Path()


def _translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(image, (dx, dy))
    return clean(output)


def _fit_to_pose(source: Image.Image, authority: Image.Image) -> Image.Image:
    source_bbox = source.getchannel("A").getbbox()
    target_bbox = authority.getchannel("A").getbbox()
    if source_bbox is None or target_bbox is None:
        raise ValueError("source and pose authority must contain visible pixels")
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
    return clean(transformed)


def split_leg_frame(
    source: Image.Image,
    state: str,
    split_y: int,
    bottom_y: int,
) -> Image.Image:
    """Move lower left/right garment volumes without fusing the legs."""
    if state not in POSE_OFFSETS:
        raise ValueError(f"unsupported state: {state}")
    dx, dy = POSE_OFFSETS[state]
    left_dx = -dx if state != "sitting_front_f01" else -2
    right_dx = dx if state != "sitting_front_f01" else 2
    output = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    output.alpha_composite(source.crop((0, 0, 256, split_y)), (0, 0))
    output.alpha_composite(
        source.crop((78, split_y, 130, bottom_y)),
        (78 + left_dx, split_y + dy),
    )
    output.alpha_composite(
        source.crop((126, split_y, 178, bottom_y)),
        (126 + right_dx, split_y - dy),
    )
    return clean(output)


def _build_body_frame(item: dict, state: str) -> Image.Image:
    source = load(item["static_path"])
    if state == "static":
        return source
    authority_path = _authority_path(item, state)
    if not authority_path.is_file():
        raise FileNotFoundError(f"missing pose authority: {authority_path}")
    authority = load(authority_path)
    fitted = _fit_to_pose(source, authority)
    if item["category"] == "bottom":
        bbox = fitted.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"empty fitted bottom: {item['slug']}")
        # Keep the waistband/crotch hinge fixed and move only the lower leg
        # volumes by a small pose-specific offset. This preserves the approved
        # source gap instead of creating a single skirt-like mass.
        height = bbox[3] - bbox[1]
        split_y = bbox[1] + int(height * 0.56)
        fitted = split_leg_frame(fitted, state, split_y, min(360, bbox[3] + 2))
    return fitted


def build_frame(item: dict, state: str) -> Image.Image:
    if state == "static" or item["category"] in {"top", "bottom"}:
        return _build_body_frame(item, state)
    source = load(item["static_path"])
    if state == "static":
        return source
    dx, dy = POSE_OFFSETS[state]
    if item["category"] == "accessory" and item["slug"] == "nylon_crossbody_bag":
        return _translate(source, dx, dy)
    return source


def _motion_output_dir(item: dict) -> Path:
    return OUTPUT_ROOT / item["category"] / item["slug"] / "motion_v1"


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


def _motion_path(category: str, slug: str, state: str) -> Path:
    if category == "hair":
        return MOTION / f"room_avatar_hair_front_male_{slug}_v1_{state}.png"
    return MOTION / f"room_avatar_{category}_male_{slug}_v1_{state}.png"


def _pose_layer(name: str, state: str) -> Image.Image:
    return load(MOTION / f"room_avatar_{name}_{state}.png")


def compose(item: dict, state: str, candidate: Image.Image) -> Image.Image:
    category = item["category"]
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(_pose_layer("base_male_light_v1", state))
    result.alpha_composite(load(ROOM / "avatar_room_face_male_warm_friendly_v1.png"))
    if category == "top":
        result.alpha_composite(_pose_layer("bottom_male_navy_straight_pants_v1", state))
        result.alpha_composite(_pose_layer("shoes_male_milk_tea_court_v1", state))
    elif category == "bottom":
        result.alpha_composite(_pose_layer("top_male_powder_blue_crew_tee_v1", state))
        result.alpha_composite(_pose_layer("shoes_male_milk_tea_court_v1", state))
    elif category == "accessory":
        result.alpha_composite(_pose_layer("bottom_male_navy_straight_pants_v1", state))
        result.alpha_composite(_pose_layer("shoes_male_milk_tea_court_v1", state))
        result.alpha_composite(_pose_layer("top_male_powder_blue_crew_tee_v1", state))
    if category != "hair":
        result.alpha_composite(load(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"))
    # Hair/accessory layers sit above the face; clothing sits above the base
    # body but below hair. Bottoms intentionally sit over the shoe throat at
    # the hem so the composite reads as one outfit, never a shoe pasted on top.
    if category == "hair":
        result.alpha_composite(candidate)
    else:
        result.alpha_composite(candidate)
    return clean(result)


def _write_item_sheet(item: dict, frames: dict[str, Image.Image]) -> Path:
    output = _motion_output_dir(item)
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (5 * 220, 390), (255, 248, 251, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 10), f"{item['slug']} · {item['family']}", font=_font(14, True), fill=(69, 43, 57))
    for column, state in enumerate(STATES):
        composite = compose(item, state, frames[state]).resize((176, 264), Image.Resampling.NEAREST)
        background = _checkerboard(composite.size)
        background.alpha_composite(composite)
        sheet.alpha_composite(background, (column * 220 + 20, 42))
        draw.text((column * 220 + 16, 314), state.replace("_front_", " "), font=_font(10, True), fill=(69, 43, 57))
    path = output / "motion-4w1s-board.png"
    sheet.convert("RGB").save(path, optimize=True)
    return path


def _write_family_board(items: list[dict], frames_by_slug: dict[str, dict[str, Image.Image]], family: str) -> Path:
    columns = 5
    row_height = 310
    board = Image.new("RGBA", (columns * 220, 56 + ((len(items) + columns - 1) // columns) * row_height), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    draw.text((14, 12), f"MALE 66 MOTION REFRESH · {family} · 4W+1S", font=_font(17, True), fill=(69, 43, 57))
    for index, item in enumerate(items):
        x = (index % columns) * 220
        y = 56 + (index // columns) * row_height
        draw.text((x + 10, y + 4), item["slug"], font=_font(11, True), fill=(69, 43, 57))
        for col, state in enumerate(STATES):
            composite = compose(item, state, frames_by_slug[item["slug"]][state]).resize((84, 126), Image.Resampling.NEAREST)
            bg = _checkerboard(composite.size)
            bg.alpha_composite(composite)
            board.alpha_composite(bg, (x + 4 + col * 42, y + 26))
        draw.text((x + 10, y + 158), "W1 W2 W3 W4 S1", font=_font(9, True), fill=(38, 142, 102))
        # A 4x lower/neck crop is stored per item; the overview remains only a
        # routing board and never replaces close-up review.
    path = REVIEW_ROOT / f"{family.replace('/', '_')}-overview-board.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(path, optimize=True)
    return path


def _manifest(item: dict, frames: dict[str, Image.Image], board: Path) -> dict:
    output = _motion_output_dir(item)
    files = {}
    for state, frame in frames.items():
        if state == "static":
            continue
        path = output / f"{state}.png"
        frame.save(path, optimize=True)
        files[state] = {"path": relative(path), "sha256": sha256(path)}
    return {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_item_motion_candidate",
        "itemId": item["slug"],
        "version": "v5",
        "candidateOnly": True,
        "approvalScope": "exact_item_static_4w1s_runtime",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
        "independentReviewVerdict": "PENDING",
        "family": item["family"],
        "staticSource": {"path": relative(item["static_path"]), "sha256": sha256(item["static_path"])},
        "frames": {
            "static": {"path": relative(item["static_path"]), "sha256": sha256(item["static_path"])},
            **files,
        },
        "board": {"path": relative(board), "sha256": sha256(board)},
        "states": list(STATES),
        "runtimePromoted": False,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


def produce(slugs: set[str] | None = None) -> dict:
    selected = tuple(item for item in MOTION_ITEMS if not slugs or item["slug"] in slugs)
    if slugs:
        missing = sorted(slugs - {item["slug"] for item in selected})
        if missing:
            raise ValueError(f"unknown or already-current slugs: {', '.join(missing)}")
    frames_by_slug: dict[str, dict[str, Image.Image]] = {}
    manifests = []
    family_items: dict[str, list[dict]] = defaultdict(list)
    for item in selected:
        frames = {state: build_frame(item, state) for state in ("static", *STATES)}
        frames_by_slug[item["slug"]] = frames
        board = _write_item_sheet(item, {state: frames[state] for state in STATES})
        manifest = _manifest(item, frames, board)
        manifest_path = _motion_output_dir(item) / "motion-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        manifests.append(relative(manifest_path))
        family_items[item["family"]].append(item)
    overview_paths = []
    for family, items in sorted(family_items.items()):
        overview_paths.append(relative(_write_family_board(items, frames_by_slug, family)))
    summary = {
        "schemaVersion": 1,
        "status": "candidate_motion_pending_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "itemCount": len(selected),
        "states": list(STATES),
        "manifests": manifests,
        "overviewBoards": overview_paths,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    output = REVIEW_ROOT / "male-wardrobe-48-motion-refresh-v1-manifest.json"
    output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slugs", help="comma-separated subset of unresolved slugs")
    args = parser.parse_args()
    slugs = {slug for slug in (args.slugs or "").split(",") if slug} or None
    print(json.dumps(produce(slugs), indent=2))


if __name__ == "__main__":
    main()
