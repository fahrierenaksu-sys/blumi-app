#!/usr/bin/env python3
"""Build geometry-preserving male starter alpha-cleanup candidates and QA boards."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUTPUT = ROOT / "docs/avatar-motion-pipeline/male-starter-contract-repair/2026-08-28/v1"
SITTING_PANTS = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6/candidates/"
    "room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01-v1-candidate.png"
)
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
STATIC_ASSETS = (
    "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    "avatar_room_bottom_male_sage_cuffed_shorts_v1.png",
)
MOTION_PREFIXES = (
    "room_avatar_top_male_powder_blue_crew_tee_v1",
    "room_avatar_bottom_male_sage_cuffed_shorts_v1",
)
PANTS_PREFIX = "room_avatar_bottom_male_navy_straight_pants_v1"
BODY_PREFIX = "room_avatar_base_male_light_v1"
SHOES_PREFIX = "room_avatar_shoes_male_milk_tea_court_v1"


def is_contaminated(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha >= 11 and green > red + 12 and green > blue + 12


def repair_green_fringe(source: Image.Image) -> tuple[Image.Image, int]:
    """Neutralize keyed-green RGB while preserving every alpha and position byte."""
    original = source.convert("RGBA")
    repaired = original.copy()
    source_pixels = original.load()
    output_pixels = repaired.load()
    replacements: dict[tuple[int, int], tuple[int, int, int, int]] = {}

    for y in range(original.height):
        for x in range(original.width):
            red, green, blue, alpha = source_pixels[x, y]
            if alpha == 0:
                output_pixels[x, y] = (0, 0, 0, 0)
                continue
            if not is_contaminated((red, green, blue, alpha)):
                continue

            samples: list[tuple[int, int, int]] = []
            for radius in (1, 2, 3):
                for sample_y in range(max(0, y - radius), min(original.height, y + radius + 1)):
                    for sample_x in range(max(0, x - radius), min(original.width, x + radius + 1)):
                        sample_red, sample_green, sample_blue, sample_alpha = source_pixels[sample_x, sample_y]
                        if sample_alpha < 11 or is_contaminated(
                            (sample_red, sample_green, sample_blue, sample_alpha)
                        ):
                            continue
                        if abs(sample_alpha - alpha) > 48:
                            continue
                        samples.append((sample_red, sample_green, sample_blue))
                if samples:
                    break

            if samples:
                samples.sort()
                sample = samples[len(samples) // 2]
                replacements[(x, y)] = (*sample, alpha)
            else:
                replacements[(x, y)] = (red, min(green, max(red, blue) + 6), blue, alpha)

    for coordinate, replacement in replacements.items():
        output_pixels[coordinate] = replacement
    return repaired, len(replacements)


def remove_tiny_components(source: Image.Image, minimum_size: int = 8) -> tuple[Image.Image, int]:
    repaired = source.convert("RGBA").copy()
    pixels = repaired.load()
    visible = {
        (x, y)
        for y in range(repaired.height)
        for x in range(repaired.width)
        if pixels[x, y][3] > 10
    }
    removed = 0
    while visible:
        start = visible.pop()
        component = [start]
        queue = deque([start])
        while queue:
            x, y = queue.popleft()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor not in visible:
                    continue
                visible.remove(neighbor)
                component.append(neighbor)
                queue.append(neighbor)
        if len(component) >= minimum_size:
            continue
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
            removed += 1
    return repaired, removed


def bridge_shorts_hinge(source: Image.Image, state: str) -> tuple[Image.Image, int]:
    """Close the reviewed one-pixel vertical alpha breaks in pose hinges."""
    if state not in {"walking_front_f03", "sitting_front_f01"}:
        return source, 0
    repaired = source.convert("RGBA").copy()
    pixels = repaired.load()
    repaired_count = 0
    x_range = range(131, 151) if state == "walking_front_f03" else (102,)
    for x in x_range:
        if pixels[x, 316][3] > 10:
            continue
        authority = pixels[x, 315] if pixels[x, 315][3] > 32 else pixels[x, 317]
        if authority[3] <= 32:
            raise RuntimeError(f"shorts hinge authority missing at {x},316")
        pixels[x, 316] = (*authority[:3], 255)
        repaired_count += 1
    return repaired, repaired_count


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_bytes(image: Image.Image) -> bytes:
    return image.convert("RGBA").getchannel("A").tobytes()


def candidate_path(source: Path) -> Path:
    return OUTPUT / "candidates" / source.name


def runtime_matches(candidate: Path, target: Path) -> bool:
    return target.is_file() and candidate.read_bytes() == target.read_bytes()


def motion_path(prefix: str, state: str) -> Path:
    return MOTION / f"{prefix}_{state}.png"


def uncovered_body_pixels(
    body: Image.Image,
    pants: Image.Image,
    shoes: Image.Image,
) -> list[tuple[int, int]]:
    body_alpha = body.getchannel("A")
    pants_alpha = pants.getchannel("A")
    shoes_alpha = shoes.getchannel("A")
    return [
        (x, y)
        for y in range(294, 344)
        for x in range(100, 157)
        if body_alpha.getpixel((x, y)) > 10
        and pants_alpha.getpixel((x, y)) <= 10
        and shoes_alpha.getpixel((x, y)) <= 10
    ]


def nearest_pants_pixel(
    pixels: object,
    width: int,
    height: int,
    x: int,
    y: int,
) -> tuple[int, int, int, int]:
    for radius in range(1, 25):
        candidates: list[tuple[int, int, int, int]] = []
        for sample_y in range(max(0, y - radius), min(height, y + radius + 1)):
            for sample_x in range(max(0, x - radius), min(width, x + radius + 1)):
                if abs(sample_x - x) + abs(sample_y - y) != radius:
                    continue
                pixel = pixels[sample_x, sample_y]
                if pixel[3] > 32 and pixel[2] > pixel[0] + 8 and pixel[2] > pixel[1]:
                    candidates.append(pixel)
        if candidates:
            red, green, blue, _alpha = candidates[len(candidates) // 2]
            return (
                round(red * 0.72),
                round(green * 0.72),
                round(blue * 0.72),
                255,
            )
    raise RuntimeError(f"no pants color authority near {x},{y}")


def repair_pants_coverage(source: Image.Image, state: str) -> tuple[Image.Image, int, int]:
    repaired = source.convert("RGBA").copy()
    body = Image.open(motion_path(BODY_PREFIX, state)).convert("RGBA")
    shoes = Image.open(motion_path(SHOES_PREFIX, state)).convert("RGBA")
    before = uncovered_body_pixels(body, repaired, shoes)
    if not before:
        return repaired, 0, 0
    body_alpha = body.getchannel("A")
    pants_alpha = repaired.getchannel("A")
    shoes_alpha = shoes.getchannel("A")
    min_x = max(100, min(x for x, _y in before) - 1)
    max_x = min(156, max(x for x, _y in before) + 1)
    min_y = max(294, min(y for _x, y in before) - 8)
    max_y = max(y for _x, y in before)
    pixels = repaired.load()
    seam_pixels = [
        (x, y)
        for y in range(min_y, max_y + 1)
        for x in range(min_x, max_x + 1)
        if body_alpha.getpixel((x, y)) > 0
        and shoes_alpha.getpixel((x, y)) <= 10
        and (
            pants_alpha.getpixel((x, y)) < 255
            or pixels[x, y][2] <= pixels[x, y][0] + 8
            or pixels[x, y][2] <= pixels[x, y][1]
        )
    ]
    for x, y in seam_pixels:
        pixels[x, y] = nearest_pants_pixel(
            pixels,
            repaired.width,
            repaired.height,
            x,
            y,
        )
    after = uncovered_body_pixels(body, repaired, shoes)
    return repaired, len(seam_pixels), len(after)


def write_candidates() -> list[dict[str, object]]:
    sources = [ROOM / name for name in STATIC_ASSETS]
    sources.extend(
        MOTION / f"{prefix}_{state}.png"
        for prefix in MOTION_PREFIXES
        for state in STATES
    )
    records: list[dict[str, object]] = []
    for source in sources:
        original = Image.open(source).convert("RGBA")
        pose_repair = None
        if source.name.endswith("powder_blue_crew_tee_v1_walking_front_f04.png"):
            frame_three = motion_path(
                "room_avatar_top_male_powder_blue_crew_tee_v1",
                "walking_front_f03",
            )
            original = Image.open(frame_three).convert("RGBA").transpose(
                Image.Transpose.FLIP_LEFT_RIGHT
            )
            pose_repair = "mirror-approved-opposite-step-frame-f03"
        repaired, replacement_count = repair_green_fringe(original)
        tiny_component_count = 0
        hinge_repair_count = 0
        if "sage_cuffed_shorts" in source.name:
            repaired, tiny_component_count = remove_tiny_components(repaired)
            repaired, hinge_repair_count = bridge_shorts_hinge(repaired, source.stem.split("_v1_")[-1])
        if (
            alpha_bytes(original) != alpha_bytes(repaired)
            and "sage_cuffed_shorts" not in source.name
        ):
            raise RuntimeError(f"alpha geometry changed for {source.name}")
        destination = candidate_path(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        repaired.save(destination, optimize=True)
        records.append(
            {
                "source": str(source.relative_to(ROOT)),
                "runtimeTarget": str(source.relative_to(ROOT)),
                "candidate": str(destination.relative_to(ROOT)),
                "sourceSha256": sha256(source),
                "candidateSha256": sha256(destination),
                "recoloredPixels": replacement_count,
                "alphaGeometryPreserved": (
                    pose_repair is None
                    and tiny_component_count == 0
                    and hinge_repair_count == 0
                ),
                "poseRepair": pose_repair,
                "removedTinyComponentPixels": tiny_component_count,
                "bridgedHingePixels": hinge_repair_count,
                "runtimePromoted": runtime_matches(destination, source),
            }
        )

    for state in STATES:
        runtime_source = motion_path(PANTS_PREFIX, state)
        source = SITTING_PANTS if state == "sitting_front_f01" else runtime_source
        original = Image.open(source).convert("RGBA")
        repaired, before_count, after_count = repair_pants_coverage(original, state)
        if after_count != 0:
            raise RuntimeError(f"{state}: {after_count} uncovered body pixels remain")
        destination = candidate_path(runtime_source)
        repaired.save(destination, optimize=True)
        records.append(
            {
                "source": str(source.relative_to(ROOT)),
                "runtimeTarget": str(runtime_source.relative_to(ROOT)),
                "candidate": str(destination.relative_to(ROOT)),
                "sourceSha256": sha256(source),
                "candidateSha256": sha256(destination),
                "filledBodyLeakPixels": before_count,
                "remainingBodyLeakPixels": after_count,
                "method": "nearest-garment-color-inner-seam-coverage-repair",
                "alphaGeometryPreserved": False,
                "runtimePromoted": runtime_matches(destination, runtime_source),
            }
        )
    return records


def layer_for(prefix: str, state: str) -> Image.Image:
    source = MOTION / f"{prefix}_{state}.png"
    candidate = candidate_path(source)
    return Image.open(candidate if candidate.exists() else source).convert("RGBA")


def compose(state: str, repaired: bool) -> Image.Image:
    def selected(prefix: str) -> Image.Image:
        source = MOTION / f"{prefix}_{state}.png"
        candidate = candidate_path(source)
        return Image.open(candidate if repaired and candidate.exists() else source).convert("RGBA")

    canvas = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    pants = selected(PANTS_PREFIX)
    layers = (
        selected("room_avatar_base_male_light_v1"),
        Image.open(ROOM / "avatar_room_face_male_warm_friendly_v1.png").convert("RGBA"),
        selected("room_avatar_shoes_male_milk_tea_court_v1"),
        pants,
        selected("room_avatar_top_male_powder_blue_crew_tee_v1"),
        Image.open(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png").convert("RGBA"),
    )
    for layer in layers:
        canvas.alpha_composite(layer)
    return canvas


def render_board() -> Path:
    board = Image.new("RGB", (1500, 980), (255, 247, 250))
    draw = ImageDraw.Draw(board)
    draw.text((32, 24), "BLUMI MALE STARTER CONTRACT REPAIR V1", fill=(66, 40, 54))
    draw.text((32, 52), "Before / geometry-preserving alpha cleanup + approved seated pants", fill=(113, 88, 101))
    labels = ("W1", "W2", "W3", "W4", "S1")
    for column, (state, label) in enumerate(zip(STATES, labels)):
        x = 22 + column * 294
        draw.text((x + 110, 86), label, fill=(66, 40, 54))
        for row, repaired in enumerate((False, True)):
            avatar = compose(state, repaired).resize((256, 384), Image.Resampling.NEAREST)
            y = 118 + row * 414
            board.paste(avatar, (x, y), avatar)
            draw.text((x + 4, y + 6), "AFTER" if repaired else "BEFORE", fill=(183, 52, 101))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / "male-starter-contract-repair-v1-4w1s-board.png"
    board.save(path, optimize=True)
    return path


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(image)
    colors = ((255, 253, 254, 255), (224, 220, 224, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def render_contact_board() -> Path:
    crop = (96, 282, 162, 352)
    panel_size = ((crop[2] - crop[0]) * 5, (crop[3] - crop[1]) * 5)
    header = 52
    board = Image.new("RGBA", (panel_size[0] * len(STATES), header + panel_size[1] * 2), (255, 247, 250, 255))
    draw = ImageDraw.Draw(board)
    for column, state in enumerate(STATES):
        x = column * panel_size[0]
        draw.text((x + 12, 18), state, fill=(66, 40, 54, 255))
        contact = compose(state, True).crop(crop).resize(panel_size, Image.Resampling.NEAREST)
        light = checkerboard(panel_size)
        light.alpha_composite(contact)
        dark = Image.new("RGBA", panel_size, (18, 18, 20, 255))
        dark.alpha_composite(contact)
        board.alpha_composite(light, (x, header))
        board.alpha_composite(dark, (x, header + panel_size[1]))
    path = OUTPUT / "male-starter-contract-repair-v1-contact-board.png"
    board.convert("RGB").save(path, optimize=True)
    return path


def main() -> None:
    records = write_candidates()
    board = render_board()
    contact_board = render_contact_board()
    runtime_promoted = all(record["runtimePromoted"] for record in records)
    manifest = {
        "schemaVersion": 1,
        "recordType": "male_starter_contract_repair_candidate",
        "version": "v1",
        "canonicalBase": "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_male_light_v1.png",
        "approvedSittingPantsCandidate": str(SITTING_PANTS.relative_to(ROOT)),
        "board": str(board.relative_to(ROOT)),
        "contactBoard": str(contact_board.relative_to(ROOT)),
        "runtimePromoted": runtime_promoted,
        "promotionStatus": (
            "runtime_promoted_independent_review_blocked"
            if runtime_promoted
            else "candidate_pending_runtime_promotion"
        ),
        "independentReview": {
            "status": "BLOCKED",
            "reason": "reviewer agent exhausted the current Codex usage quota before returning a verdict",
        },
        "candidates": records,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    print(board)


if __name__ == "__main__":
    main()
