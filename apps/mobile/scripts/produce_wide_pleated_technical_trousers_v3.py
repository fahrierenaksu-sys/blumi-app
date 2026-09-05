#!/usr/bin/env python3
"""Produce a registration-locked wide-pleated trouser candidate.

Unlike v2, this path does not crop and squeeze an adult trouser render into a
canonical rectangle. ImageGen paints directly on a localized canonical guide;
only one uniform guide-registration transform and one premultiplied downsample
are allowed.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import produce_wide_pleated_technical_trousers_v2 as legacy  # noqa: E402
from localize_male_rig_edit import restore_registered_crop  # noqa: E402
from register_male_keyed_rig_edit import (  # noqa: E402
    cleanup_alpha_components,
    extract_keyed_foreground,
    keyed_bbox,
    register_keyed_edit,
)


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANDIDATE = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/bottom/wide_pleated_technical_trousers"
)
RIG = CANDIDATE / "rig"
EVIDENCE = CANDIDATE / "static-review-v8"

SOURCE = RIG / "generated-premium-local-v17.png"
GUIDE = RIG / "localized-guide-v2.png"
REGISTERED_CROP = RIG / "registered-local-premium-v17.png"
MASTER_LAYER = RIG / "garment-master-clean-premium-v17.png"
STATIC_LAYER = RIG / "static-review-premium-v17.png"
COMPOSITE = RIG / "composite-review-premium-v17.png"
APPROVAL_CHECKER = EVIDENCE / "wide-pleated-technical-v8-checker.png"
APPROVAL_BLACK = EVIDENCE / "wide-pleated-technical-v8-black.png"
MANIFEST = EVIDENCE / "wide-pleated-technical-v8-manifest.json"
QA_TITLE = "WIDE PLEATED TECHNICAL / STATIC REVIEW / CANDIDATE V17"
HEM_EXCLUSIVE_Y = 333
SHOE_AWARE_HEM_CURVES = (
    (99.0, 127.0, 113.0),
    (129.0, 157.0, 143.0),
)

RUNTIME_ASSET = (
    ROOM / "avatar_room_bottom_male_wide_pleated_technical_trousers_v1.png"
)
BASE = ROOM / "avatar_room_base_male_light_v1.png"
FACE = ROOM / "avatar_room_face_male_warm_friendly_v1.png"
TOP = ROOM / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR = ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"
APPROVED_SHOES = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/shoes/milk_tea_court/rig/static-v7.png"
)

SOURCE_SHA256 = "5aed3d672710ba392f0bab829b2e9ea9b79be721201bb17e9c0f2969a626e50f"
GUIDE_SHA256 = "35209dface0d35860649fd2f115609827ae07a6c89300f21550e67a2f30844e4"
# The 1024 local guide is a nearest-neighbour enlargement of this exact
# 384x384 master crop (native x80..176, y256..352). This places the generated
# waistband at the canonical y286 seam and the independent hems in the
# y326..338 shoe-contact band.
LOCAL_BOX = (320, 1024, 704, 1408)
MASTER_CANVAS = (1024, 1536)
CANVAS = (256, 384)

visible_component_count = legacy.visible_component_count
tree_sha256 = legacy.tree_sha256


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        return opened.convert("RGBA")


def verify_inputs() -> None:
    if sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("ImageGen v17 source drifted")
    if sha256(GUIDE) != GUIDE_SHA256:
        raise ValueError("localized canonical guide drifted")
    if _load(SOURCE).size != (1254, 1254):
        raise ValueError("ImageGen source must remain 1254x1254")
    if _load(GUIDE).size != (1024, 1024):
        raise ValueError("localized guide must remain 1024x1024")


def build_registered_crop() -> Image.Image:
    verify_inputs()
    return register_keyed_edit(_load(SOURCE), _load(GUIDE))


def build_master_layer() -> Image.Image:
    registered = build_registered_crop()
    foreground = cleanup_alpha_components(
        extract_keyed_foreground(registered),
        min_pixel_count=120,
    )
    pixels = list(foreground.getdata())
    foreground.putdata(
        [(red, green, blue, alpha) if alpha else (0, 0, 0, 0)
         for red, green, blue, alpha in pixels]
    )
    master = restore_registered_crop(
        foreground,
        MASTER_CANVAS,
        LOCAL_BOX,
        transparent_background=True,
    )
    pixels = np.asarray(master).copy()
    yy, xx = np.ogrid[: MASTER_CANVAS[1], : MASTER_CANVAS[0]]
    native_x = xx / 4
    native_y = yy / 4
    for left_x, right_x, center_x in SHOE_AWARE_HEM_CURVES:
        half_width = (right_x - left_x) / 2
        hem_y = 329.5 + 1.5 * ((native_x - center_x) / half_width) ** 2
        below_contour = (
            (native_x >= left_x)
            & (native_x <= right_x)
            & (native_y >= hem_y)
        )
        pixels[below_contour] = (0, 0, 0, 0)
    return Image.fromarray(pixels)


def build_static_layer() -> Image.Image:
    layer = (
        build_master_layer()
        .convert("RGBa")
        .resize(CANVAS, Image.Resampling.LANCZOS)
        .convert("RGBA")
    )
    pixels = np.asarray(layer).copy()
    faint_edge = pixels[:, :, 3] <= 16
    pixels[faint_edge] = (0, 0, 0, 0)
    pixels[HEM_EXCLUSIVE_Y:] = (0, 0, 0, 0)
    return Image.fromarray(pixels)


def render() -> tuple[Path, ...]:
    room_before = tree_sha256(ROOM)
    registered = build_registered_crop()
    master = build_master_layer()
    layer = build_static_layer()
    composite = legacy.compose(
        layer,
        base=_load(BASE),
        face=_load(FACE),
        shoes=_load(APPROVED_SHOES),
        top=_load(TOP),
        hair=_load(HAIR),
    )

    outputs = (
        REGISTERED_CROP,
        MASTER_LAYER,
        STATIC_LAYER,
        COMPOSITE,
        APPROVAL_CHECKER,
        APPROVAL_BLACK,
    )
    for path, image in (
        (REGISTERED_CROP, registered),
        (MASTER_LAYER, master),
        (STATIC_LAYER, layer),
        (COMPOSITE, composite),
        (
            APPROVAL_CHECKER,
            legacy.render_approval_board(
                layer,
                composite,
                black=False,
                title=QA_TITLE,
            ),
        ),
        (
            APPROVAL_BLACK,
            legacy.render_approval_board(
                layer,
                composite,
                black=True,
                title=QA_TITLE,
            ),
        ),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, format="PNG", optimize=True)

    room_after = tree_sha256(ROOM)
    if room_before != room_after:
        raise RuntimeError("candidate render changed runtime assets")
    manifest = {
        "schemaVersion": 1,
        "itemId": "wide_pleated_technical_trousers",
        "family": "male_relaxed_baggy",
        "status": "independent_review_pending",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "localized-canonical-guide-direct-paint",
        "forbiddenTransform": "no item-specific garment crop warp",
        "inputs": {
            str(SOURCE.relative_to(REPO)): SOURCE_SHA256,
            str(GUIDE.relative_to(REPO)): GUIDE_SHA256,
        },
        "outputs": {
            str(path.relative_to(REPO)): sha256(path)
            for path in outputs
        },
        "runtimeTreeBefore": room_before,
        "runtimeTreeAfter": room_after,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return (*outputs, MANIFEST)


def main() -> None:
    for path in render():
        print(path.relative_to(REPO))


if __name__ == "__main__":
    main()
