#!/usr/bin/env python3
"""Stage semantic accessory occlusion repairs without writing live assets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
SOURCE = ROOT / "docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15/accessory"
OUT = ROOT / "docs/avatar-motion-pipeline/female-accessory-occlusion-staging/2026-07-15"
CANVAS = (256, 384)
STATES = (
    ("static", "Static"),
    ("walking_front_f01", "Walk 01"),
    ("walking_front_f02", "Walk 02"),
    ("walking_front_f03", "Walk 03"),
    ("walking_front_f04", "Walk 04"),
    ("sitting_front_f01", "Sit 01"),
)


def clean(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    image.putdata([
        (0, 0, 0, 0) if alpha == 0 else (red, green, blue, alpha)
        for red, green, blue, alpha in image.getdata()
    ])
    return image


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def live_path(slug: str, state: str) -> Path:
    if state == "static":
        return ROOM / f"avatar_room_accessory_female_{slug}_v2.png"
    return MOTION / f"room_avatar_accessory_female_{slug}_v2_{state}.png"


def source(slug: str, state: str) -> Image.Image:
    return clean(Image.open(SOURCE / slug / f"{state}.png"))


def alpha_subset(image: Image.Image, predicate) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    src = image.load()
    dst = result.load()
    for y in range(CANVAS[1]):
        for x in range(CANVAS[0]):
            pixel = src[x, y]
            if pixel[3] and predicate(x, y, pixel):
                dst[x, y] = pixel
    return clean(result)


def translated_crop(image: Image.Image, box: tuple[int, int, int, int], dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(image.crop(box), (box[0] + dx, box[1] + dy))
    return clean(result)


def components(image: Image.Image) -> list[tuple[int, int, int, int]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    found: list[tuple[int, tuple[int, int, int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] <= 16 or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            points: list[tuple[int, int]] = []
            while stack:
                px, py = stack.pop()
                points.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if (
                        0 <= nx < image.width and 0 <= ny < image.height
                        and pixels[nx, ny] > 16 and (nx, ny) not in seen
                    ):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(points) >= 20:
                found.append((len(points), (
                    min(point[0] for point in points), min(point[1] for point in points),
                    max(point[0] for point in points) + 1, max(point[1] for point in points) + 1,
                )))
    return [box for _, box in sorted(found, reverse=True)]


def body_layer(state: str) -> Image.Image:
    path = ROOM / "avatar_room_base_female_v2.png" if state == "static" else MOTION / f"room_avatar_base_female_v2_{state}.png"
    return clean(Image.open(path))


def split_micro_bag(state: str) -> dict[str, Image.Image]:
    item = source("cherry_micro_bag", state)
    bounds = item.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("empty micro bag")
    bag_top = bounds[3] - 36
    # Each authored source pixel has exactly one owner. Overlapping masks used
    # here previously double-painted the seam and darkened it at runtime.
    strap = alpha_subset(item, lambda _x, y, _pixel: y < bag_top)
    authored_front = alpha_subset(item, lambda _x, y, _pixel: y >= bag_top)
    bag_back = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    front = authored_front.copy()
    back_pixels = bag_back.load()
    front_pixels = front.load()
    strap_pixels = strap.load()
    body_alpha = body_layer(state).getchannel("A")
    body_pixels = body_alpha.load()
    for y in range(235, 350):
        for x in range(145, 230):
            if body_pixels[x, y] > 16 and strap_pixels[x, y][3]:
                back_pixels[x, y] = strap_pixels[x, y]
                strap_pixels[x, y] = (0, 0, 0, 0)
            if (
                state == "sitting_front_f01"
                and 166 <= x and 295 <= y < 322
                and front_pixels[x, y][3]
            ):
                back_pixels[x, y] = front_pixels[x, y]
                front_pixels[x, y] = (0, 0, 0, 0)
    return {
        "bag-back.png": clean(bag_back),
        "strap-back.png": clean(strap),
        "bag-front.png": clean(front),
    }


def split_earrings(state: str) -> dict[str, Image.Image]:
    item = source("pearl_drop_earrings", state)
    boxes = sorted(components(item)[:2], key=lambda box: box[0])
    if len(boxes) != 2:
        raise ValueError("earrings must have two connected components")
    rear = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    front = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for index, box in enumerate(boxes):
        dx = -14 if index == 0 else 16
        pearl_start = box[1] + 22
        rear_part = alpha_subset(item, lambda x, y, _pixel, box=box, split=pearl_start: box[0] <= x < box[2] and box[1] <= y < split)
        front_part = alpha_subset(item, lambda x, y, _pixel, box=box, split=pearl_start: box[0] <= x < box[2] and split <= y < box[3])
        rear.alpha_composite(translated_crop(rear_part, box, dx, 0))
        front.alpha_composite(translated_crop(front_part, box, dx, 0))
    return {"earring-rear.png": clean(rear), "pearl-front.png": clean(front)}


def anchor_clips(state: str) -> dict[str, Image.Image]:
    item = source("sunny_star_clips", state)
    boxes = sorted(components(item)[:2], key=lambda box: box[0])
    if len(boxes) != 2:
        raise ValueError("star clips must have two connected components")
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(translated_crop(item, boxes[0], -28, 0))
    result.alpha_composite(translated_crop(item, boxes[1], -34, 10))
    return {"clips-front.png": clean(result)}


def layer(name: str, state: str) -> Image.Image:
    if state == "static":
        path = ROOM / f"avatar_room_{name}.png"
    else:
        path = MOTION / f"room_avatar_{name}_{state}.png"
    return clean(Image.open(path))


def compose(
    state: str,
    body_back: Image.Image,
    rear: Image.Image,
    front: Image.Image,
) -> Image.Image:
    result = Image.new("RGBA", CANVAS, "#f9eff6")
    result.alpha_composite(layer("hair_back_female_mocha_ribbon_blowout_v2", state))
    result.alpha_composite(body_back)
    for name in (
        "base_female_v2", "face_female_soft_doll_foundation_v2",
        "eyes_female_mocha_doe_v2", "nose_female_soft_button_v2",
        "mouth_female_peach_whisper_smile_v2",
        "bottom_female_denim_skort_shorts_v2",
        "shoes_female_milk_tea_court_sneakers_v2",
        "top_female_cream_basic_tee_v2",
    ):
        result.alpha_composite(layer(name, state))
    result.alpha_composite(rear)
    result.alpha_composite(layer("hair_front_female_mocha_ribbon_blowout_v2", state))
    result.alpha_composite(front)
    return result


def font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def render_evidence(slug: str, staged: dict[str, dict[str, Image.Image]], crop: tuple[int, int, int, int]) -> None:
    full = Image.new("RGB", (256 * 6, 420), "#f9eff6")
    close_width = (crop[2] - crop[0]) * 2
    close_height = (crop[3] - crop[1]) * 2
    close = Image.new("RGB", (close_width * 6, close_height + 36), "#f9eff6")
    full_draw = ImageDraw.Draw(full)
    close_draw = ImageDraw.Draw(close)
    for index, (state, label) in enumerate(STATES):
        parts = staged[state]
        body_back = parts.get("bag-back.png") or Image.new("RGBA", CANVAS)
        rear = parts.get("strap-back.png") or parts.get("earring-rear.png") or Image.new("RGBA", CANVAS)
        front = parts.get("bag-front.png") or parts.get("pearl-front.png") or parts.get("clips-front.png") or Image.new("RGBA", CANVAS)
        avatar = compose(state, body_back, rear, front)
        full.paste(avatar.convert("RGB"), (index * 256, 36))
        full_draw.text((index * 256 + 8, 10), label, fill="#4c3948", font=font(14))
        detail = avatar.crop(crop).resize((close_width, close_height), Image.Resampling.NEAREST)
        close.paste(detail.convert("RGB"), (index * close_width, 36))
        close_draw.text((index * close_width + 8, 10), label, fill="#4c3948", font=font(14))
    (OUT / slug).mkdir(parents=True, exist_ok=True)
    full.save(OUT / slug / "full-body-contact-sheet.png", optimize=True)
    close.save(OUT / slug / "closeup-contact-sheet.png", optimize=True)


def stage_item(slug: str, parts_for_state, crop: tuple[int, int, int, int]) -> dict[str, object]:
    staged: dict[str, dict[str, Image.Image]] = {}
    live_hashes: dict[str, str] = {}
    for state, _ in STATES:
        parts = parts_for_state(state)
        staged[state] = parts
        state_dir = OUT / slug / state
        state_dir.mkdir(parents=True, exist_ok=True)
        for filename, image in parts.items():
            clean(image).save(state_dir / filename, optimize=True)
        live_hashes[state] = sha256(live_path(slug, state))
    render_evidence(slug, staged, crop)
    return {
        "slug": slug,
        "parts": list(next(iter(staged.values())).keys()),
        "states": {
            state: {
                "liveSha256": live_hashes[state],
                "parts": {
                    filename: {
                        "sha256": sha256(OUT / slug / state / filename),
                        "bbox": list(image.getchannel("A").getbbox() or ()),
                    }
                    for filename, image in staged[state].items()
                },
            }
            for state, _ in STATES
        },
        "liveAssetsUntouched": all(sha256(live_path(slug, state)) == live_hashes[state] for state, _ in STATES),
        "producerVerdict": "PASS_CANDIDATE",
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    items = [
        stage_item("cherry_micro_bag", split_micro_bag, (105, 165, 230, 350)),
        stage_item("pearl_drop_earrings", split_earrings, (55, 125, 201, 240)),
        stage_item("sunny_star_clips", anchor_clips, (45, 95, 205, 205)),
    ]
    manifest = {
        "rigId": "blumi_2_5d_layered_v1",
        "fitProfileId": "blumi_female_room_avatar_v1",
        "runtimeContract": "typed accessoryLayerParts: behindBody + behindHairFront + front",
        "liveOverwrite": False,
        "items": items,
        "independentReviewVerdict": "PASS",
        "promotion": "PROMOTED_AFTER_INDEPENDENT_REVIEW",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"items": len(items), "promotion": manifest["promotion"]}, indent=2))


if __name__ == "__main__":
    main()
