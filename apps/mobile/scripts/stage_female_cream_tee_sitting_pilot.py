#!/usr/bin/env python3
"""Extract and fit the cream-tee sitting pilot without touching live assets."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
STAGING = ROOT / "docs/avatar-motion-pipeline/female-cream-tee-motion-staging"
SOURCE = STAGING / "cream-tee-sit-chroma-source.png"
REJECTED_SOURCE = STAGING / "cream-tee-sit-source-rejected-has-body.png"
LAYER = STAGING / "cream-tee-sit-extracted-layer.png"
OVERLAY = STAGING / "cream-tee-sit-full-body-overlay.png"
CLOSEUP = STAGING / "cream-tee-sit-2x-closeup.png"
COMPARISON = STAGING / "cream-tee-sit-live-vs-pilot.png"
METRICS = STAGING / "cream-tee-sit-pilot-metrics.json"
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
LIVE = MOTION / "room_avatar_top_female_cream_basic_tee_v2_sitting_front_f01.png"
CANVAS = (256, 384)
TARGET = (80, 210, 176, 297)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_motion(room_id: str) -> Image.Image:
    return Image.open(MOTION / f"{room_id}_sitting_front_f01.png").convert("RGBA")


def extract_chroma(source: Image.Image) -> Image.Image:
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    result: list[tuple[int, int, int, int]] = []
    for red, green, blue, source_alpha in source.convert("RGBA").getdata():
        dominance = green - max(red, blue)
        if green >= 115 and dominance >= 75:
            alpha = 0
        elif green < 95 or dominance <= 12:
            alpha = source_alpha
        else:
            alpha = round(source_alpha * max(0.0, min(1.0, (75 - dominance) / 63)))
        if alpha:
            # Remove green-screen spill only; garment luminance and pink trim stay intact.
            green = min(green, max(red, blue) + 4)
        result.append((red, green, blue, alpha))
    output.putdata(result)
    return output


def fitted_layer() -> tuple[Image.Image, tuple[int, int, int, int]]:
    keyed = extract_chroma(Image.open(SOURCE))
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("chroma extraction produced an empty garment")
    garment = keyed.crop(bbox).resize(
        (TARGET[2] - TARGET[0], TARGET[3] - TARGET[1]), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(garment, TARGET[:2])
    return canvas, bbox


def composite(layer: Image.Image) -> Image.Image:
    avatar = Image.new("RGBA", CANVAS, "#f9eff6")
    for room_id in (
        "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
        "room_avatar_base_female_v2",
        "room_avatar_face_female_soft_doll_foundation_v2",
        "room_avatar_eyes_female_mocha_doe_v2",
        "room_avatar_nose_female_soft_button_v2",
        "room_avatar_mouth_female_peach_whisper_smile_v2",
        "room_avatar_bottom_female_denim_skort_shorts_v2",
        "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
    ):
        avatar.alpha_composite(load_motion(room_id))
    avatar.alpha_composite(layer)
    avatar.alpha_composite(load_motion("room_avatar_hair_front_female_mocha_ribbon_blowout_v2"))
    return avatar


def key_residue(layer: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in layer.getdata()
        if alpha > 8 and green - max(red, blue) > 30
    )


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)


def produce() -> None:
    if not SOURCE.exists() or not REJECTED_SOURCE.exists() or not LIVE.exists():
        raise FileNotFoundError("pilot source, rejected evidence and live comparison must exist")
    before = sha256(LIVE)
    layer, source_bbox = fitted_layer()
    result = composite(layer)
    live_result = composite(Image.open(LIVE).convert("RGBA"))
    layer.save(LAYER, optimize=True)
    result.convert("RGB").save(OVERLAY, optimize=True)
    result.crop((64, 196, 192, 352)).resize((512, 624), Image.Resampling.NEAREST).convert("RGB").save(
        CLOSEUP, optimize=True
    )
    comparison = Image.new("RGBA", (640, 540), "#f9eff6")
    draw = ImageDraw.Draw(comparison)
    draw.text((30, 20), "Current live sitting", fill="#392b37", font=font(22, True))
    draw.text((352, 20), "Premium pilot", fill="#392b37", font=font(22, True))
    comparison.alpha_composite(live_result.resize((256, 384), Image.Resampling.LANCZOS), (30, 76))
    comparison.alpha_composite(result.resize((256, 384), Image.Resampling.LANCZOS), (352, 76))
    comparison.convert("RGB").save(COMPARISON, optimize=True)
    after = sha256(LIVE)
    metrics = {
        "canonicalBase": "room_avatar_base_female_v2_sitting_front_f01.png",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "rigId": "blumi_2_5d_layered_v1",
        "source": SOURCE.name,
        "rejectedBodyContaminatedEvidence": REJECTED_SOURCE.name,
        "sourceGarmentBbox": list(source_bbox),
        "sourceGarmentSize": [source_bbox[2] - source_bbox[0], source_bbox[3] - source_bbox[1]],
        "targetBbox": list(layer.getchannel("A").getbbox() or ()),
        "targetAnchor": list(TARGET),
        "fitScale": [
            round((TARGET[2] - TARGET[0]) / (source_bbox[2] - source_bbox[0]), 6),
            round((TARGET[3] - TARGET[1]) / (source_bbox[3] - source_bbox[1]), 6),
        ],
        "keyResiduePixels": key_residue(layer),
        "liveAssetSha256Before": before,
        "liveAssetSha256After": after,
        "liveAssetUntouched": before == after,
        "producerVerdict": "HOLD",
        "reason": "staging pilot requires visual and independent review",
    }
    METRICS.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


def check() -> None:
    if not all(path.exists() for path in (LAYER, OVERLAY, CLOSEUP, COMPARISON, METRICS)):
        raise SystemExit("pilot outputs are missing; run without --check")
    metrics = json.loads(METRICS.read_text())
    layer = Image.open(LAYER).convert("RGBA")
    failures: list[str] = []
    if layer.size != CANVAS:
        failures.append(f"layer canvas {layer.size} is not {CANVAS}")
    if tuple(layer.getchannel("A").getbbox() or ()) != TARGET:
        failures.append(f"target bbox drifted: {layer.getchannel('A').getbbox()}")
    if key_residue(layer):
        failures.append(f"green key residue: {key_residue(layer)} pixels")
    if sha256(LIVE) != metrics["liveAssetSha256Before"]:
        failures.append("live asset changed after staging production")
    metrics["liveAssetUntouched"] = not failures or "live asset changed after staging production" not in failures
    print(json.dumps(metrics, indent=2))
    if failures:
        print("\n".join(failures))
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check() if args.check else produce()


if __name__ == "__main__":
    main()
