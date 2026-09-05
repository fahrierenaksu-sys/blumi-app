#!/usr/bin/env python3
"""Stage authored-source long-pant refits for low-shoe contact QA.

The producer imports the canonical procedural garment renderers, then lays each
leg into the approved pose-specific female front-view envelope.  It uses one
bounded resize per complete leg component; there is no patch fill, mesh warp,
shoe repaint, or runtime write.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUT = ROOT / "docs/avatar-motion-pipeline/female-long-pant-shoe-refit-staging/2026-07-15"
SHOE_ROOT = ROOT / "docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15/shoes"
BOTTOM_STAGING = ROOT / "docs/avatar-motion-pipeline/female-bottom-motion-staging/extracted"
SOURCE_SCRIPT = ROOT / "apps/mobile/scripts/generate_bottom_reference_layers.py"
TOP_STAGING = ROOT / "docs/avatar-motion-pipeline/female-premium-top-motion-staging"
CANVAS = (256, 384)
STATES = (
    "static", "walking_front_f01", "walking_front_f02",
    "walking_front_f03", "walking_front_f04", "sitting_front_f01",
)
ITEMS = (
    "black_palm_embellished_pants",
    "coral_embellished_laceup_pants",
    "smoky_floral_mesh_pants",
)
SHOES = (
    "cherry_satin_ballets",
    "onyx_heart_mary_janes",
    "pearl_slingback_sandals",
)
TARGET_BOTTOMS = {
    "static": 344,
    "walking_front_f01": 344,
    "walking_front_f02": 345,
    "walking_front_f03": 344,
    "walking_front_f04": 345,
    "sitting_front_f01": 343,
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def live_path(slug: str, state: str) -> Path:
    if state == "static":
        return ROOM / f"avatar_room_bottom_female_{slug}_v2.png"
    return MOTION / f"room_avatar_bottom_female_{slug}_v2_{state}.png"


def reference_path(slug: str, state: str) -> Path:
    staged = BOTTOM_STAGING / slug / (
        f"avatar_room_bottom_female_{slug}_v2.png"
        if state == "static"
        else f"room_avatar_bottom_female_{slug}_v2_{state}.png"
    )
    return staged if staged.exists() else live_path(slug, state)


def output_path(slug: str, state: str) -> Path:
    return OUT / slug / f"{state}.png"


def shoe_path(slug: str, state: str) -> Path:
    return SHOE_ROOT / slug / f"{state}.png"


def base_path(state: str) -> Path:
    if state == "static":
        return ROOM / "avatar_room_base_female_v2.png"
    return MOTION / f"room_avatar_base_female_v2_{state}.png"


def clean(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    result.putdata([
        (0, 0, 0, 0)
        if alpha == 0 or (alpha <= 8 and green > red + 48 and green > blue + 48)
        else (red, green, blue, alpha)
        for red, green, blue, alpha in result.getdata()
    ])
    return result


def load_renderer_module():
    spec = importlib.util.spec_from_file_location("blumi_bottom_renderers", SOURCE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load canonical bottom renderer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def half_bbox(alpha: Image.Image, left: int, right: int) -> tuple[int, int, int, int]:
    bounds = alpha.crop((left, 0, right, CANVAS[1])).getbbox()
    if bounds is None:
        raise ValueError("empty pant half")
    return bounds[0] + left, bounds[1], bounds[2] + left, bounds[3]


def authored_pose(source: Image.Image, reference: Image.Image, state: str) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    source_alpha = source.getchannel("A")
    reference_alpha = reference.getchannel("A")
    for left, right in ((0, 128), (128, 256)):
        source_box = half_bbox(source_alpha, left, right)
        target_box = half_bbox(reference_alpha, left, right)
        target_box = (target_box[0], target_box[1], target_box[2], TARGET_BOTTOMS[state])
        component = source.crop(source_box).resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        result.alpha_composite(component, target_box[:2])
    # LANCZOS can create isolated 1-alpha ringing pixels around the resized
    # authored component.  Remove those detached pixels after layout; do not
    # alter the connected garment art.
    return retain_authored_garment_component(clean(result), threshold=1)


def component_sizes(image: Image.Image, threshold: int = 16) -> list[int]:
    width, height = image.size
    visible = {
        index for index, value in enumerate(image.getchannel("A").getdata())
        if value > threshold
    }
    sizes: list[int] = []
    while visible:
        stack = [visible.pop()]
        size = 0
        while stack:
            current = stack.pop()
            size += 1
            x, y = current % width, current // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in visible:
                    visible.remove(neighbor)
                    stack.append(neighbor)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def retain_authored_garment_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    """Discard only detached renderer debris; never add or repaint pixels."""
    width, height = image.size
    visible = {
        index for index, value in enumerate(image.getchannel("A").getdata())
        if value > threshold
    }
    components: list[list[int]] = []
    while visible:
        stack = [visible.pop()]
        component: list[int] = []
        while stack:
            current = stack.pop()
            component.append(current)
            x, y = current % width, current // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in visible:
                    visible.remove(neighbor)
                    stack.append(neighbor)
        components.append(component)
    if not components:
        raise ValueError("empty authored garment")
    keep = set(max(components, key=len))
    pixels = list(image.getdata())
    image.putdata([
        pixel if index in keep else (0, 0, 0, 0)
        for index, pixel in enumerate(pixels)
    ])
    return clean(image)


def seam_metrics(base: Image.Image, bottom: Image.Image, shoes: Image.Image) -> dict[str, int]:
    evaluated = exposed = maximum = overlap = 0
    for x in range(94, 162):
        bottom_ys = [y for y in range(312, 352) if bottom.getpixel((x, y))[3] > 16]
        shoe_ys = [y for y in range(312, 352) if shoes.getpixel((x, y))[3] > 16]
        if not bottom_ys or not shoe_ys:
            continue
        evaluated += 1
        bottom_last, shoe_first = bottom_ys[-1], shoe_ys[0]
        if shoe_first <= bottom_last:
            overlap += bottom_last - shoe_first + 1
            continue
        band = sum(
            1 for y in range(bottom_last + 1, shoe_first)
            if base.getpixel((x, y))[3] > 16
            and bottom.getpixel((x, y))[3] <= 16
            and shoes.getpixel((x, y))[3] <= 16
        )
        exposed += band
        maximum = max(maximum, band)
    return {
        "evaluatedColumns": evaluated,
        "exposedBasePixels": exposed,
        "maxExposedBand": maximum,
        "overlapPixels": overlap,
    }


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except OSError:
        return ImageFont.load_default()


def render_pair_matrix(items: dict[str, list[Image.Image]]) -> Path:
    cell = (136, 106)
    sheet = Image.new("RGB", (cell[0] * len(STATES), 44 + cell[1] * len(ITEMS) * len(SHOES)), "#f9eff6")
    draw = ImageDraw.Draw(sheet)
    draw.text((10, 10), "Female long pant x low shoe · Static + 4W + 1S", fill="#493947", font=font(17, True))
    row = 0
    for bottom_slug in ITEMS:
        for shoe_slug in SHOES:
            for column, state in enumerate(STATES):
                avatar = Image.new("RGBA", CANVAS, "#f9eff6")
                avatar.alpha_composite(clean(Image.open(base_path(state))))
                avatar.alpha_composite(clean(Image.open(shoe_path(shoe_slug, state))))
                avatar.alpha_composite(items[bottom_slug][column])
                crop = avatar.crop((78, 300, 178, 360)).resize((cell[0], 82), Image.Resampling.NEAREST)
                x, y = column * cell[0], 44 + row * cell[1]
                sheet.paste(crop.convert("RGB"), (x, y + 24))
                if column == 0:
                    label = f"{bottom_slug.split('_')[0]} + {shoe_slug.split('_')[0]}"
                    draw.text((x + 4, y + 4), label, fill="#584553", font=font(11, True))
            row += 1
    path = OUT / "pant-shoe-9-pair-static-4w1s-matrix.png"
    sheet.save(path, optimize=True)
    return path


def top_source_hashes() -> dict[str, str]:
    return {
        str(path.relative_to(ROOT)): digest(path)
        for path in sorted(TOP_STAGING.glob("*/extracted/*.png"))
    }


def produce() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    before_live = {
        f"{slug}:{state}": digest(live_path(slug, state))
        for slug in ITEMS for state in STATES
    }
    tops_before = top_source_hashes()
    renderer = load_renderer_module()
    staged: dict[str, list[Image.Image]] = {}
    item_records = []
    all_pairs = []
    for slug in ITEMS:
        source = retain_authored_garment_component(clean(getattr(renderer, f"render_{slug}")()))
        frames = []
        frame_records = []
        for state in STATES:
            candidate = authored_pose(source, clean(Image.open(reference_path(slug, state))), state)
            path = output_path(slug, state)
            path.parent.mkdir(parents=True, exist_ok=True)
            candidate.save(path, optimize=True)
            bounds = candidate.getchannel("A").getbbox()
            components = component_sizes(candidate)
            frame_records.append({
                "state": state,
                "path": str(path.relative_to(ROOT)),
                "sha256": digest(path),
                "bbox": list(bounds) if bounds else None,
                "componentSizes": components,
            })
            frames.append(candidate)
        staged[slug] = frames
        boxes = [frame.getchannel("A").getbbox() for frame in frames]
        item_records.append({
            "slug": slug,
            "frames": frame_records,
            "allFramesSingleComponent": all(len(component_sizes(frame)) == 1 for frame in frames),
            "maxCenterlineDeviation": max(abs((box[0] + box[2]) / 2 - 128) for box in boxes if box),
            "minHemY": min(box[3] - 1 for box in boxes if box),
        })
        for shoe_slug in SHOES:
            for state, bottom in zip(STATES, frames):
                metrics = seam_metrics(
                    clean(Image.open(base_path(state))),
                    bottom,
                    clean(Image.open(shoe_path(shoe_slug, state))),
                )
                all_pairs.append({"bottom": slug, "shoes": shoe_slug, "state": state, **metrics})
    matrix = render_pair_matrix(staged)
    after_live = {
        f"{slug}:{state}": digest(live_path(slug, state))
        for slug in ITEMS for state in STATES
    }
    metrics = {
        "schemaVersion": 1,
        "itemCount": len(ITEMS),
        "states": list(STATES),
        "frameDurationMs": 120,
        "method": "authored-static-source-plus-bounded-per-leg-pose-layout",
        "liveAssetsUntouched": before_live == after_live,
        "liveSha256": before_live,
        "topCandidateSourcesUntouched": tops_before == top_source_hashes(),
        "items": item_records,
        "pairCount": len(ITEMS) * len(SHOES),
        "pairStateMetrics": all_pairs,
        "allPairStatesPass": all(
            row["evaluatedColumns"] >= 10
            and row["exposedBasePixels"] == 0
            and row["maxExposedBand"] == 0
            for row in all_pairs
        ),
        "matrix": str(matrix.relative_to(ROOT)),
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))


def check() -> None:
    path = OUT / "metrics.json"
    metrics = json.loads(path.read_text())
    failures = []
    if metrics.get("itemCount") != 3 or metrics.get("states") != list(STATES):
        failures.append("scope/state drift")
    if not metrics.get("allPairStatesPass"):
        failures.append("stored pair seam verdict is HOLD")
    if not metrics.get("topCandidateSourcesUntouched"):
        failures.append("top candidate source hashes changed during production")
    current_live = {
        f"{slug}:{state}": digest(live_path(slug, state))
        for slug in ITEMS for state in STATES
    }
    candidate_hashes = {
        f"{item['slug']}:{frame['state']}": frame["sha256"]
        for item in metrics.get("items", [])
        for frame in item.get("frames", [])
    }
    if current_live != metrics.get("liveSha256") and current_live != candidate_hashes:
        failures.append("live assets drift from both the pre-promotion and promoted candidate hashes")
    for item in metrics.get("items", []):
        slug = item["slug"]
        for state in STATES:
            candidate_path = output_path(slug, state)
            if not candidate_path.exists():
                failures.append(f"missing {slug}/{state}")
                continue
            candidate = clean(Image.open(candidate_path))
            sizes = component_sizes(candidate)
            bounds = candidate.getchannel("A").getbbox()
            if len(sizes) != 1:
                failures.append(f"{slug}/{state} detached components: {sizes[:4]}")
            if bounds is None or bounds[3] - 1 < 337:
                failures.append(f"{slug}/{state} hem too short")
            for shoe_slug in SHOES:
                seam = seam_metrics(
                    clean(Image.open(base_path(state))),
                    candidate,
                    clean(Image.open(shoe_path(shoe_slug, state))),
                )
                if seam["evaluatedColumns"] < 10 or seam["exposedBasePixels"] or seam["maxExposedBand"]:
                    failures.append(f"{slug}/{shoe_slug}/{state}: {seam}")
    if not (OUT / "pant-shoe-9-pair-static-4w1s-matrix.png").exists():
        failures.append("missing 9-pair matrix")
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
