#!/usr/bin/env python3
"""Render the Phase 7 four-subject scale board from the locked Room V2 shell.

This is an evidence renderer, not a promotion shortcut. It uses the same
normalized camera values as the Room V2 My Room contract, measures the
composited alpha bounds, and writes a machine-readable table alongside the
visual board. Simulator and independent-review evidence remain separate gates.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "docs/room-v3-qa/2026-07-18-phase7-scale"
SHELL_PATH = ROOT / "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
AVATAR_ROOT = ROOT / "apps/mobile/src/features/avatarV2/assets/room"

VIEWPORT_WIDTH = 390
VIEWPORT_HEIGHT = 844
CAMERA_WIDTH_RATIO = 1.90
SHELL_WIDTH = 1254
SHELL_HEIGHT = 714
RENDERER_WIDTH = round(VIEWPORT_WIDTH * CAMERA_WIDTH_RATIO)
RENDERER_HEIGHT = round(RENDERER_WIDTH * SHELL_HEIGHT / SHELL_WIDTH)
SHELL_TOP = 72
FLOOR_Y = SHELL_TOP + round(RENDERER_HEIGHT * 0.86)
AVATAR_DEPTH_Y = 0.76
AVATAR_PERSPECTIVE_SCALE = 0.95
COMPACT_AVATAR_WIDTH = 0.20
COMPACT_AVATAR_HEIGHT = 0.30
SITTING_SCALE_Y = 0.82
SITTING_TRANSLATE_Y = 14

SUBJECTS = (
    {
        "id": "female_standing",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "state": "standing",
        "layer_paths": (
            AVATAR_ROOT / "avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png",
            AVATAR_ROOT / "avatar_room_base_female_v2.png",
            AVATAR_ROOT / "avatar_room_face_female_soft_doll_foundation_v2.png",
            AVATAR_ROOT / "avatar_room_eyes_female_mocha_doe_v2.png",
            AVATAR_ROOT / "avatar_room_nose_female_soft_button_v2.png",
            AVATAR_ROOT / "avatar_room_mouth_female_peach_whisper_smile_v2.png",
            AVATAR_ROOT / "avatar_room_bottom_female_denim_skort_shorts_v2.png",
            AVATAR_ROOT / "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
            AVATAR_ROOT / "avatar_room_top_female_cream_basic_tee_v2.png",
            AVATAR_ROOT / "avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png",
        ),
    },
    {
        "id": "female_sitting",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "state": "sitting",
        "layer_paths": (
            AVATAR_ROOT / "motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_base_female_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_face_female_soft_doll_foundation_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_eyes_female_mocha_doe_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_nose_female_soft_button_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_mouth_female_peach_whisper_smile_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_bottom_female_denim_skort_shorts_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_top_female_cream_basic_tee_v2_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_sitting_front_f01.png",
        ),
    },
    {
        "id": "male_standing",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "state": "standing",
        "layer_paths": (
            AVATAR_ROOT / "avatar_room_base_male_light_v1.png",
            AVATAR_ROOT / "avatar_room_face_male_warm_friendly_v1.png",
            AVATAR_ROOT / "avatar_room_shoes_male_milk_tea_court_v1.png",
            AVATAR_ROOT / "avatar_room_bottom_male_navy_straight_pants_v1.png",
            AVATAR_ROOT / "avatar_room_top_male_powder_blue_crew_tee_v1.png",
            AVATAR_ROOT / "avatar_room_hair_front_male_espresso_crop_v1.png",
        ),
    },
    {
        "id": "male_sitting",
        "fitProfileId": "blumi_male_room_avatar_v1",
        "state": "sitting",
        "layer_paths": (
            AVATAR_ROOT / "motion/room_avatar_base_male_light_v1_sitting_front_f01.png",
            # The motion library has no male face export for this frame. The
            # approved static face is aligned to the same 256x384 canvas and
            # keeps the scale evidence readable without inventing pixels.
            AVATAR_ROOT / "avatar_room_face_male_warm_friendly_v1.png",
            AVATAR_ROOT / "motion/room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png",
            AVATAR_ROOT / "motion/room_avatar_hair_front_male_soft_textured_crop_v1_sitting_front_f01.png",
        ),
    },
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("avatar asset has no visible alpha")
    return bbox


def fit_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    except OSError:
        return ImageFont.load_default()


def composite_layers(layer_paths: tuple[Path, ...]) -> Image.Image:
    canvas = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    for path in layer_paths:
        layer = Image.open(path).convert("RGBA")
        if layer.size != canvas.size:
            raise ValueError(f"{path.name} must be 256x384, got {layer.size}")
        canvas.alpha_composite(layer)
    return canvas


def render_subject(shell: Image.Image, subject: dict[str, object]) -> tuple[Image.Image, dict[str, object]]:
    panel = Image.new("RGBA", (VIEWPORT_WIDTH, 540), (250, 244, 240, 255))
    shell_render = shell.resize((RENDERER_WIDTH, RENDERER_HEIGHT), Image.Resampling.LANCZOS)
    shell_x = round((VIEWPORT_WIDTH - RENDERER_WIDTH) / 2)
    panel.alpha_composite(shell_render, (shell_x, SHELL_TOP))

    layer_paths = subject["layer_paths"]
    if not isinstance(layer_paths, tuple) or not all(isinstance(path, Path) for path in layer_paths):
        raise ValueError(f"{subject['id']} has invalid runtime layer paths")
    avatar_source = composite_layers(layer_paths)
    allocated_width = round(RENDERER_WIDTH * COMPACT_AVATAR_WIDTH * AVATAR_PERSPECTIVE_SCALE)
    allocated_height = round(RENDERER_HEIGHT * COMPACT_AVATAR_HEIGHT * AVATAR_PERSPECTIVE_SCALE)
    if subject["state"] == "sitting":
        allocated_height = round(allocated_height * SITTING_SCALE_Y)
    avatar = avatar_source.resize((allocated_width, allocated_height), Image.Resampling.LANCZOS)
    bbox = alpha_bbox(avatar)
    body_width = bbox[2] - bbox[0]
    body_height = bbox[3] - bbox[1]
    avatar_left = round((VIEWPORT_WIDTH - allocated_width) / 2)
    avatar_top = FLOOR_Y - bbox[3]
    if subject["state"] == "sitting":
        avatar_top += SITTING_TRANSLATE_Y
    panel.alpha_composite(avatar, (avatar_left, avatar_top))

    draw = ImageDraw.Draw(panel)
    draw.rectangle((0, 0, VIEWPORT_WIDTH - 1, 539), outline=(215, 192, 185, 255), width=2)
    draw.line((0, FLOOR_Y, VIEWPORT_WIDTH, FLOOR_Y), fill=(82, 66, 66, 190), width=1)
    draw.text((16, 14), subject["id"], fill=(70, 54, 54, 255), font=fit_font(17))
    draw.text((16, 37), f"{VIEWPORT_WIDTH}x{VIEWPORT_HEIGHT} My Room camera", fill=(105, 82, 82, 255), font=fit_font(11))
    draw.text((16, 502), f"body {body_width}x{body_height}px  floorY {FLOOR_Y}px", fill=(70, 54, 54, 255), font=fit_font(11))
    if subject["state"] == "sitting":
        seat_contact_y = avatar_top + round((bbox[1] + bbox[3]) * 0.62)
        draw.line((avatar_left + bbox[0], seat_contact_y, avatar_left + bbox[2], seat_contact_y), fill=(181, 107, 110, 230), width=2)
    else:
        seat_contact_y = None

    screenshot_name = f"phase7_scale_panel_{subject['id']}.png"
    panel_path = OUTPUT / screenshot_name
    panel.save(panel_path)
    record = {
        "shellId": "room_v2_shell_blumi_world_v1",
        "fitProfileId": subject["fitProfileId"],
        "state": subject["state"],
        "viewportWidthPx": VIEWPORT_WIDTH,
        "viewportHeightPx": VIEWPORT_HEIGHT,
        "cameraWidthRatio": CAMERA_WIDTH_RATIO,
        "rendererWidthPx": RENDERER_WIDTH,
        "rendererHeightPx": RENDERER_HEIGHT,
        "allocatedWidthPx": allocated_width,
        "allocatedHeightPx": allocated_height,
        "measuredBodyBoundsPx": {
            "minX": avatar_left + bbox[0],
            "minY": avatar_top + bbox[1],
            "maxXExclusive": avatar_left + bbox[2],
            "maxYExclusive": avatar_top + bbox[3],
        },
        "visibleHeightPx": body_height,
        "footFloorY": FLOOR_Y,
        "seatContactY": seat_contact_y,
        "anchorY": avatar_top + bbox[3],
        "compositionMode": "runtime_layer_composite",
        "layerCount": len(layer_paths),
        "sourceLayerPaths": [str(path.relative_to(ROOT)) for path in layer_paths],
        "screenshotPath": f"docs/room-v3-qa/2026-07-18-phase7-scale/{screenshot_name}",
    }
    return panel, record


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shell = Image.open(SHELL_PATH).convert("RGBA")
    panels: list[Image.Image] = []
    records: list[dict[str, object]] = []
    for subject in SUBJECTS:
        panel, record = render_subject(shell, subject)
        panels.append(panel)
        records.append({"id": subject["id"], **record})

    board = Image.new("RGBA", (VIEWPORT_WIDTH * 2, 1080), (242, 234, 230, 255))
    for index, panel in enumerate(panels):
        x = (index % 2) * VIEWPORT_WIDTH
        y = (index // 2) * 540
        board.alpha_composite(panel, (x, y))
    board_path = OUTPUT / "phase7_male_female_standing_sitting_scale_board.png"
    board.save(board_path)

    measurement_table = {
        "schemaVersion": 1,
        "artifactId": "phase7-canonical-measurement-table-2026-07-18",
        "status": "evidence_draft_pending_simulator_and_independent_review",
        "renderSource": "locked Room V2 shell asset with Room V2 My Room camera contract",
        "shellId": "room_v2_shell_blumi_world_v1",
        "viewport": {"widthPx": VIEWPORT_WIDTH, "heightPx": VIEWPORT_HEIGHT},
        "camera": {
            "cameraWidthRatio": CAMERA_WIDTH_RATIO,
            "rendererWidthPx": RENDERER_WIDTH,
            "rendererHeightPx": RENDERER_HEIGHT,
            "shellTopPx": SHELL_TOP,
            "floorY": FLOOR_Y,
            "avatarDepthY": AVATAR_DEPTH_Y,
            "avatarPerspectiveScale": AVATAR_PERSPECTIVE_SCALE,
        },
        "subjects": records,
        "evidence": {
            "measurementTableId": "phase7-canonical-measurement-table-2026-07-18",
            "simulatorVisualReviewId": None,
            "independentReviewId": None,
            "simulatorShellSmokeEvidenceId": "simulator-my-room-vertical-2026-07-18",
            "simulatorShellSmokePath": "docs/room-v3-qa/2026-07-18-phase7-scale/simulator_my_room_vertical.png",
        },
        "notes": [
            "Measured bounds come from the composited alpha in each rendered panel.",
            "Each panel uses the approved runtime avatar layer stack; male sitting uses the approved static male face because the motion export has no male face layer for this frame.",
            "Simulator shell smoke is recorded separately; it confirms the live vertical My Room shell but does not prove furniture-specific scale, collision, seating, or persistence.",
            "Simulator and independent review are intentionally unset; this artifact cannot self-promote.",
            "Furniture-specific scale rows remain blocked until the same camera is used with approved furniture and sitting contact QA.",
        ],
    }
    (OUTPUT / "phase7_canonical_measurement_table.json").write_text(
        json.dumps(measurement_table, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTPUT / "evidence.md").write_text(
        "# Phase 7 scale evidence\n\n"
        "Status: BLOCKED_PENDING_SIMULATOR_AND_INDEPENDENT_REVIEW\n\n"
        "The board uses the locked Room V2 shell and My Room camera contract to "
        "measure full runtime-layer-composited female/male standing and sitting "
        "avatars on the same mobile viewport. It is evidence draft only; it does "
        "not promote catalog assets.\n\n"
        "- Board: `phase7_male_female_standing_sitting_scale_board.png`\n"
        "- Measurement table: `phase7_canonical_measurement_table.json`\n"
        "- Simulator shell smoke: `simulator_my_room_vertical.png` (live vertical My Room shell; no Keychain error)\n"
        "- Simulator placement smoke: `simulator_room_placement_evidence.json` (legacy table + lamp tabletop support and relaunch persistence)\n"
        "- Simulator furniture-scale visual review: pending per-SKU collision/seating/persistence proof\n"
        "- Independent review: pending\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
