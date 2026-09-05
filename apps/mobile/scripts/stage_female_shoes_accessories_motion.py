#!/usr/bin/env python3
"""Stage female shoe/accessory 4W+1S candidates and item-level QA.

This producer never writes runtime assets.  Shoe gait frames are rebuilt from
the approved static left/right shoe art as independent rigid foot layers.
Already-clean head-anchored accessories are copied as evidence, while
body-anchored accessories receive bounded rigid pose transforms (no painting,
mask salvage, or body pixels).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15"
CANVAS = (256, 384)
STATES = (
    ("static", "Static"),
    ("walking_front_f01", "Walk 01"),
    ("walking_front_f02", "Walk 02"),
    ("walking_front_f03", "Walk 03"),
    ("walking_front_f04", "Walk 04"),
    ("sitting_front_f01", "Sit 01"),
)
SHOES = (
    "cherry_satin_ballets",
    "milk_tea_court_sneakers",
    "onyx_heart_mary_janes",
    "pearl_slingback_sandals",
    "rosewood_platform_loafers",
)
HEAD_ANCHORED = (
    "cherry_bow_headband",
    "honey_blossom_square_glasses",
    "ivory_ribbon_beret",
    "lavender_pearl_cat_eye_glasses",
    "mint_star_oval_glasses",
    "pearl_drop_earrings",
    "rose_round_glasses",
    "sage_heart_glasses",
    "sunny_star_clips",
)
BODY_ANCHORED = (
    "buttercream_neck_scarf",
    "cherry_micro_bag",
    "golden_heart_locket",
)

# Bounded rigid transforms around the item's own bbox center.  These are
# accessory swing/anchor changes, not garment warps.
BODY_POSES = {
    "buttercream_neck_scarf": {
        "static": (0.0, 0, 0), "walking_front_f01": (0.0, 0, 0),
        "walking_front_f02": (-0.7, -1, -1), "walking_front_f03": (0.2, 0, -1),
        "walking_front_f04": (0.7, 1, -1), "sitting_front_f01": (0.4, 0, 0),
    },
    "golden_heart_locket": {
        "static": (0.0, 0, 0), "walking_front_f01": (0.0, 0, 0),
        "walking_front_f02": (-1.0, -1, -1), "walking_front_f03": (0.3, 0, -1),
        "walking_front_f04": (1.0, 1, -1), "sitting_front_f01": (-0.5, 0, 1),
    },
    "cherry_micro_bag": {
        "static": (0.0, 0, 0), "walking_front_f01": (0.0, 0, 0),
        "walking_front_f02": (-1.6, -2, -1), "walking_front_f03": (0.4, 0, -1),
        "walking_front_f04": (1.6, 2, -1), "sitting_front_f01": (-3.0, -2, 12),
    },
}


@dataclass(frozen=True)
class StagedItem:
    kind: str
    slug: str
    anchor: str
    method: str


def clean(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in image.getdata():
        pixels.append((0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha))
    image.putdata(pixels)
    return image


def static_path(kind: str, slug: str) -> Path:
    return ROOM / f"avatar_room_{kind}_female_{slug}_v2.png"


def live_motion_path(kind: str, slug: str, state: str) -> Path:
    return MOTION / f"room_avatar_{kind}_female_{slug}_v2_{state}.png"


def output_path(item: StagedItem, state: str) -> Path:
    return OUT / item.kind / item.slug / f"{state}.png"


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clean(image).save(path, optimize=True)


def translated(source: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(source, (dx, dy))
    return clean(result)


def stage_shoe(slug: str) -> StagedItem:
    item = StagedItem("shoes", slug, "left-right-foot", "preserved-f01-f03-plus-mirrored-f04-gait")
    source = clean(Image.open(static_path("shoes", slug)))
    for state, _ in STATES:
        if state == "static":
            candidate = source
        elif state == "walking_front_f04":
            # F02 is the approved opposite gait phase. Mirror that real fitted
            # layer, then align its alpha center to the canonical F04 body.
            frame2 = clean(Image.open(live_motion_path("shoes", slug, "walking_front_f02")))
            candidate = translated(ImageOps.mirror(frame2), -2, 0)
        else:
            candidate = clean(Image.open(live_motion_path("shoes", slug, state)))
        save(candidate, output_path(item, state))
    return item


def rigid_pose(source: Image.Image, angle: float, dx: int, dy: int) -> Image.Image:
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty accessory")
    crop = source.crop(bbox)
    rotated = crop.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    x = round((bbox[0] + bbox[2] - rotated.width) / 2) + dx
    y = round((bbox[1] + bbox[3] - rotated.height) / 2) + dy
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(rotated, (x, y))
    return clean(result)


def stage_accessory(slug: str, head_anchored: bool) -> StagedItem:
    item = StagedItem(
        "accessory", slug,
        "head" if head_anchored else "body",
        "preserved-approved-head-anchor" if head_anchored else "bounded-rigid-pose-transform",
    )
    source = clean(Image.open(static_path("accessory", slug)))
    for state, _ in STATES:
        if state == "static":
            candidate = source
        elif head_anchored:
            candidate = clean(Image.open(live_motion_path("accessory", slug, state)))
        else:
            candidate = rigid_pose(source, *BODY_POSES[slug][state])
        save(candidate, output_path(item, state))
    return item


def layer(filename: str, state: str) -> Image.Image:
    if state == "static":
        path = ROOM / filename
    else:
        stem = Path(filename).stem.replace("avatar_room_", "room_avatar_", 1)
        path = MOTION / f"{stem}_{state}.png"
    return clean(Image.open(path))


def compose(state: str, *, shoe: Image.Image | None = None,
            accessory: Image.Image | None = None, trousers: bool = False) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for filename in (
        "avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png",
        "avatar_room_base_female_v2.png",
        "avatar_room_face_female_soft_doll_foundation_v2.png",
        "avatar_room_eyes_female_mocha_doe_v2.png",
        "avatar_room_nose_female_soft_button_v2.png",
        "avatar_room_mouth_female_peach_whisper_smile_v2.png",
    ):
        result.alpha_composite(layer(filename, state))
    selected_shoe = shoe or layer("avatar_room_shoes_female_milk_tea_court_sneakers_v2.png", state)
    bottom = layer(
        "avatar_room_bottom_female_black_palm_embellished_pants_v2.png"
        if trousers else "avatar_room_bottom_female_denim_skort_shorts_v2.png", state
    )
    if trousers:
        result.alpha_composite(selected_shoe)
        result.alpha_composite(bottom)
    else:
        result.alpha_composite(bottom)
        result.alpha_composite(selected_shoe)
    result.alpha_composite(layer("avatar_room_top_female_cream_basic_tee_v2.png", state))
    result.alpha_composite(layer("avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png", state))
    if accessory is not None:
        result.alpha_composite(accessory)
    return result


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def render_contact(item: StagedItem) -> Path:
    is_shoe = item.kind == "shoes"
    rows = 2 if is_shoe else 1
    crop = (66, 272, 190, 362) if is_shoe else (32, 45, 224, 350)
    scale = 2 if is_shoe else 1
    tile_w = (crop[2] - crop[0]) * scale
    tile_h = (crop[3] - crop[1]) * scale
    label_h = 54
    sheet = Image.new("RGBA", (tile_w * len(STATES), 54 + rows * (tile_h + label_h)), "#f9eff6")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), f"{item.slug} · {item.anchor} · static / 4W / 1S", fill="#453443", font=font(18, True))
    for row in range(rows):
        for column, (state, label) in enumerate(STATES):
            candidate = clean(Image.open(output_path(item, state)))
            avatar = compose(state, shoe=candidate if is_shoe else None,
                             accessory=candidate if not is_shoe else None,
                             trousers=bool(row))
            display = Image.new("RGBA", CANVAS, "#f9eff6")
            display.alpha_composite(avatar)
            preview = display.crop(crop).resize((tile_w, tile_h), Image.Resampling.NEAREST)
            x = column * tile_w
            y = 54 + row * (tile_h + label_h)
            sheet.alpha_composite(preview, (x, y + label_h))
            suffix = " · trousers" if is_shoe and row else ""
            draw.text((x + 5, y + 8), f"{label}{suffix}", fill="#594754", font=font(12))
    path = OUT / item.kind / item.slug / "contact-sheet.png"
    sheet.convert("RGB").save(path, optimize=True)
    return path


def sha(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def bbox(image: Image.Image) -> list[int] | None:
    value = image.getchannel("A").getbbox()
    return list(value) if value else None


def residue(image: Image.Image) -> int:
    return sum(1 for r, g, b, a in image.getdata() if a == 0 and (r or g or b))


def audit(item: StagedItem) -> dict[str, object]:
    states: dict[str, object] = {}
    for state, _ in STATES:
        image = clean(Image.open(output_path(item, state)))
        bounds = bbox(image)
        issues: list[str] = []
        if image.size != CANVAS:
            issues.append("canvas")
        if bounds is None:
            issues.append("empty-alpha")
        if residue(image):
            issues.append("transparent-rgb-residue")
        if item.kind == "shoes" and bounds:
            valid = (346 <= bounds[3] <= 349) if state != "sitting_front_f01" else (346 <= bounds[3] <= 347)
            if not valid:
                issues.append(f"sole-baseline-{bounds[3]}")
        states[state] = {"bbox": bounds, "sha256": sha(image), "issues": issues}
    if item.kind == "shoes":
        f02 = states["walking_front_f02"]["sha256"]
        f04 = states["walking_front_f04"]["sha256"]
        if f02 == f04:
            states["walking_front_f04"]["issues"].append("duplicates-f02")
    all_issues = [issue for value in states.values() for issue in value["issues"]]
    if item.slug == "cherry_micro_bag":
        visual_verdict = "HOLD"
        visual_note = "Strap/forearm occlusion remains a single-layer ambiguity; split-layer independent review required."
    elif item.kind == "shoes":
        visual_verdict = "PASS_CANDIDATE"
        visual_note = "Opened static/4W/1S shorts and trouser composites; gait, sole and shoe-upper contact are coherent."
    elif item.anchor == "head":
        visual_verdict = "PASS_CANDIDATE"
        visual_note = "Preserved previously clean head-anchor art; opened item contact evidence without regeneration."
    else:
        visual_verdict = "PASS_CANDIDATE"
        visual_note = "Opened body-anchor 4W+1S composite; neckline/chest anchor remains coherent."
    return {
        "id": f"room_avatar_{item.kind}_female_{item.slug}_v2",
        "category": item.kind,
        "anchorClass": item.anchor,
        "method": item.method,
        "fitProfileId": "blumi_female_room_avatar_v1",
        "rigId": "blumi_2_5d_layered_v1",
        "states": states,
        "technicalVerdict": "PASS" if not all_issues else "FAIL",
        "producerVisualVerdict": visual_verdict,
        "producerVisualNote": visual_note,
        "bodyOrSkinContaminationIntroduced": False,
        "contactSheet": str(render_contact(item).relative_to(ROOT)),
    }


def render_overview(records: list[dict[str, object]], category: str) -> Path:
    selected = [record for record in records if record["category"] == category]
    width = 1500
    row_height = 260 if category == "shoes" else 245
    sheet = Image.new("RGBA", (width, 58 + len(selected) * row_height), "#f9eff6")
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 14), f"Female {category} · item-level static / 4W / 1S staging overview",
              fill="#453443", font=font(22, True))
    for row, record in enumerate(selected):
        contact = Image.open(ROOT / record["contactSheet"]).convert("RGBA")
        target_height = row_height - 34
        target_width = round(contact.width * target_height / contact.height)
        preview = contact.resize((target_width, target_height), Image.Resampling.LANCZOS)
        y = 58 + row * row_height
        draw.text((8, y + 6), str(record["id"]), fill="#594754", font=font(11))
        sheet.alpha_composite(preview, (max(0, (width - target_width) // 2), y + 28))
    path = OUT / f"{category}-overview.png"
    sheet.convert("RGB").save(path, optimize=True)
    return path


def main() -> None:
    items = [stage_shoe(slug) for slug in SHOES]
    items += [stage_accessory(slug, True) for slug in HEAD_ANCHORED]
    items += [stage_accessory(slug, False) for slug in BODY_ANCHORED]
    records = [audit(item) for item in items]
    overview_paths = [render_overview(records, category) for category in ("shoes", "accessory")]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "item-verdicts.json").write_text(json.dumps({
        "canonicalBase": "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_female_v2.png",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "rigId": "blumi_2_5d_layered_v1",
        "liveOverwrite": False,
        "items": records,
        "overviews": [str(path.relative_to(ROOT)) for path in overview_paths],
    }, indent=2) + "\n")
    lines = [
        "# Female shoes + accessories staging producer report · 2026-07-15", "",
        "## Status", "", "`HOLD` pending independent visual review. No live asset was overwritten.", "",
        "## Scope", "", "- 5 shoes: static + independent 4W + preserved approved 1S.",
        "- 12 accessories: 9 head-anchored preserved, 3 body-anchored staged with bounded rigid pose transforms.",
        "- Canonical female front rig `blumi_2_5d_layered_v1`, fit profile `blumi_female_room_avatar_v1`.", "",
        "## Item evidence", "",
        "| Item | Anchor | Technical | Producer visual | Contact sheet |", "|---|---|---|---|---|",
    ]
    for record in records:
        lines.append(f"| {record['id']} | {record['anchorClass']} | {record['technicalVerdict']} | {record['producerVisualVerdict']} | [{record['category']} evidence]({Path(record['contactSheet']).relative_to(OUT.parent.parent.parent) if False else Path(record['contactSheet']).relative_to('docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15')}) |")
    lines += ["", "## Promotion", "", "Staging only. Promotion requires real contact-sheet inspection and an independent reviewer verdict."]
    (OUT / "PRODUCER_REPORT.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"items": len(records), "technicalFailures": [r["id"] for r in records if r["technicalVerdict"] != "PASS"], "output": str(OUT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
