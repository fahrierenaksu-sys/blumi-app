#!/usr/bin/env python3
"""Export Blumi room-avatar Motion v1 production requests.

This script intentionally does not wire assets into the app. It writes the
missing production strip plan for the female default 2.5D room avatar rig so
art generation can happen against the same canvas and naming contract as
runtime.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


CANVAS = {
    "width": 256,
    "height": 384,
    "centerlineX": 128,
    "feetBaselineY": 360,
}

RIG_ID = "blumi_2_5d_layered_v1"

FIT_PROFILE_BY_BODY_PRESET = {
    "female": "blumi_female_room_avatar_v1",
}

ROOM_ASSET_DIR = "apps/mobile/src/features/avatarV2/assets/room"
PIPELINE_DIR = "docs/avatar-motion-pipeline"

MOTION_REQUIREMENTS = [
    {
        "sliceId": "first_room_world_motion",
        "label": "Walk front",
        "state": "walking",
        "direction": "front",
        "minimumFrameCount": 4,
        "frameDurationMs": 120,
        "loop": True,
        "requiresAnimation": True,
        "productionBlocking": True,
    },
    {
        "sliceId": "first_room_world_motion",
        "label": "Sit front",
        "state": "sitting",
        "direction": "front",
        "minimumFrameCount": 1,
        "frameDurationMs": 120,
        "loop": False,
        "requiresAnimation": False,
        "productionBlocking": True,
    },
]

DEFAULT_LAYER_SEEDS = [
    {
        "bodyPreset": "female",
        "layerType": "hairBack",
        "layerId": "room_avatar_hair_female_blonde_long_back_v2",
        "layerName": "Blonde Waves Back",
        "seedAssetKey": "avatar_room_hair_female_blonde_long_back_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "base",
        "layerId": "room_avatar_base_female_v2",
        "layerName": "Female Room Base",
        "seedAssetKey": "avatar_room_base_female_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "face",
        "layerId": "room_avatar_face_female_default_v2",
        "layerName": "Soft Smile",
        "seedAssetKey": "avatar_room_face_female_default_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "hairFront",
        "layerId": "room_avatar_hair_female_blonde_long_front_v2",
        "layerName": "Blonde Waves Front",
        "seedAssetKey": "avatar_room_hair_female_blonde_long_front_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "bottom",
        "layerId": "room_avatar_bottom_female_default_v2",
        "layerName": "Rose Skirt",
        "seedAssetKey": "avatar_room_bottom_female_default_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "shoes",
        "layerId": "room_avatar_shoes_female_default_v2",
        "layerName": "Cream Flats",
        "seedAssetKey": "avatar_room_shoes_female_default_v2",
    },
    {
        "bodyPreset": "female",
        "layerType": "top",
        "layerId": "room_avatar_top_female_default_v2",
        "layerName": "Blush Date Dress",
        "seedAssetKey": "avatar_room_top_female_default_v2",
    },
]


def get_motion_driver_layer(body_preset: str) -> dict[str, object]:
    for layer in DEFAULT_LAYER_SEEDS:
        if layer["bodyPreset"] == body_preset and layer["layerType"] == "base":
            return layer
    raise SystemExit(f"No base motion driver layer for {body_preset}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Blumi room-avatar missing motion asset requests."
    )
    parser.add_argument(
        "--out",
        default=f"{PIPELINE_DIR}/room-avatar-motion-missing-assets.json",
        help="Output JSON manifest path.",
    )
    return parser.parse_args()


def make_asset_plan(layer: dict[str, object], requirement: dict[str, object]) -> dict[str, object]:
    state = str(requirement["state"])
    direction = str(requirement["direction"])
    layer_id = str(layer["layerId"])
    body_preset = str(layer["bodyPreset"])
    minimum_frame_count = int(requirement["minimumFrameCount"])
    expected_asset_key_prefix = f"{layer_id}_{state}_{direction}"
    expected_strip_key = f"{expected_asset_key_prefix}_strip"
    driver_layer = get_motion_driver_layer(body_preset)
    driver_asset_key_prefix = f"{driver_layer['layerId']}_{state}_{direction}"
    is_motion_driver = layer["layerType"] == "base"
    expected_frame_keys = [
        f"{expected_asset_key_prefix}_f{index + 1:02d}"
        for index in range(max(1, minimum_frame_count))
    ]
    expected_strip_file_name = f"{expected_strip_key}.png"
    seed_file_name = f"{layer['seedAssetKey']}.png"
    frame_duration_ms = int(requirement["frameDurationMs"])
    loop = bool(requirement["loop"])

    plan = {
        **layer,
        **requirement,
        "rigId": RIG_ID,
        "fitProfileId": FIT_PROFILE_BY_BODY_PRESET[body_preset],
        "canvas": CANVAS,
        "fitRole": "motionDriver" if is_motion_driver else "fittedLayer",
        "productionOrder": 0 if is_motion_driver else 1,
        "motionRequirementOrder": int(requirement["order"]),
        "layerProductionOrder": int(layer["order"]),
        "motionDriverLayerId": driver_layer["layerId"],
        "motionDriverLayerName": driver_layer["layerName"],
        "motionDriverAssetKeyPrefix": driver_asset_key_prefix,
        "motionDriverStripPath": f"{PIPELINE_DIR}/{driver_asset_key_prefix}_strip.png",
        "requiresMotionDriverReference": not is_motion_driver,
        "seedFileName": seed_file_name,
        "seedPath": f"{ROOM_ASSET_DIR}/{seed_file_name}",
        "expectedAssetKeyPrefix": expected_asset_key_prefix,
        "expectedStripKey": expected_strip_key,
        "expectedStripFileName": expected_strip_file_name,
        "editCanvasPath": f"{PIPELINE_DIR}/{expected_strip_file_name}",
        "expectedFrameKeys": expected_frame_keys,
        "expectedFileNames": [f"{key}.png" for key in expected_frame_keys],
        "frameDurationMs": frame_duration_ms,
        "loop": loop,
        "isStaticPose": not bool(requirement["requiresAnimation"]),
        "motionV1Scope": True,
        "catalogMotionSlot": f"assetsByMotion.{state}.{direction}",
    }
    plan.pop("order", None)
    return plan


def build_manifest() -> dict[str, object]:
    plans = [
        make_asset_plan(
            {**layer, "order": layer_order},
            {**requirement, "order": requirement_order},
        )
        for requirement_order, requirement in enumerate(MOTION_REQUIREMENTS)
        for layer_order, layer in enumerate(DEFAULT_LAYER_SEEDS)
    ]
    plans = sorted(
        plans,
        key=lambda plan: (
            str(plan["bodyPreset"]),
            int(plan["motionRequirementOrder"]),
            int(plan["productionOrder"]),
            int(plan["layerProductionOrder"]),
        ),
    )

    return {
        "schema": "blumi.roomAvatarMotionMissingAssets.v3",
        "source": "Motion v1 female default Walk front + Sit front production request. Runtime readiness stays in app selectors.",
        "scope": "motion_v1_female_default_walk_sit_front",
        "rigId": RIG_ID,
        "canvas": CANVAS,
        "fitProfiles": FIT_PROFILE_BY_BODY_PRESET,
        "frameDurationMs": 120,
        "excludedFromMotionV1": [
            "male presets",
            "non-default avatar items",
            "gesture delight motions",
            "waving",
            "dancing"
        ],
        "productionRule": "Generate each body preset's base motion driver first; generate fitted layers against that driver strip so clothes, hair, face, and shoes keep the same baseline, centerline, and motion silhouette.",
        "defaultLayerCount": len(DEFAULT_LAYER_SEEDS),
        "motionRequirementCount": len(MOTION_REQUIREMENTS),
        "planCount": len(plans),
        "productionBlockingPlanCount": len(
            [plan for plan in plans if plan["productionBlocking"]]
        ),
        "plans": plans,
    }


def main() -> None:
    args = parse_args()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(build_manifest(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
