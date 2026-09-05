#!/usr/bin/env python3
"""Produce and audit the catalog-projected female non-dress sitting wardrobe.

The sitting state uses the canonical female base.  The manifest is derived by
intersecting the public avatar catalog IDs with their room projection, so a
new visible projected item cannot silently escape the evidence surface.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
FEATURE = ROOT / "apps/mobile/src/features/avatarV2"
ROOM = FEATURE / "assets/room"
MOTION = ROOM / "motion"
PROJECTION = FEATURE / "room/avatarRoomProjection.ts"
CATALOG = FEATURE / "avatarV2.mock.ts"
QA = ROOT / "docs/avatar-motion-pipeline/female-sitting-wardrobe-qa"
CANVAS = (256, 384)
FIT_PROFILE = "blumi_female_room_avatar_v1"
RIG = "blumi_2_5d_layered_v1"
NON_DRESS_TYPES = ("top", "bottom", "shoes", "accessory")
BODY_ANCHORED_ACCESSORIES = {"room_avatar_accessory_female_cherry_micro_bag_v2"}


@dataclass(frozen=True)
class Item:
    avatar_id: str
    room_id: str
    kind: str


def projected_items() -> list[Item]:
    catalog_text = CATALOG.read_text()
    catalog_ids = set(re.findall(r'\bid:\s*"(avatar_v2_[^"]+)"', catalog_text))
    # The three default catalog rows reference DEFAULT_AVATAR_V2 fields rather
    # than repeating their string IDs; include the values from that object.
    default_block = re.search(r'export const DEFAULT_AVATAR_V2[^=]*=\s*\{([^}]+)\}', catalog_text)
    if default_block:
        catalog_ids.update(re.findall(r'"(avatar_v2_[^"]+)"', default_block.group(1)))
    text = PROJECTION.read_text()
    result: dict[str, Item] = {}
    for avatar_id, body in re.findall(r'(avatar_v2_[a-z0-9_]+):\s*\{([^}]+)\}', text):
        if avatar_id not in catalog_ids:
            continue
        for kind, field in (
            ("top", "topId"), ("bottom", "bottomId"), ("shoes", "shoesId")
        ):
            match = re.search(rf'{field}:\s*"(room_avatar_{kind}_female_[^"]+)"', body)
            if match and "dress" not in match.group(1):
                result[match.group(1)] = Item(avatar_id, match.group(1), kind)
        for room_id in re.findall(r'"(room_avatar_accessory_female_[^"]+)"', body):
            result[room_id] = Item(avatar_id, room_id, "accessory")
    return sorted(result.values(), key=lambda item: (NON_DRESS_TYPES.index(item.kind), item.room_id))


def paths(item: Item) -> tuple[Path, Path]:
    slug = item.room_id.removeprefix("room_avatar_")
    return (
        ROOM / f"avatar_room_{slug}.png",
        MOTION / f"{item.room_id}_sitting_front_f01.png",
    )


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def alpha_digest(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def is_identical(left: Image.Image, right: Image.Image) -> bool:
    return ImageChops.difference(left.convert("RGBA"), right.convert("RGBA")).getbbox() is None


def item_findings(items: list[Item]) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    for item in items:
        static_path, sitting_path = paths(item)
        issues: list[str] = []
        if not static_path.exists() or not sitting_path.exists():
            issues.append("missing asset")
            findings.append({"id": item.room_id, "type": item.kind, "issues": issues})
            continue
        static = Image.open(static_path).convert("RGBA")
        sitting = Image.open(sitting_path).convert("RGBA")
        if static.size != CANVAS or sitting.size != CANVAS:
            issues.append("canvas must be 256x384")
        copied = is_identical(static, sitting)
        requires_pose_change = item.kind in {"top", "bottom", "shoes"} or item.room_id in BODY_ANCHORED_ACCESSORIES
        if requires_pose_change and copied:
            issues.append("sitting is a pixel-identical static copy")
        bbox = alpha_bbox(sitting)
        if bbox is None:
            issues.append("empty alpha")
        if item.kind == "shoes" and bbox and bbox[3] not in (346, 347):
            issues.append(f"shoe baseline {bbox[3]} outside 346..347")
        findings.append(
            {
                "id": item.room_id,
                "avatarId": item.avatar_id,
                "type": item.kind,
                "fitProfileId": FIT_PROFILE,
                "rigId": RIG,
                "staticIdentical": copied,
                "bbox": bbox,
                "alphaSha256": alpha_digest(sitting),
                "issues": issues,
                "technicalGate": "FAIL" if issues else "PASS",
                "visualInspectionRequired": True,
                "producerVerdict": "HOLD",
            }
        )
    return findings


def load(room_id: str) -> Image.Image:
    path = MOTION / f"{room_id}_sitting_front_f01.png"
    return Image.open(path).convert("RGBA")


def compose(
    top: str,
    bottom: str,
    shoes: str,
    trousers: bool,
    accessory: str | None = None,
) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#f9eff6")
    for room_id in (
        "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
        "room_avatar_base_female_v2",
        "room_avatar_face_female_soft_doll_foundation_v2",
        "room_avatar_eyes_female_mocha_doe_v2",
        "room_avatar_nose_female_soft_button_v2",
        "room_avatar_mouth_female_peach_whisper_smile_v2",
    ):
        result.alpha_composite(load(room_id))
    if trousers:
        result.alpha_composite(load(shoes))
        result.alpha_composite(load(bottom))
    else:
        result.alpha_composite(load(bottom))
        result.alpha_composite(load(shoes))
    result.alpha_composite(load(top))
    result.alpha_composite(load("room_avatar_hair_front_female_mocha_ribbon_blowout_v2"))
    if accessory:
        result.alpha_composite(load(accessory))
    return result


def render_evidence(items: list[Item], findings: list[dict[str, object]]) -> None:
    QA.mkdir(parents=True, exist_ok=True)
    tops = [item.room_id for item in items if item.kind == "top"]
    bottoms = [item.room_id for item in items if item.kind == "bottom"]
    shoes = [item.room_id for item in items if item.kind == "shoes"]
    accessories = [item.room_id for item in items if item.kind == "accessory"]
    default_shoes = next(item for item in shoes if "milk_tea" in item)
    columns, cell_w, cell_h = 4, 292, 300
    rows = (len(tops) * len(bottoms) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_w, 58 + rows * cell_h), "#f9eff6")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 14), "Female sitting · catalog-projected top × bottom seam matrix", fill="#392b37", font=font(22, True))
    index = 0
    for top in tops:
        for bottom in bottoms:
            trousers = "pants" in bottom
            avatar = compose(top, bottom, default_shoes, trousers)
            x = (index % columns) * cell_w
            y = 58 + (index // columns) * cell_h
            label = f"{top.split('female_')[1].removesuffix('_v2')} + {bottom.split('female_')[1].removesuffix('_v2')}"
            draw.text((x + 8, y + 5), label[:42], fill="#563f50", font=font(11))
            sheet.alpha_composite(avatar.crop((55, 64, 201, 354)).resize((146, 290)), (x + 72, y + 22))
            index += 1
    sheet.convert("RGB").save(QA / "2026-07-15-female-sitting-top-bottom-contact-sheet.png", optimize=True)

    close_columns, close_cell_w, close_cell_h = 4, 276, 330
    close_rows = (len(tops) * len(bottoms) + close_columns - 1) // close_columns
    close_sheet = Image.new(
        "RGBA", (close_columns * close_cell_w, 58 + close_rows * close_cell_h), "#f9eff6"
    )
    close_draw = ImageDraw.Draw(close_sheet)
    close_draw.text(
        (16, 14), "Female sitting · 2× neckline / waist / crotch / shoe close-up",
        fill="#392b37", font=font(22, True),
    )
    index = 0
    for top in tops:
        for bottom in bottoms:
            trousers = "pants" in bottom
            avatar = compose(top, bottom, default_shoes, trousers)
            x = (index % close_columns) * close_cell_w
            y = 58 + (index // close_columns) * close_cell_h
            label = f"{top.split('female_')[1].removesuffix('_v2')} + {bottom.split('female_')[1].removesuffix('_v2')}"
            close_draw.text((x + 8, y + 4), label[:42], fill="#563f50", font=font(11))
            crop = avatar.crop((65, 202, 191, 352)).resize((252, 300), Image.Resampling.NEAREST)
            close_sheet.alpha_composite(crop, (x + 12, y + 24))
            index += 1
    close_sheet.convert("RGB").save(
        QA / "2026-07-15-female-sitting-fit-zone-closeups.png", optimize=True
    )

    def render_category_sheet(category: str, room_ids: list[str]) -> None:
        category_columns = 4
        category_rows = (len(room_ids) + category_columns - 1) // category_columns
        category_sheet = Image.new(
            "RGBA", (category_columns * 292, 58 + category_rows * 324), "#f9eff6"
        )
        category_draw = ImageDraw.Draw(category_sheet)
        category_draw.text(
            (16, 14), f"Female sitting · catalog-projected {category}",
            fill="#392b37", font=font(22, True),
        )
        default_top = next(item for item in tops if "cream_basic" in item)
        default_bottom = next(item for item in bottoms if "denim_skort" in item)
        for index, room_id in enumerate(room_ids):
            selected_shoes = room_id if category == "shoes" else default_shoes
            selected_accessory = room_id if category == "accessories" else None
            avatar = compose(default_top, default_bottom, selected_shoes, False, selected_accessory)
            x = (index % category_columns) * 292
            y = 58 + (index // category_columns) * 324
            category_draw.text(
                (x + 8, y + 4), room_id.split("female_")[1].removesuffix("_v2")[:40],
                fill="#563f50", font=font(12),
            )
            category_sheet.alpha_composite(
                avatar.crop((55, 54, 217, 354)).resize((162, 300)), (x + 65, y + 24)
            )
        category_sheet.convert("RGB").save(
            QA / f"2026-07-15-female-sitting-{category}-contact-sheet.png", optimize=True
        )

    render_category_sheet("shoes", shoes)
    render_category_sheet("accessories", accessories)

    evidence = {
        "schemaVersion": 1,
        "source": [str(CATALOG.relative_to(ROOT)), str(PROJECTION.relative_to(ROOT))],
        "canonicalBase": "apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_base_female_v2_sitting_front_f01.png",
        "fitProfileId": FIT_PROFILE,
        "rigId": RIG,
        "items": findings,
    }
    (QA / "2026-07-15-female-sitting-item-verdicts.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--check-catalog", action="store_true")
    parser.add_argument("--evidence", action="store_true")
    args = parser.parse_args()
    items = projected_items()
    counts = {kind: sum(item.kind == kind for item in items) for kind in NON_DRESS_TYPES}
    expected = {"top": 6, "bottom": 7, "shoes": 5, "accessory": 12}
    if counts != expected:
        raise SystemExit(f"catalog/projection scope drift: expected {expected}, got {counts}")
    findings = item_findings(items)
    if args.evidence:
        render_evidence(items, findings)
    failures = [item for item in findings if item["issues"]]
    print(json.dumps({"counts": counts, "failures": failures}, indent=2))
    if args.check and failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
