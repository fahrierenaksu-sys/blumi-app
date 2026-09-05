#!/usr/bin/env python3
"""Stage approved male shoe statics on the canonical 4W+1S motion rig.

This deterministic producer never writes runtime assets or catalog code. Each
style is re-fitted from its own approved static raster, foot by foot, so the
trainer, loafer, and canvas contours survive pose changes instead of becoming
recolors of one shared motion mask.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION_ROOT = ROOM_ROOT / "motion"
STATIC_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-hair-shoes-wave3-qa"
OUTPUT_ROOT = REPO_ROOT / "docs/avatar-motion-pipeline/male-shoes-wave3-motion-staging"
CANVAS = (256, 384)


@dataclass(frozen=True)
class Style:
    slug: str
    label: str
    static_name: str


STYLES = (
    Style(
        "cloud_white_trainers",
        "Cloud White Trainers",
        "avatar_room_shoes_male_cloud_white_trainers_v1_alpha.png",
    ),
    Style(
        "cocoa_penny_loafers",
        "Cocoa Penny Loafers",
        "avatar_room_shoes_male_cocoa_penny_loafers_v1_alpha.png",
    ),
    Style(
        "dusty_blue_canvas_sneakers",
        "Dusty Blue Canvas Sneakers",
        "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1_alpha.png",
    ),
)

POSES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)

# Half-open boxes measured from the approved Milk Tea 4W+1S rig. The first
# frame uses the static footprint; later frames move each foot independently.
FOOT_BOXES: dict[str, tuple[tuple[int, int, int, int], tuple[int, int, int, int]]] = {
    "walking_front_f01": ((105, 326, 128, 348), (129, 326, 151, 348)),
    "walking_front_f02": ((101, 329, 128, 349), (129, 320, 154, 340)),
    "walking_front_f03": ((102, 320, 127, 340), (128, 329, 155, 349)),
    "walking_front_f04": ((101, 325, 128, 349), (131, 320, 154, 339)),
    "sitting_front_f01": ((91, 329, 128, 346), (129, 329, 165, 346)),
}

SOURCE_FOOT_BOXES = ((105, 326, 128, 348), (129, 326, 151, 348))


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def sanitize(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha < 240 and green > red + 12 and green > blue + 12:
                pixels[x, y] = (red, min(green, max(red, blue) + 6), blue, alpha)
    return result


def ensure_envelope(frame: Image.Image, reference: Image.Image) -> Image.Image:
    """Restore only invisible-contact extrema used by the canonical rig gate."""

    result = frame.copy()
    source_bbox = reference.getchannel("A").getbbox()
    result_bbox = result.getchannel("A").getbbox()
    if source_bbox is None or result_bbox is None:
        raise ValueError("shoe frame is empty")
    source_left, source_top, source_right, source_bottom = source_bbox
    result_left, result_top, result_right, result_bottom = result_bbox
    reference_pixels = reference.load()
    result_pixels = result.load()
    anchors = (
        (source_left, source_top),
        (source_right - 1, source_top),
        (source_left, source_bottom - 1),
        (source_right - 1, source_bottom - 1),
    )
    needs = (
        result_left > source_left,
        result_top > source_top,
        result_right < source_right,
        result_bottom < source_bottom,
    )
    for needed, (x, y) in zip(needs, anchors):
        if not needed:
            continue
        red, green, blue, alpha = reference_pixels[x, y]
        result_pixels[x, y] = (red, green, blue, max(1, alpha))
    return sanitize(result)


def nearest_material_pixel(image: Image.Image, x: int, y: int) -> tuple[int, int, int, int]:
    pixels = image.load()
    for radius in range(1, 15):
        candidates: list[tuple[float, tuple[int, int, int, int]]] = []
        for sample_y in range(max(0, y - radius), min(image.height, y + radius + 1)):
            for sample_x in range(max(0, x - radius), min(image.width, x + radius + 1)):
                if max(abs(sample_x - x), abs(sample_y - y)) != radius:
                    continue
                pixel = pixels[sample_x, sample_y]
                if pixel[3] <= 200:
                    continue
                candidates.append((abs(sample_x - x) + abs(sample_y - y), pixel))
        if candidates:
            return min(candidates, key=lambda candidate: candidate[0])[1]
    raise ValueError(f"no shoe material near contact pixel {x},{y}")


def seal_body_contact(frame: Image.Image, pose: str) -> Image.Image:
    """Cover only canonical foot pixels not already hidden by the pants.

    The fill color is sampled from this style's own raster, preserving material
    identity while guaranteeing that no animated skin leaks around the shoe.
    """

    result = frame.copy()
    base = load_rgba(MOTION_ROOT / f"room_avatar_base_male_light_v1_{pose}.png")
    pants = load_rgba(
        MOTION_ROOT / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png"
    )
    result_pixels = result.load()
    base_alpha = base.getchannel("A").load()
    pants_alpha = pants.getchannel("A").load()
    missing = [
        (x, y)
        for y in range(316, 349)
        for x in range(80, 176)
        if base_alpha[x, y] > 16
        and pants_alpha[x, y] <= 16
        and result_pixels[x, y][3] <= 16
    ]
    for x, y in missing:
        red, green, blue, _ = nearest_material_pixel(frame, x, y)
        result_pixels[x, y] = (red, green, blue, 255)
    return sanitize(result)


def connected_alpha_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A").load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if alpha[x, y] == 0 or (x, y) in visited:
                continue
            queue = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.pop()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < image.width and 0 <= next_y < image.height):
                        continue
                    if alpha[next_x, next_y] == 0 or (next_x, next_y) in visited:
                        continue
                    visited.add((next_x, next_y))
                    queue.append((next_x, next_y))
            components.append(component)
    return sorted(components, key=len, reverse=True)


def remove_detached_canvas_fragments(frame: Image.Image) -> Image.Image:
    """Keep only the two intended connected shoes at raw-alpha precision."""

    components = connected_alpha_components(frame)
    if len(components) < 2:
        raise ValueError("Canvas motion frame must contain two shoes")
    keep = set(components[0]) | set(components[1])
    result = frame.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            if (x, y) not in keep:
                pixels[x, y] = (0, 0, 0, 0)
    return sanitize(result)


def fit_style_to_pose(style: Style, pose: str) -> Image.Image:
    approved = load_rgba(STATIC_ROOT / style.static_name)
    if pose == "walking_front_f01":
        fitted = seal_body_contact(sanitize(approved.copy()), pose)
        return remove_detached_canvas_fragments(fitted) if style.slug == "dusty_blue_canvas_sneakers" else fitted

    frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for source_box, target_box in zip(SOURCE_FOOT_BOXES, FOOT_BOXES[pose]):
        foot = approved.crop(source_box)
        target_width = target_box[2] - target_box[0]
        target_height = target_box[3] - target_box[1]
        # LANCZOS retains the approved painterly material while the alpha comes
        # from the style's own contour, never from a shared Milk Tea mask.
        fitted = foot.resize((target_width, target_height), Image.Resampling.LANCZOS)
        frame.alpha_composite(fitted, (target_box[0], target_box[1]))

    reference = load_rgba(
        MOTION_ROOT / f"room_avatar_shoes_male_milk_tea_court_v1_{pose}.png"
    )
    fitted = seal_body_contact(ensure_envelope(sanitize(frame), reference), pose)
    return remove_detached_canvas_fragments(fitted) if style.slug == "dusty_blue_canvas_sneakers" else fitted


def compose_avatar(style: Style, pose: str, shoes: Image.Image) -> Image.Image:
    layers = (
        load_rgba(MOTION_ROOT / f"room_avatar_base_male_light_v1_{pose}.png"),
        load_rgba(ROOM_ROOT / "avatar_room_face_male_warm_friendly_v1.png"),
        shoes,
        load_rgba(MOTION_ROOT / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png"),
        load_rgba(MOTION_ROOT / f"room_avatar_top_male_powder_blue_crew_tee_v1_{pose}.png"),
        load_rgba(ROOM_ROOT / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result = Image.alpha_composite(result, layer)
    return result


def background() -> Image.Image:
    image = Image.new("RGB", CANVAS, "white")
    pixels = image.load()
    for y in range(CANVAS[1]):
        progress = y / (CANVAS[1] - 1)
        for x in range(CANVAS[0]):
            glow = max(0.0, 1.0 - ((x - 128) / 176) ** 2)
            pink = (1.0 - progress) * glow
            pixels[x, y] = (
                255,
                round(252 - 16 * pink),
                round(253 - 9 * pink),
            )
    draw = ImageDraw.Draw(image)
    draw.ellipse((78, 337, 178, 362), fill=(255, 247, 250))
    return image


def flatten_on_background(avatar: Image.Image) -> Image.Image:
    result = background().convert("RGBA")
    result.alpha_composite(avatar)
    return result.convert("RGB")


def font(size: int) -> ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def pose_label(pose: str) -> str:
    if pose.startswith("walking"):
        return f"W{int(pose[-2:])}"
    return f"S{int(pose[-2:])}"


def render_full_body(frames: dict[tuple[str, str], Image.Image]) -> Path:
    cell = (256, 412)
    sheet = Image.new("RGB", (cell[0] * len(POSES), cell[1] * len(STYLES)), "white")
    draw = ImageDraw.Draw(sheet)
    title_font = font(14)
    pose_font = font(11)
    for row, style in enumerate(STYLES):
        for column, pose in enumerate(POSES):
            x = column * cell[0]
            y = row * cell[1]
            avatar = compose_avatar(style, pose, frames[(style.slug, pose)])
            sheet.paste(flatten_on_background(avatar), (x, y))
            draw.text((x + 12, y + 9), style.label, font=title_font, fill=(79, 35, 58))
            draw.text((x + 12, y + 29), f"{pose_label(pose)} · {pose.replace('_front_', ' ')}", font=pose_font, fill=(133, 105, 120))
            draw.line((x + 12, y + 383, x + 244, y + 383), fill=(247, 218, 230), width=1)
    path = OUTPUT_ROOT / "2026-07-14-male-shoes-wave3-motion-full-body.png"
    sheet.save(path, optimize=True)
    return path


def hem_panel(style: Style, pose: str, frame: Image.Image) -> Image.Image:
    avatar = compose_avatar(style, pose, frame)
    composite = flatten_on_background(avatar)
    return composite.crop((80, 300, 176, 356)).resize((384, 224), Image.Resampling.NEAREST)


def render_hem_closeups(frames: dict[tuple[str, str], Image.Image]) -> Path:
    cell = (384, 250)
    sheet = Image.new("RGB", (cell[0] * len(POSES), cell[1] * len(STYLES)), (255, 250, 252))
    draw = ImageDraw.Draw(sheet)
    label_font = font(14)
    for row, style in enumerate(STYLES):
        for column, pose in enumerate(POSES):
            x = column * cell[0]
            y = row * cell[1]
            sheet.paste(hem_panel(style, pose, frames[(style.slug, pose)]), (x, y + 26))
            draw.text((x + 10, y + 6), f"{style.label} · {pose_label(pose)}", font=label_font, fill=(86, 39, 63))
    path = OUTPUT_ROOT / "2026-07-14-male-shoes-wave3-motion-hem-closeups.png"
    sheet.save(path, optimize=True)
    return path


def binary_alpha(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value > 16 else 0)


def render_alpha_diffs(frames: dict[tuple[str, str], Image.Image]) -> Path:
    pairs = ((STYLES[0], STYLES[1]), (STYLES[0], STYLES[2]), (STYLES[1], STYLES[2]))
    cell = (384, 250)
    sheet = Image.new("RGB", (cell[0] * len(POSES), cell[1] * len(pairs)), (255, 250, 252))
    draw = ImageDraw.Draw(sheet)
    label_font = font(13)
    for row, (first, second) in enumerate(pairs):
        for column, pose in enumerate(POSES):
            first_alpha = binary_alpha(frames[(first.slug, pose)])
            second_alpha = binary_alpha(frames[(second.slug, pose)])
            difference = ImageChops.difference(first_alpha, second_alpha)
            panel = Image.new("RGB", CANVAS, "white")
            panel_pixels = panel.load()
            first_pixels = first_alpha.load()
            second_pixels = second_alpha.load()
            for y in range(300, 356):
                for x in range(80, 176):
                    first_visible = first_pixels[x, y] > 0
                    second_visible = second_pixels[x, y] > 0
                    panel_pixels[x, y] = (
                        (229, 61, 123) if first_visible and not second_visible else
                        (66, 151, 180) if second_visible and not first_visible else
                        (86, 71, 84) if first_visible else
                        (255, 250, 252)
                    )
            crop = panel.crop((80, 300, 176, 356)).resize((384, 224), Image.Resampling.NEAREST)
            x = column * cell[0]
            y = row * cell[1]
            sheet.paste(crop, (x, y + 26))
            count = sum(1 for value in difference.getdata() if value > 0)
            draw.text(
                (x + 10, y + 6),
                f"{first.label} / {second.label} · diff {count}",
                font=label_font,
                fill=(86, 39, 63),
            )
    path = OUTPUT_ROOT / "2026-07-14-male-shoes-wave3-motion-alpha-diffs.png"
    sheet.save(path, optimize=True)
    return path


def render_manifest() -> Path:
    entries: list[str] = []
    for style in STYLES:
        for pose in POSES:
            filename = f"room_avatar_shoes_male_{style.slug}_v1_{pose}.png"
            digest = hashlib.sha256((OUTPUT_ROOT / filename).read_bytes()).hexdigest()
            entries.append(f"{digest}  {filename}")
    path = OUTPUT_ROOT / "2026-07-14-male-shoes-wave3-motion-manifest.sha256"
    path.write_text("\n".join(entries) + "\n", encoding="utf-8")
    return path


def alpha_difference(first: Image.Image, second: Image.Image) -> int:
    difference = ImageChops.difference(binary_alpha(first), binary_alpha(second))
    return sum(1 for value in difference.getdata() if value > 0)


def overlap_count(first: Image.Image, second: Image.Image) -> int:
    first_alpha = first.getchannel("A")
    second_alpha = second.getchannel("A")
    return sum(
        1
        for first_value, second_value in zip(first_alpha.getdata(), second_alpha.getdata())
        if first_value > 16 and second_value > 16
    )


def render_report(frames: dict[tuple[str, str], Image.Image], outputs: tuple[Path, ...]) -> Path:
    lines = [
        "# Male shoes Wave 3 motion staging — producer report",
        "",
        "Decision: **PASS for independent QA; HOLD for runtime/catalog promotion.**",
        "",
        "- Deterministic 4 walking + 1 seated frame per approved shoe.",
        "- Canonical male base, navy pants, Milk Tea motion anchors, 256×384 canvas.",
        "- Shoes render below pants; body/foot contact is checked from y=316 through baseline.",
        "- Each style uses its own approved static alpha/material; no photo paste and no shared recolor mask.",
        "- Runtime asset folders, catalogs, and TypeScript were not changed.",
        "",
        "## Metrics",
        "",
        "| Pose | Trainer/loafer diff | Trainer/canvas diff | Loafer/canvas diff | Pant overlaps (T/L/C) |",
        "|---|---:|---:|---:|---:|",
    ]
    pairs = ((STYLES[0], STYLES[1]), (STYLES[0], STYLES[2]), (STYLES[1], STYLES[2]))
    for pose in POSES:
        differences = [
            alpha_difference(frames[(first.slug, pose)], frames[(second.slug, pose)])
            for first, second in pairs
        ]
        pants = load_rgba(MOTION_ROOT / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png")
        overlaps = [overlap_count(pants, frames[(style.slug, pose)]) for style in STYLES]
        lines.append(
            f"| {pose} | {differences[0]} | {differences[1]} | {differences[2]} | "
            f"{overlaps[0]}/{overlaps[1]}/{overlaps[2]} |"
        )
    lines.extend(("", "## QA artifacts", ""))
    lines.extend(f"- `{output.relative_to(REPO_ROOT)}`" for output in outputs)
    lines.extend(("", "Independent QA must inspect all three sheets before promotion.", ""))
    path = OUTPUT_ROOT / "2026-07-14-male-shoes-wave3-motion-report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames: dict[tuple[str, str], Image.Image] = {}
    for style in STYLES:
        for pose in POSES:
            frame = fit_style_to_pose(style, pose)
            path = OUTPUT_ROOT / f"room_avatar_shoes_male_{style.slug}_v1_{pose}.png"
            frame.save(path, optimize=True)
            frames[(style.slug, pose)] = frame
            print(path)

    full_body = render_full_body(frames)
    closeups = render_hem_closeups(frames)
    diffs = render_alpha_diffs(frames)
    manifest = render_manifest()
    report = render_report(frames, (full_body, closeups, diffs, manifest))
    print(full_body)
    print(closeups)
    print(diffs)
    print(manifest)
    print(report)


if __name__ == "__main__":
    main()
