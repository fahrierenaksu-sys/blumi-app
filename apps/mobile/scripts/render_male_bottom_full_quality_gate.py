#!/usr/bin/env python3
"""Render a candidate-only full-quality audit for all 19 male bottoms.

The board is deliberately diagnostic: automated geometry metrics can surface
risks, but only close-up visual review plus explicit user approval can PASS an
item or authorize runtime promotion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import deque
from pathlib import Path
from typing import NamedTuple

from PIL import Image, ImageDraw, ImageFont


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from male_bottom_system_v2 import (  # noqa: E402
    FAMILY_CONTRACTS,
    MALE_BOTTOM_PROFILES,
    MaleBottomFamily,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
BASE_PATH = ROOM_ROOT / "avatar_room_base_male_light_v1.png"
FACE_PATH = ROOM_ROOT / "avatar_room_face_male_warm_friendly_v1.png"
TOP_PATH = ROOM_ROOT / "avatar_room_top_male_powder_blue_crew_tee_v1.png"
HAIR_PATH = (
    ROOM_ROOT / "avatar_room_hair_front_male_chestnut_short_waves_v1.png"
)
SHOE_PATH = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/shoes/milk_tea_court/rig/static-review-v7.png"
)
DEFAULT_OUTPUT_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "bottoms-full-quality-gate-v1"
)

CANVAS = (256, 384)
COLS = 4
CELL = (640, 650)
BOARD_HEADER = 80
FULL_BODY_SIZE = (192, 288)
WAIST_CROP = (78, 278, 178, 308)
CROTCH_CROP = (96, 290, 160, 334)
HEM_CROP = (78, 312, 178, 356)
CLOSEUP_SCALE = 4


class BottomEvaluation(NamedTuple):
    alpha_bbox: tuple[int, int, int, int] | None
    component_sizes: tuple[int, ...]
    transparent_rgb_residue: int
    waist_top_y: int | None
    inner_leg_gap_starts_y: int | None
    hem_exclusive_y: int | None
    shoe_overlap_pixels: int | None
    flags: tuple[str, ...]


class BottomQualityGateResult(NamedTuple):
    item_count: int
    status_counts: dict[str, int]
    checkerboard_path: Path
    black_path: Path
    metrics_path: Path
    evidence_path: Path


def load_rgba(path: Path, label: str) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"missing {label}: {path}")
    with Image.open(path) as opened:
        opened.load()
        if opened.size != CANVAS:
            raise ValueError(f"{label} must be 256x384; got {opened.size}")
        if opened.mode != "RGBA":
            raise ValueError(f"{label} must be RGBA; got {opened.mode}")
        return opened.copy()


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _alpha_components(
    image: Image.Image,
    *,
    threshold: int = 16,
) -> tuple[tuple[tuple[int, int], ...], ...]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[tuple[tuple[int, int], ...]] = []
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] <= threshold or (x, y) in visited:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < image.width and 0 <= next_y < image.height):
                        continue
                    if (next_x, next_y) in visited:
                        continue
                    if pixels[next_x, next_y] <= threshold:
                        continue
                    visited.add((next_x, next_y))
                    queue.append((next_x, next_y))
            components.append(tuple(component))
    return tuple(sorted(components, key=len, reverse=True))


def _family_contract(family: str | MaleBottomFamily):
    family_enum = (
        family if isinstance(family, MaleBottomFamily) else MaleBottomFamily(family)
    )
    return FAMILY_CONTRACTS[family_enum]


def _first_inner_gap_row(
    image: Image.Image,
    *,
    start_y: int = 286,
    end_y: int = 356,
    threshold: int = 16,
) -> int | None:
    alpha = image.getchannel("A").load()
    for y in range(start_y, min(end_y, image.height)):
        left = [x for x in range(76, 128) if alpha[x, y] > threshold]
        right = [x for x in range(128, 180) if alpha[x, y] > threshold]
        if not left or not right:
            continue
        if min(right) - max(left) > 1:
            return y
    return None


def _transparent_rgb_residue(image: Image.Image) -> int:
    return sum(
        alpha == 0 and (red != 0 or green != 0 or blue != 0)
        for red, green, blue, alpha in image.getdata()
    )


def _has_asymmetric_crotch_tear(
    image: Image.Image,
    *,
    waist_top_y: int,
    bridge_closed_through_y: int,
    threshold: int = 16,
) -> bool:
    alpha = image.getchannel("A").load()
    for y in range(waist_top_y, bridge_closed_through_y + 1):
        left_count = sum(alpha[x, y] > threshold for x in range(92, 128))
        right_count = sum(alpha[x, y] > threshold for x in range(128, 164))
        if (left_count >= 8 and right_count < 8) or (
            right_count >= 8 and left_count < 8
        ):
            return True
    return False


def _shoe_overlap(bottom: Image.Image, shoe: Image.Image | None) -> int | None:
    if shoe is None:
        return None
    bottom_alpha = bottom.getchannel("A")
    shoe_alpha = shoe.getchannel("A")
    return sum(
        bottom_value > 16 and shoe_value > 16
        for bottom_value, shoe_value in zip(
            bottom_alpha.getdata(),
            shoe_alpha.getdata(),
        )
    )


def evaluate_bottom(
    image: Image.Image,
    *,
    family: str | MaleBottomFamily,
    shoe: Image.Image | None = None,
) -> BottomEvaluation:
    if image.size != CANVAS or image.mode != "RGBA":
        raise ValueError("bottom must be a 256x384 RGBA layer")
    if shoe is not None and (shoe.size != CANVAS or shoe.mode != "RGBA"):
        raise ValueError("shoe must be a 256x384 RGBA layer")

    contract = _family_contract(family)
    alpha = image.getchannel("A")
    geometry_alpha = alpha.point(lambda value: 255 if value > 16 else 0)
    alpha_bbox = geometry_alpha.getbbox()
    components = _alpha_components(image)
    component_sizes = tuple(len(component) for component in components)
    residue = _transparent_rgb_residue(image)
    gap_start = _first_inner_gap_row(image)
    hem_exclusive = alpha_bbox[3] if alpha_bbox else None
    waist_top = alpha_bbox[1] if alpha_bbox else None
    overlap = _shoe_overlap(image, shoe)
    flags: list[str] = []

    if alpha_bbox is None:
        flags.append("empty_layer")
    else:
        if abs(waist_top - contract.waist_top_y) > 2:
            flags.append("waist_outside_family_anchor")
        minimum_hem, maximum_hem = contract.hem_exclusive_range
        if not minimum_hem <= hem_exclusive <= maximum_hem:
            flags.append("hem_outside_family_range")

    if residue:
        flags.append("transparent_rgb_residue")
    if len(component_sizes) > 1:
        flags.append("detached_alpha_fragment")
    if _has_asymmetric_crotch_tear(
        image,
        waist_top_y=contract.waist_top_y,
        bridge_closed_through_y=contract.crotch_bridge_closed_through_y,
    ):
        flags.append("asymmetric_crotch_tear")
    if gap_start is None:
        flags.append("missing_inner_leg_gap")
    elif gap_start < contract.inner_leg_gap_starts_y:
        flags.append("early_crotch_split")
    elif gap_start > contract.inner_leg_gap_starts_y + 12:
        flags.append("late_inner_leg_gap")

    if overlap is not None:
        family_enum = (
            family if isinstance(family, MaleBottomFamily) else MaleBottomFamily(family)
        )
        if family_enum is MaleBottomFamily.SHORTS:
            if overlap > 0:
                flags.append("shorts_overlap_shoes")
        else:
            if overlap == 0:
                flags.append("floating_hem_no_shoe_contact")
            elif overlap > 520:
                flags.append("excessive_shoe_occlusion")

    return BottomEvaluation(
        alpha_bbox=alpha_bbox,
        component_sizes=component_sizes,
        transparent_rgb_residue=residue,
        waist_top_y=waist_top,
        inner_leg_gap_starts_y=gap_start,
        hem_exclusive_y=hem_exclusive,
        shoe_overlap_pixels=overlap,
        flags=tuple(flags),
    )


def _compose(
    base: Image.Image,
    face: Image.Image,
    shoe: Image.Image,
    bottom: Image.Image,
    top: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    composite = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in (base, face, shoe, bottom, top, hair):
        composite = Image.alpha_composite(composite, layer)
    return composite


def _checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    result = Image.new("RGBA", size, (248, 245, 248, 255))
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (
                        x,
                        y,
                        min(x + square - 1, size[0] - 1),
                        min(y + square - 1, size[1] - 1),
                    ),
                    fill=(222, 217, 222, 255),
                )
    return result


def _flatten(composite: Image.Image, background: str) -> Image.Image:
    if background == "checkerboard":
        result = _checkerboard(CANVAS)
    elif background == "black":
        result = Image.new("RGBA", CANVAS, (0, 0, 0, 255))
    else:
        raise ValueError(f"unsupported background: {background}")
    result.alpha_composite(composite)
    return result.convert("RGB")


def _closeup(flattened: Image.Image, crop: tuple[int, int, int, int]) -> Image.Image:
    return flattened.crop(crop).resize(
        (
            (crop[2] - crop[0]) * CLOSEUP_SCALE,
            (crop[3] - crop[1]) * CLOSEUP_SCALE,
        ),
        Image.Resampling.NEAREST,
    )


def _render_cell(
    composite: Image.Image,
    *,
    item_id: str,
    family: str,
    status: str,
    flags: tuple[str, ...],
    background: str,
) -> Image.Image:
    dark = background == "black"
    panel = (14, 14, 17) if dark else (255, 250, 253)
    text = (248, 247, 249) if dark else (42, 34, 42)
    secondary = (190, 190, 198) if dark else (100, 84, 100)
    status_color = {
        "user_approved": (65, 176, 118),
        "independent_reviewed_pending_user_approval": (226, 157, 49),
        "needs_redesign": (207, 78, 91),
    }.get(status, (140, 140, 145))
    cell = Image.new("RGB", CELL, panel)
    draw = ImageDraw.Draw(cell)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, CELL[0] - 1, 4), fill=status_color)
    draw.text((12, 12), item_id, font=font, fill=text)
    draw.text((12, 28), f"{family} · {status}", font=font, fill=secondary)
    flattened = _flatten(composite, background)
    full = flattened.resize(FULL_BODY_SIZE, Image.Resampling.LANCZOS)
    cell.paste(full, (12, 58))
    draw.text((12, 352), "FULL BODY", font=font, fill=secondary)
    visible_flags = ", ".join(flags[:4]) if flags else "no automated risk flag"
    draw.text((12, 372), visible_flags, font=font, fill=status_color)

    closeups = (
        ("WAIST / TOP CONTACT · 4x", WAIST_CROP, 58),
        ("CROTCH / LEG GAP · 4x", CROTCH_CROP, 214),
        ("HEM / APPROVED SHOE · 4x", HEM_CROP, 426),
    )
    for label, crop, y in closeups:
        draw.text((216, y), label, font=font, fill=secondary)
        zoom = _closeup(flattened, crop)
        x = 216 + (412 - zoom.width) // 2
        cell.paste(zoom, (x, y + 18))
    return cell


def _render_board(
    items: tuple[dict[str, object], ...],
    *,
    background: str,
    output_path: Path,
) -> None:
    rows = (len(items) + COLS - 1) // COLS
    board = Image.new(
        "RGB",
        (COLS * CELL[0], BOARD_HEADER + rows * CELL[1]),
        (8, 8, 10) if background == "black" else (242, 234, 240),
    )
    draw = ImageDraw.Draw(board)
    text = (248, 247, 249) if background == "black" else (42, 34, 42)
    draw.text(
        (16, 16),
        "MALE BOTTOM FULL QUALITY GATE · 19 ITEMS · FULL + WAIST + CROTCH + HEM",
        font=ImageFont.load_default(),
        fill=text,
    )
    draw.text(
        (16, 38),
        "Automated flags are diagnostics only. Visual reviewer + exact user approval decide PASS.",
        font=ImageFont.load_default(),
        fill=text,
    )
    for index, item in enumerate(items):
        cell = _render_cell(
            item["composite"],
            item_id=item["item_id"],
            family=item["family"],
            status=item["status"],
            flags=item["evaluation"].flags,
            background=background,
        )
        board.paste(
            cell,
            (
                index % COLS * CELL[0],
                BOARD_HEADER + index // COLS * CELL[1],
            ),
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(output_path, format="PNG", optimize=True)


def _evaluation_json(evaluation: BottomEvaluation) -> dict[str, object]:
    return {
        "alpha_bbox": list(evaluation.alpha_bbox) if evaluation.alpha_bbox else None,
        "component_sizes": list(evaluation.component_sizes),
        "transparent_rgb_residue": evaluation.transparent_rgb_residue,
        "waist_top_y": evaluation.waist_top_y,
        "inner_leg_gap_starts_y": evaluation.inner_leg_gap_starts_y,
        "hem_exclusive_y": evaluation.hem_exclusive_y,
        "shoe_overlap_pixels": evaluation.shoe_overlap_pixels,
        "flags": list(evaluation.flags),
    }


def render_bottom_quality_gate(output_root: Path) -> BottomQualityGateResult:
    before = tree_hashes(ROOM_ROOT)
    external_input_before = {
        SHOE_PATH: sha256_file(SHOE_PATH),
    }
    base = load_rgba(BASE_PATH, "canonical male base")
    face = load_rgba(FACE_PATH, "canonical male face")
    top = load_rgba(TOP_PATH, "neutral comparison top")
    hair = load_rgba(HAIR_PATH, "canonical comparison hair")
    shoe = load_rgba(SHOE_PATH, "approved Milk Tea v7 shoe")

    items: list[dict[str, object]] = []
    status_counts: dict[str, int] = {}
    for item_id, profile in sorted(MALE_BOTTOM_PROFILES.items()):
        bottom = load_rgba(profile.runtime_asset_path, f"bottom {item_id}")
        evaluation = evaluate_bottom(
            bottom,
            family=profile.family,
            shoe=shoe,
        )
        status = profile.static_status.value
        status_counts[status] = status_counts.get(status, 0) + 1
        items.append(
            {
                "item_id": item_id,
                "family": profile.family.value,
                "status": status,
                "source": profile.runtime_asset_path,
                "source_sha256": hashlib.sha256(
                    profile.runtime_asset_path.read_bytes()
                ).hexdigest(),
                "evaluation": evaluation,
                "composite": _compose(base, face, shoe, bottom, top, hair),
            }
        )

    output_root.mkdir(parents=True, exist_ok=True)
    checkerboard_path = output_root / "male-bottoms-full-quality-checkerboard.png"
    black_path = output_root / "male-bottoms-full-quality-black.png"
    metrics_path = output_root / "male-bottoms-full-quality-metrics.json"
    evidence_path = output_root / "male-bottoms-full-quality-evidence.md"
    _render_board(tuple(items), background="checkerboard", output_path=checkerboard_path)
    _render_board(tuple(items), background="black", output_path=black_path)

    metrics = {
        "schema_version": 1,
        "decision": "DIAGNOSTIC_ONLY_VISUAL_REVIEW_REQUIRED",
        "base_identity": "avatar_room_base_male_light_v1",
        "shoe_identity": "milk_tea_court_v7_approved",
        "item_count": len(items),
        "status_counts": status_counts,
        "board_contract": {
            "columns": COLS,
            "cell": list(CELL),
            "closeup_scale": CLOSEUP_SCALE,
            "crops": {
                "waist_top": list(WAIST_CROP),
                "crotch_leg_gap": list(CROTCH_CROP),
                "hem_shoe": list(HEM_CROP),
            },
            "item_order": [item["item_id"] for item in items],
        },
        "items": [
            {
                "item_id": item["item_id"],
                "family": item["family"],
                "status": item["status"],
                "source": item["source"].relative_to(REPO_ROOT).as_posix(),
                "source_sha256": item["source_sha256"],
                **_evaluation_json(item["evaluation"]),
            }
            for item in items
        ],
    }
    metrics_path.write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    evidence_path.write_text(
        "\n".join(
            (
                "# Male bottoms full quality gate v1",
                "",
                "Decision: **DIAGNOSTIC ONLY / INDEPENDENT VISUAL REVIEW REQUIRED**",
                "",
                "- Canonical male base: `avatar_room_base_male_light_v1`.",
                "- Neutral top: `powder_blue_crew_tee_v1`.",
                "- Approved shoe: `milk_tea_court_v7_approved`.",
                "- Scope: all 19 current male bottom layers.",
                "- Each item shows full body plus 4x waist, crotch/leg-gap, and hem/shoe contact.",
                "- Checkerboard and black boards use identical layout and source bytes.",
                "- Automated metrics only flag review risks; they cannot visually PASS a garment.",
                "- This renderer does not mutate runtime assets or authorize promotion.",
                "",
            )
        ),
        encoding="utf-8",
    )
    after = tree_hashes(ROOM_ROOT)
    if before != after:
        raise RuntimeError("runtime asset tree changed while rendering diagnostic evidence")
    external_input_after = {
        path: sha256_file(path) for path in external_input_before
    }
    if external_input_before != external_input_after:
        raise RuntimeError("approved external input changed while rendering evidence")
    return BottomQualityGateResult(
        item_count=len(items),
        status_counts=status_counts,
        checkerboard_path=checkerboard_path,
        black_path=black_path,
        metrics_path=metrics_path,
        evidence_path=evidence_path,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    arguments = parser.parse_args()
    result = render_bottom_quality_gate(arguments.output_root)
    print(
        json.dumps(
            {
                "item_count": result.item_count,
                "status_counts": result.status_counts,
                "checkerboard": str(result.checkerboard_path),
                "black": str(result.black_path),
                "metrics": str(result.metrics_path),
                "evidence": str(result.evidence_path),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
