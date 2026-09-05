#!/usr/bin/env python3
"""Build candidate-only 4W+1S motion for the approved male shoe v7 set.

The approved walking f01 raster is copied byte-for-byte. Later poses transform
the two product-specific shoe silhouettes independently around canonical male
foot anchors. Nothing in this producer writes to runtime or catalog paths.
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
RUNTIME_MOTION_ROOT = ROOM_ROOT / "motion"
CANDIDATE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates/shoes"
)
OUTPUT_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/shoes-motion-v7"
)
CANVAS = (256, 384)

STYLES = (
    ("chunky_skate_sneakers", "Chunky Skate Sneakers"),
    ("cloud_white_trainers", "Cloud White Trainers"),
    ("cocoa_penny_loafers", "Cocoa Penny Loafers"),
    ("dusty_blue_canvas_sneakers", "Dusty Blue Canvas Sneakers"),
    ("lightweight_trail_sneakers", "Lightweight Trail Sneakers"),
    ("milk_tea_court", "Milk Tea Court"),
    ("retro_colorblock_runner", "Retro Colorblock Runner"),
    ("suede_penny_mules", "Suede Penny Mules"),
)
POSES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)

# Half-open boxes measured from the canonical male base and the accepted Milk
# Tea motion. F01 is deliberately a tolerant centre/baseline reference because
# each approved v7 static keeps its own product width.
CANONICAL_FOOT_BOXES: dict[
    str, tuple[tuple[int, int, int, int], tuple[int, int, int, int]]
] = {
    "walking_front_f01": ((104, 325, 127, 349), (129, 325, 153, 349)),
    "walking_front_f02": ((101, 329, 128, 349), (129, 320, 154, 340)),
    "walking_front_f03": ((102, 320, 127, 340), (128, 329, 155, 349)),
    "walking_front_f04": ((101, 325, 128, 349), (131, 320, 154, 339)),
    "sitting_front_f01": ((91, 329, 128, 346), (129, 329, 165, 346)),
}

REFERENCE_STATIC_WIDTHS = (23, 24)
REFERENCE_STATIC_HEIGHT = 24


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def sanitize_transparency(image: Image.Image) -> Image.Image:
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


def connected_alpha_components(
    image: Image.Image, threshold: int = 0
) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A").load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if alpha[x, y] <= threshold or (x, y) in visited:
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
                    if alpha[next_x, next_y] <= threshold:
                        continue
                    if (next_x, next_y) in visited:
                        continue
                    visited.add((next_x, next_y))
                    queue.append((next_x, next_y))
            components.append(component)
    return sorted(components, key=len, reverse=True)


def component_box(component: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    return (
        min(x for x, _ in component),
        min(y for _, y in component),
        max(x for x, _ in component) + 1,
        max(y for _, y in component) + 1,
    )


def two_product_boxes(image: Image.Image) -> tuple[
    tuple[int, int, int, int], tuple[int, int, int, int]
]:
    components = connected_alpha_components(image, threshold=16)
    if len(components) != 2:
        raise ValueError(
            "Approved v7 shoe must contain exactly two raw-alpha components; "
            f"found {[len(component) for component in components]}"
        )
    boxes = sorted((component_box(component) for component in components), key=lambda box: box[0])
    return boxes[0], boxes[1]


def transformed_box(
    source_box: tuple[int, int, int, int],
    canonical_box: tuple[int, int, int, int],
    foot_index: int,
) -> tuple[int, int, int, int]:
    source_width = source_box[2] - source_box[0]
    source_height = source_box[3] - source_box[1]
    canonical_width = canonical_box[2] - canonical_box[0]
    canonical_height = canonical_box[3] - canonical_box[1]
    scale_x = canonical_width / REFERENCE_STATIC_WIDTHS[foot_index]
    scale_y = canonical_height / REFERENCE_STATIC_HEIGHT
    width = max(12, round(source_width * scale_x))
    height = max(12, round(source_height * scale_y))
    width = min(width, canonical_width)
    # The moving trouser cuff meets the shoe at the medial ankle edge. Narrow
    # shoes therefore anchor to that inner edge instead of floating around the
    # centre of a wider reference box.
    left = canonical_box[2] - width if foot_index == 0 else canonical_box[0]
    bottom = canonical_box[3]
    return left, bottom - height, left + width, bottom


def isolate_component(
    source: Image.Image,
    component: list[tuple[int, int]],
    box: tuple[int, int, int, int],
) -> Image.Image:
    component_pixels = set(component)
    crop = source.crop(box)
    crop_pixels = crop.load()
    for local_y in range(crop.height):
        for local_x in range(crop.width):
            source_point = (box[0] + local_x, box[1] + local_y)
            if source_point not in component_pixels:
                crop_pixels[local_x, local_y] = (0, 0, 0, 0)
    return sanitize_transparency(crop)


def nearest_material_pixel(
    image: Image.Image, x: int, y: int
) -> tuple[int, int, int, int]:
    pixels = image.load()
    for radius in range(1, 16):
        candidates: list[tuple[int, tuple[int, int, int, int]]] = []
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
    raise ValueError(f"No shoe material near {x},{y}")


def add_hidden_pants_underlap(
    frame: Image.Image,
    pose: str,
    target_boxes: tuple[tuple[int, int, int, int], tuple[int, int, int, int]],
) -> Image.Image:
    """Add a narrow attachment tongue that stays behind opaque pants.

    This is the garment construction overlap: it prevents a one-pixel floating
    gap during motion without widening the visible toe or covering the shoe.
    """

    result = frame.copy()
    pants = load_rgba(
        RUNTIME_MOTION_ROOT
        / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png"
    )
    pants_alpha = pants.getchannel("A").load()
    result_pixels = result.load()
    for foot_index, target_box in enumerate(target_boxes):
        left, top, right, _ = target_box
        canonical = CANONICAL_FOOT_BOXES[pose][foot_index]
        underlap_left = min(left, canonical[0])
        underlap_top = min(top, canonical[1])
        underlap_right = max(right, canonical[2])
        underlap_bottom = min(max(top + 9, canonical[1] + 9), CANVAS[1])
        candidates = {
            (x, y)
            for y in range(underlap_top, underlap_bottom)
            for x in range(underlap_left, underlap_right)
            if pants_alpha[x, y] >= 220 and result_pixels[x, y][3] <= 16
        }
        while candidates:
            frontier = {
                (x, y)
                for x, y in candidates
                if any(
                    0 <= next_x < CANVAS[0]
                    and 0 <= next_y < CANVAS[1]
                    and result_pixels[next_x, next_y][3] > 16
                    for next_x, next_y in (
                        (x - 1, y),
                        (x + 1, y),
                        (x, y - 1),
                        (x, y + 1),
                    )
                )
            }
            if not frontier:
                break
            for x, y in frontier:
                red, green, blue, _ = nearest_material_pixel(result, x, y)
                result_pixels[x, y] = (red, green, blue, 255)
            candidates.difference_update(frontier)
    return sanitize_transparency(result)


def validate_visible_components(frame: Image.Image) -> Image.Image:
    """Reject real segmentation tears; remove only one-pixel resampling dust."""

    components = connected_alpha_components(frame, threshold=16)
    if len(components) < 2:
        raise ValueError("Motion frame must retain two visible shoes")
    if len(components) == 2:
        return sanitize_transparency(frame)
    detached = components[2:]
    if any(len(component) > 1 for component in detached):
        raise ValueError(
            "Motion transform produced a detached visible fragment; "
            f"component sizes={[len(component) for component in components]}"
        )
    result = frame.copy()
    pixels = result.load()
    for component in detached:
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
    return sanitize_transparency(result)


def fit_style_to_pose(source: Image.Image, pose: str) -> Image.Image:
    if pose == "walking_front_f01":
        return source.copy()

    source_components = sorted(
        connected_alpha_components(source, threshold=16),
        key=lambda component: component_box(component)[0],
    )
    if len(source_components) != 2:
        raise ValueError("v7 motion requires exactly two source shoe components")

    frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    target_boxes: list[tuple[int, int, int, int]] = []
    for foot_index, component in enumerate(source_components):
        source_box = component_box(component)
        target_box = transformed_box(
            source_box,
            CANONICAL_FOOT_BOXES[pose][foot_index],
            foot_index,
        )
        target_boxes.append(target_box)
        product = isolate_component(source, component, source_box)
        fitted = product.resize(
            (target_box[2] - target_box[0], target_box[3] - target_box[1]),
            Image.Resampling.LANCZOS,
        )
        frame.alpha_composite(fitted, (target_box[0], target_box[1]))
    contacted = add_hidden_pants_underlap(
        sanitize_transparency(frame),
        pose,
        (target_boxes[0], target_boxes[1]),
    )
    return validate_visible_components(contacted)


def frame_path(style: str, pose: str) -> Path:
    return OUTPUT_ROOT / style / f"room_avatar_shoes_male_{style}_v1_{pose}.png"


def compose_avatar(pose: str, shoes: Image.Image) -> Image.Image:
    layers = (
        load_rgba(RUNTIME_MOTION_ROOT / f"room_avatar_base_male_light_v1_{pose}.png"),
        load_rgba(ROOM_ROOT / "avatar_room_face_male_warm_friendly_v1.png"),
        shoes,
        load_rgba(
            RUNTIME_MOTION_ROOT
            / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png"
        ),
        load_rgba(
            RUNTIME_MOTION_ROOT
            / f"room_avatar_top_male_powder_blue_crew_tee_v1_{pose}.png"
        ),
        load_rgba(ROOM_ROOT / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result = Image.alpha_composite(result, layer)
    return result


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    result = Image.new("RGBA", size, (244, 241, 244, 255))
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, min(x + square - 1, size[0] - 1), min(y + square - 1, size[1] - 1)),
                    fill=(222, 217, 222, 255),
                )
    return result


def soft_background(size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", size, (255, 250, 252, 255))
    pixels = result.load()
    for y in range(size[1]):
        vertical = y / max(1, size[1] - 1)
        for x in range(size[0]):
            distance = abs(x - size[0] / 2) / (size[0] / 2)
            glow = max(0.0, 1.0 - distance)
            pixels[x, y] = (
                255,
                round(252 - 12 * glow * (1.0 - vertical)),
                round(253 - 7 * glow * (1.0 - vertical)),
                255,
            )
    return result


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def pose_label(pose: str) -> str:
    return f"W{int(pose[-2:])}" if pose.startswith("walking") else "S1"


def render_approval_board(frames: dict[tuple[str, str], Image.Image]) -> Path:
    cell_width = 300
    cell_height = 430
    header_height = 74
    sheet = Image.new(
        "RGB",
        (cell_width * len(POSES), header_height + cell_height * len(STYLES)),
        (255, 250, 252),
    )
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (20, 15),
        "MALE SHOES V7 · CANONICAL 4W+1S · CANDIDATE ONLY",
        font=font(24),
        fill=(72, 31, 53),
    )
    draw.text(
        (20, 47),
        "Approved v7 static identity · pose-specific feet · shoes below pants · runtime unchanged",
        font=font(13),
        fill=(126, 88, 108),
    )
    for column, pose in enumerate(POSES):
        draw.text(
            (column * cell_width + 242, 48),
            pose_label(pose),
            font=font(16),
            fill=(91, 46, 70),
        )

    for row, (style, label) in enumerate(STYLES):
        for column, pose in enumerate(POSES):
            x = column * cell_width
            y = header_height + row * cell_height
            background = soft_background(CANVAS)
            avatar = compose_avatar(pose, frames[(style, pose)])
            background.alpha_composite(avatar)
            sheet.paste(background.convert("RGB"), (x + 22, y + 34))
            closeup = background.crop((82, 296, 174, 354)).resize(
                (184, 116), Image.Resampling.NEAREST
            )
            sheet.paste(closeup.convert("RGB"), (x + 108, y + 306))
            draw.rectangle((x + 107, y + 305, x + 292, y + 422), outline=(225, 188, 205))
            draw.text(
                (x + 12, y + 9),
                f"{row + 1:02d} {label}" if column == 0 else f"{pose_label(pose)}",
                font=font(13),
                fill=(77, 36, 58),
            )
            draw.line(
                (x + cell_width - 1, y, x + cell_width - 1, y + cell_height),
                fill=(242, 221, 231),
            )
        draw.line(
            (0, header_height + (row + 1) * cell_height - 1, sheet.width, header_height + (row + 1) * cell_height - 1),
            fill=(242, 221, 231),
        )
    path = OUTPUT_ROOT / "shoes-motion-v7-4w1s-approval.png"
    sheet.save(path, optimize=True)
    return path


def render_walk_preview(frames: dict[tuple[str, str], Image.Image]) -> Path:
    walking_poses = POSES[:4]
    preview_frames: list[Image.Image] = []
    tile_width = 256
    tile_height = 410
    columns = 4
    rows = 2
    for pose in walking_poses:
        sheet = Image.new(
            "RGB",
            (tile_width * columns, tile_height * rows),
            (255, 250, 252),
        )
        draw = ImageDraw.Draw(sheet)
        for index, (style, label) in enumerate(STYLES):
            x = (index % columns) * tile_width
            y = (index // columns) * tile_height
            panel = soft_background(CANVAS)
            panel.alpha_composite(compose_avatar(pose, frames[(style, pose)]))
            sheet.paste(panel.convert("RGB"), (x, y + 26))
            draw.text(
                (x + 8, y + 7),
                f"{index + 1:02d} {label} · {pose_label(pose)}",
                font=font(12),
                fill=(72, 31, 53),
            )
        preview_frames.append(sheet)
    path = OUTPUT_ROOT / "shoes-motion-v7-walk-preview.gif"
    preview_frames[0].save(
        path,
        save_all=True,
        append_images=preview_frames[1:],
        duration=120,
        loop=0,
        disposal=2,
        optimize=False,
    )
    return path


def render_hem_board(
    frames: dict[tuple[str, str], Image.Image],
    background_kind: str,
) -> Path:
    cell_width = 300
    cell_height = 214
    header_height = 58
    background_color = (0, 0, 0, 255) if background_kind == "black" else None
    sheet = Image.new(
        "RGB",
        (cell_width * len(POSES), header_height + cell_height * len(STYLES)),
        "black" if background_kind == "black" else "white",
    )
    draw = ImageDraw.Draw(sheet)
    label_color = "white" if background_kind == "black" else (72, 31, 53)
    draw.text(
        (18, 15),
        f"MALE SHOES V7 · HEM CONTACT · {background_kind.upper()}",
        font=font(22),
        fill=label_color,
    )
    for row, (style, label) in enumerate(STYLES):
        for column, pose in enumerate(POSES):
            if background_color is None:
                panel = checkerboard(CANVAS)
            else:
                panel = Image.new("RGBA", CANVAS, background_color)
            panel.alpha_composite(compose_avatar(pose, frames[(style, pose)]))
            crop = panel.crop((78, 294, 178, 356)).resize(
                (300, 186), Image.Resampling.NEAREST
            )
            x = column * cell_width
            y = header_height + row * cell_height
            sheet.paste(crop.convert("RGB"), (x, y + 28))
            draw.text(
                (x + 7, y + 6),
                f"{label} · {pose_label(pose)}",
                font=font(12),
                fill=label_color,
            )
    suffix = "black" if background_kind == "black" else "checkerboard"
    path = OUTPUT_ROOT / f"shoes-motion-v7-hem-closeups-{suffix}.png"
    sheet.save(path, optimize=True)
    return path


def render_manifest() -> Path:
    entries = []
    for style, _ in STYLES:
        for pose in POSES:
            path = frame_path(style, pose)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            entries.append(f"{digest}  {path.relative_to(OUTPUT_ROOT).as_posix()}")
    output = OUTPUT_ROOT / "shoes-motion-v7-manifest.sha256"
    output.write_text("\n".join(entries) + "\n", encoding="utf-8")
    return output


def render_evidence(artifacts: tuple[Path, ...]) -> Path:
    lines = [
        "# Male shoes v7 motion QA evidence",
        "",
        "Decision: **TECHNICAL PASS / VISUAL REVIEW PENDING / RUNTIME HOLD**",
        "",
        "## Scope",
        "",
        "- Eight user-approved male shoe v7 statics.",
        "- Four canonical front-walk frames plus one canonical seated frame.",
        "- Candidate-only output; runtime assets, catalog wiring and thumbnails are unchanged.",
        "- Walking f01 is copied byte-for-byte from each approved `static-review-v7.png`.",
        "- Later frames transform each product's own left/right silhouettes independently.",
        "- Shoes composite below pants so the hem remains the foreground contact edge.",
        "",
        "## Required review",
        "",
        "- Inspect all 40 full-body poses and all 40 hem close-ups.",
        "- Compare checkerboard and black backgrounds for alpha tears or detached pixels.",
        "- Reject foot sliding, shoe identity collapse, pant fragmentation, excessive shoe cover or floating gaps.",
        "- Independent reviewer and explicit user motion approval are required before promotion.",
        "",
        "## Artifacts",
        "",
    ]
    lines.extend(f"- `{path.relative_to(REPO_ROOT)}`" for path in artifacts)
    lines.extend(("", "Runtime promotion remains prohibited.", ""))
    output = OUTPUT_ROOT / "shoes-motion-v7-qa-evidence.md"
    output.write_text("\n".join(lines), encoding="utf-8")
    return output


def production_outputs() -> tuple[Path, ...]:
    frame_outputs = tuple(
        frame_path(style, pose) for style, _ in STYLES for pose in POSES
    )
    artifact_outputs = (
        OUTPUT_ROOT / "shoes-motion-v7-4w1s-approval.png",
        OUTPUT_ROOT / "shoes-motion-v7-walk-preview.gif",
        OUTPUT_ROOT / "shoes-motion-v7-hem-closeups-checkerboard.png",
        OUTPUT_ROOT / "shoes-motion-v7-hem-closeups-black.png",
        OUTPUT_ROOT / "shoes-motion-v7-manifest.sha256",
        OUTPUT_ROOT / "shoes-motion-v7-qa-evidence.md",
    )
    return frame_outputs + artifact_outputs


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    frames: dict[tuple[str, str], Image.Image] = {}
    for style, _ in STYLES:
        source_path = CANDIDATE_ROOT / style / "rig/static-review-v7.png"
        source = load_rgba(source_path)
        two_product_boxes(source)
        style_root = OUTPUT_ROOT / style
        style_root.mkdir(parents=True, exist_ok=True)
        for pose in POSES:
            output = frame_path(style, pose)
            if pose == "walking_front_f01":
                shutil.copyfile(source_path, output)
                frame = load_rgba(output)
            else:
                frame = fit_style_to_pose(source, pose)
                frame.save(output, optimize=True)
            frames[(style, pose)] = frame

    approval = render_approval_board(frames)
    walk_preview = render_walk_preview(frames)
    checkerboard_board = render_hem_board(frames, "checkerboard")
    black_board = render_hem_board(frames, "black")
    manifest = render_manifest()
    evidence = render_evidence(
        (approval, walk_preview, checkerboard_board, black_board, manifest)
    )
    for path in production_outputs():
        print(path)
    print(evidence)


if __name__ == "__main__":
    main()
