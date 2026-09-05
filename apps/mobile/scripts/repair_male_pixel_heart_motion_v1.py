#!/usr/bin/env python3
"""Stage a reviewed distinct fourth walk frame for Pixel Heart Boxy Tee."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SOURCE = (
    ROOT
    / "docs/avatar-motion-pipeline/male-young-drop/2026-07-18/"
    / "motion-candidates/pixel_heart_boxy_tee/walking_front_f04.png"
)
OUTPUT = (
    ROOT
    / "docs/avatar-motion-pipeline/male-motion-distinctness-repair/2026-08-28/v1"
)
RUNTIME_TARGET = (
    MOTION / "room_avatar_top_male_pixel_heart_boxy_tee_v1_walking_front_f04.png"
)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
TOP_PREFIX = "room_avatar_top_male_pixel_heart_boxy_tee_v1"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_clean_png(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != (256, 384):
        raise RuntimeError(f"{path}: expected 256x384, got {image.size}")
    for red, green, blue, alpha in image.getdata():
        if alpha == 0 and (red or green or blue):
            raise RuntimeError(f"{path}: transparent RGB residue")
    return image


def compose_avatar(state: str, top: Image.Image) -> Image.Image:
    layers = (
        MOTION / f"room_avatar_base_male_light_v1_{state}.png",
        ROOM / "avatar_room_face_male_warm_friendly_v1.png",
        MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{state}.png",
        MOTION / f"room_avatar_bottom_male_navy_straight_pants_v1_{state}.png",
        top,
        ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    canvas = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    for layer in layers:
        current = layer if isinstance(layer, Image.Image) else assert_clean_png(layer)
        canvas.alpha_composite(current)
    return canvas


def render_board(images: list[Image.Image], title: str, destination: Path) -> None:
    board = Image.new("RGB", (5 * 296 + 32, 480), (255, 247, 250))
    draw = ImageDraw.Draw(board)
    draw.text((24, 18), title, fill=(66, 40, 54))
    labels = ("walking f01", "walking f02", "walking f03", "walking f04", "sitting f01")
    for index, (image, label) in enumerate(zip(images, labels)):
        x = 24 + index * 296
        board.paste(image.convert("RGB"), (x + 20, 48), image)
        draw.text((x + 20, 440), label, fill=(66, 40, 54))
    destination.parent.mkdir(parents=True, exist_ok=True)
    board.save(destination, optimize=True)


def render_closeup(images: list[Image.Image], destination: Path) -> None:
    cards = []
    for image in images:
        crop = image.crop((68, 192, 190, 356)).resize((366, 492), Image.Resampling.NEAREST)
        cards.append(crop)
    board = Image.new("RGB", (5 * 382 + 32, 540), (255, 247, 250))
    draw = ImageDraw.Draw(board)
    draw.text((24, 18), "PIXEL HEART BOXY TEE · WALKING DISTINCTNESS CLOSE-UP", fill=(66, 40, 54))
    labels = ("f01", "f02", "f03", "f04", "s01")
    for index, (card, label) in enumerate(zip(cards, labels)):
        x = 24 + index * 382
        board.paste(card, (x, 42))
        draw.text((x, 512), label, fill=(66, 40, 54))
    destination.parent.mkdir(parents=True, exist_ok=True)
    board.save(destination, optimize=True)


def stage(promote: bool) -> dict[str, object]:
    source = assert_clean_png(SOURCE)
    candidate = OUTPUT / "candidates/room_avatar_top_male_pixel_heart_boxy_tee_v1_walking_front_f04.png"
    candidate.parent.mkdir(parents=True, exist_ok=True)
    source.save(candidate, optimize=True)
    candidate_image = assert_clean_png(candidate)

    images: list[Image.Image] = []
    for state in STATES:
        runtime = MOTION / f"{TOP_PREFIX}_{state}.png"
        image = candidate_image if state == "walking_front_f04" else assert_clean_png(runtime)
        images.append(compose_avatar(state, image))

    walking_hashes = [sha256(MOTION / f"{TOP_PREFIX}_{state}.png") for state in STATES[:3]]
    walking_hashes.append(sha256(candidate))
    if len(set(walking_hashes)) != 4:
        raise RuntimeError("candidate still does not produce four distinct walking frames")
    if promote:
        RUNTIME_TARGET.write_bytes(candidate.read_bytes())
    runtime_promoted = RUNTIME_TARGET.is_file() and RUNTIME_TARGET.read_bytes() == candidate.read_bytes()

    render_board(images, "BLUMI PIXEL HEART MOTION DISTINCTNESS REPAIR V1", OUTPUT / "pixel-heart-motion-repair-v1-4w1s-board.png")
    render_closeup(images, OUTPUT / "pixel-heart-motion-repair-v1-closeup.png")

    manifest = {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_item_motion_repair",
        "itemId": "pixel_heart_boxy_tee",
        "version": "v1",
        "candidateOnly": True,
        "source": str(SOURCE.relative_to(ROOT)),
        "candidate": str(candidate.relative_to(ROOT)),
        "runtimeTarget": str(RUNTIME_TARGET.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE),
        "candidateSha256": sha256(candidate),
        "runtimeSha256": sha256(RUNTIME_TARGET) if RUNTIME_TARGET.is_file() else None,
        "method": "promote-existing-reviewed-distinct-f04-candidate",
        "walkingDistinctness": True,
        "runtimePromoted": runtime_promoted,
        "promotionStatus": (
            "runtime_promoted_independent_review_blocked"
            if runtime_promoted
            else "candidate_pending_runtime_promotion"
        ),
        "independentReview": {
            "status": "BLOCKED",
            "reason": "reviewer_agent_usage_quota",
        },
        "visualEvidence": {
            "board": str((OUTPUT / "pixel-heart-motion-repair-v1-4w1s-board.png").relative_to(ROOT)),
            "closeup": str((OUTPUT / "pixel-heart-motion-repair-v1-closeup.png").relative_to(ROOT)),
        },
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    print(json.dumps(stage(args.promote), indent=2))
