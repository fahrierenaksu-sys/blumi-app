#!/usr/bin/env python3
"""Produce candidate-only 4W+1S motion for the approved monochrome trouser.

The approved static pixels stay locked above the crotch hinge. Each lower leg
uses its own anchored affine transform so its centre and hem follow the exact
user-approved Milk Tea v7 shoe pose. No runtime or catalog path is written.
"""

from __future__ import annotations

import hashlib
import json
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


REPO = Path(__file__).resolve().parents[3]
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
ITEM_ROOT = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/bottom/monochrome_street_tailoring_bottom"
)
STATIC_REVIEW = ITEM_ROOT / "static-review-v2"
STATIC_APPROVAL = (
    STATIC_REVIEW / "monochrome-street-tailoring-v2-user-approval.json"
)
STATIC = ITEM_ROOT / "rig/static-review-casual-v6.png"
STATIC_SHA256 = "63e09739f87e93dc0ee1d1897c5f6ae6246c5a1ac2b8f4b91e17e3120bde6ca9"
SHOE_APPROVAL = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "shoes-motion-v7/shoes-motion-v7-user-approval.json"
)
SHOE_STATIC = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "candidates/shoes/milk_tea_court/rig/static-v7.png"
)
SHOE_MOTION = (
    REPO
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
    / "shoes-motion-v7/milk_tea_court"
)
OUTPUT = ITEM_ROOT / "motion-v2"
APPROVAL_CHECKER = OUTPUT / "monochrome-tailoring-motion-v2-checker.png"
APPROVAL_BLACK = OUTPUT / "monochrome-tailoring-motion-v2-black.png"
WALK_GIF = OUTPUT / "monochrome-tailoring-motion-v2-walk.gif"
MANIFEST = OUTPUT / "monochrome-tailoring-motion-v2-manifest.json"

POSES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)
CANVAS = (256, 384)
HINGE_Y = 297
MOTION_SHOE_OVERLAP_DEPTH = 9


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
    return digest.hexdigest()


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def _load_hash_bound(path: Path, expected: str) -> Image.Image:
    source_bytes = path.read_bytes()
    actual = hashlib.sha256(source_bytes).hexdigest()
    if actual != expected:
        raise ValueError(f"approved input drift for {path}: {actual}")
    with Image.open(BytesIO(source_bytes)) as source:
        image = source.convert("RGBA")
    if image.size != CANVAS:
        raise ValueError(f"{path}: expected {CANVAS}, got {image.size}")
    return image


def _clean(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def verify_static_approval() -> tuple[dict[str, object], str]:
    receipt_bytes = STATIC_APPROVAL.read_bytes()
    approval = json.loads(receipt_bytes)
    if approval.get("verdict") != "PASS":
        raise ValueError("static approval verdict is not PASS")
    if approval.get("approvalScope") != "monochrome_street_tailoring_bottom_v2_static":
        raise ValueError("static approval scope mismatch")
    if approval.get("explicitUserApproval") is not True:
        raise ValueError("explicit static user approval is missing")
    approved = approval.get("approvedArtifacts")
    if not isinstance(approved, dict):
        raise ValueError("static approval artifact map is missing")
    relative = STATIC.relative_to(REPO).as_posix()
    if approved.get(relative) != STATIC_SHA256:
        raise ValueError("approved static hash is not bound in receipt")
    _load_hash_bound(STATIC, STATIC_SHA256)
    return approval, hashlib.sha256(receipt_bytes).hexdigest()


def _shoe_path(pose: str) -> Path:
    if pose == "walking_front_f01":
        return SHOE_STATIC
    return SHOE_MOTION / f"room_avatar_shoes_male_milk_tea_court_v1_{pose}.png"


def load_approved_shoes() -> tuple[dict[str, Image.Image], dict[str, str], str]:
    receipt_bytes = SHOE_APPROVAL.read_bytes()
    approval = json.loads(receipt_bytes)
    if approval.get("verdict") != "PASS" or approval.get("explicitUserApproval") is not True:
        raise ValueError("approved Milk Tea v7 motion receipt is invalid")
    style = approval.get("styles", {}).get("milk_tea_court")
    if not isinstance(style, dict):
        raise ValueError("Milk Tea approval hashes are missing")
    shoes: dict[str, Image.Image] = {}
    hashes: dict[str, str] = {}
    for pose in POSES:
        hash_key = "static" if pose == "walking_front_f01" else pose
        expected = style.get(hash_key)
        if not isinstance(expected, str):
            raise ValueError(f"Milk Tea approval hash missing for {pose}")
        shoes[pose] = _load_hash_bound(_shoe_path(pose), expected)
        hashes[pose] = expected
    return shoes, hashes, hashlib.sha256(receipt_bytes).hexdigest()


def _components(image: Image.Image, threshold: int = 16) -> list[list[tuple[int, int]]]:
    alpha = np.asarray(image.convert("RGBA").getchannel("A"))
    visible = alpha > threshold
    visited = np.zeros(visible.shape, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    height, width = visible.shape
    for y in range(height):
        for x in range(width):
            if not visible[y, x] or visited[y, x]:
                continue
            visited[y, x] = True
            pending = [(x, y)]
            component: list[tuple[int, int]] = []
            while pending:
                current_x, current_y = pending.pop()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if visited[next_y, next_x] or not visible[next_y, next_x]:
                        continue
                    visited[next_y, next_x] = True
                    pending.append((next_x, next_y))
            components.append(component)
    return sorted(components, key=len, reverse=True)


def _box(component: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    return (
        min(x for x, _ in component),
        min(y for _, y in component),
        max(x for x, _ in component) + 1,
        max(y for _, y in component) + 1,
    )


def two_component_boxes(image: Image.Image) -> tuple[
    tuple[int, int, int, int],
    tuple[int, int, int, int],
]:
    components = _components(image)
    if len(components) != 2:
        raise ValueError(
            f"expected exactly two visible components, got {[len(c) for c in components]}"
        )
    boxes = sorted((_box(component) for component in components), key=lambda value: value[0])
    return boxes[0], boxes[1]


def lower_leg_boxes(image: Image.Image) -> tuple[
    tuple[int, int, int, int],
    tuple[int, int, int, int],
]:
    lower = image.crop((0, HINGE_Y, CANVAS[0], CANVAS[1]))
    boxes = two_component_boxes(lower)
    return tuple(
        (left, top + HINGE_Y, right, bottom + HINGE_Y)
        for left, top, right, bottom in boxes
    )  # type: ignore[return-value]


def _isolated_leg(source: Image.Image, index: int) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    if index == 0:
        result.paste(source.crop((0, HINGE_Y, 128, CANVAS[1])), (0, HINGE_Y))
    else:
        result.paste(
            source.crop((128, HINGE_Y, CANVAS[0], CANVAS[1])),
            (128, HINGE_Y),
        )
    return result


def _transform_leg(
    leg: Image.Image,
    *,
    source_box: tuple[int, int, int, int],
    source_shoe_box: tuple[int, int, int, int],
    target_shoe_box: tuple[int, int, int, int],
) -> Image.Image:
    source_center = (source_shoe_box[0] + source_shoe_box[2]) / 2
    target_center = (target_shoe_box[0] + target_shoe_box[2]) / 2
    maximum_dx = target_center - source_center
    source_height = source_box[3] - HINGE_Y
    target_hem = target_shoe_box[1] + MOTION_SHOE_OVERLAP_DEPTH
    target_height = target_hem - HINGE_Y
    if source_height <= 0 or target_height <= 0:
        raise ValueError("invalid leg motion geometry")
    scale_y = target_height / source_height
    shear = maximum_dx / source_height
    inverse = (
        1.0,
        -shear / scale_y,
        shear * HINGE_Y / scale_y,
        0.0,
        1.0 / scale_y,
        HINGE_Y - HINGE_Y / scale_y,
    )
    return leg.transform(
        CANVAS,
        Image.Transform.AFFINE,
        inverse,
        resample=Image.Resampling.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )


def _build_frames_from_approved_inputs(
    source: Image.Image,
    shoes: dict[str, Image.Image],
) -> dict[str, Image.Image]:
    source_leg_boxes = lower_leg_boxes(source)
    source_shoe_boxes = two_component_boxes(shoes["walking_front_f01"])
    frames: dict[str, Image.Image] = {}
    for pose in POSES:
        if pose == "walking_front_f01":
            frames[pose] = source.copy()
            continue
        target_shoe_boxes = two_component_boxes(shoes[pose])
        frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        for index in (0, 1):
            transformed = _transform_leg(
                _isolated_leg(source, index),
                source_box=source_leg_boxes[index],
                source_shoe_box=source_shoe_boxes[index],
                target_shoe_box=target_shoe_boxes[index],
            )
            frame = Image.alpha_composite(frame, transformed)
        # A one-pixel, pose-stable medial lane is part of the approved static
        # geometry. Clear it after resampling so two sub-threshold edge samples
        # cannot alpha-composite into a false bridge.
        frame_pixels = frame.load()
        for y in range(HINGE_Y, CANVAS[1]):
            frame_pixels[127, y] = (0, 0, 0, 0)
        # Replace the entire upper band, including transparent pixels. An alpha
        # composite would leave transformed resampling dust in empty areas.
        frame.paste(source.crop((0, 0, CANVAS[0], HINGE_Y)), (0, 0))
        frames[pose] = _clean(frame)
    return frames


def build_frames() -> dict[str, Image.Image]:
    verify_static_approval()
    source = _load_hash_bound(STATIC, STATIC_SHA256)
    shoes, _, _ = load_approved_shoes()
    return _build_frames_from_approved_inputs(source, shoes)


def _motion_context_path(prefix: str, pose: str) -> Path:
    return MOTION / f"room_avatar_{prefix}_{pose}.png"


def compose(pose: str, bottom: Image.Image, shoes: Image.Image) -> Image.Image:
    layers = (
        load_rgba(_motion_context_path("base_male_light_v1", pose)),
        load_rgba(ROOM / "avatar_room_face_male_warm_friendly_v1.png"),
        shoes,
        bottom,
        load_rgba(_motion_context_path("top_male_powder_blue_crew_tee_v1", pose)),
        load_rgba(ROOM / "avatar_room_hair_front_male_espresso_crop_v1.png"),
    )
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        result = Image.alpha_composite(result, layer)
    return result


def _checker(size: tuple[int, int], *, black: bool) -> Image.Image:
    if black:
        return Image.new("RGBA", size, (5, 5, 7, 255))
    result = Image.new("RGBA", size, (255, 253, 255, 255))
    draw = ImageDraw.Draw(result)
    cell = 16
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=(232, 228, 232, 255)
                if (x // cell + y // cell) % 2
                else (255, 253, 255, 255),
            )
    return result


def _font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _pose_label(pose: str) -> str:
    return f"W{int(pose[-2:])}" if pose.startswith("walking") else "S1"


def approval_board(
    frames: dict[str, Image.Image],
    shoes: dict[str, Image.Image],
    *,
    black: bool,
) -> Image.Image:
    board = _checker((2000, 1300), black=black)
    draw = ImageDraw.Draw(board)
    color = (245, 239, 244, 255) if black else (57, 42, 51, 255)
    muted = (190, 181, 188, 255) if black else (112, 91, 104, 255)
    draw.text(
        (34, 24),
        "MONOCHROME RELAXED TAILORING V2 / 4W+1S MOTION",
        font=_font(22),
        fill=color,
    )
    draw.text(
        (34, 58),
        "approved static identity / canonical male pose / approved Milk Tea v7 contact",
        font=_font(13),
        fill=muted,
    )
    cell_width = 400
    for index, pose in enumerate(POSES):
        x = index * cell_width
        composite = compose(pose, frames[pose], shoes[pose])
        full = _checker((320, 480), black=black)
        full.alpha_composite(
            composite.resize((320, 480), Image.Resampling.LANCZOS)
        )
        board.alpha_composite(full, (x + 40, 126))
        closeup = composite.crop((80, 282, 176, 356)).resize(
            (384, 296),
            Image.Resampling.LANCZOS,
        )
        contact = _checker(closeup.size, black=black)
        contact.alpha_composite(closeup)
        board.alpha_composite(contact, (x + 8, 700))
        isolated = frames[pose].crop((88, 270, 168, 344)).resize(
            (320, 296),
            Image.Resampling.LANCZOS,
        )
        isolated_bg = _checker(isolated.size, black=black)
        isolated_bg.alpha_composite(isolated)
        board.alpha_composite(isolated_bg, (x + 40, 1000))
        draw.text((x + 42, 98), _pose_label(pose), font=_font(18), fill=color)
        draw.text((x + 12, 672), "WAIST / CROTCH / SHOE 4X", font=_font(12), fill=color)
        draw.text((x + 42, 972), "ISOLATED MOTION LAYER 4X", font=_font(12), fill=color)
    return board


def render_walk_gif(
    frames: dict[str, Image.Image],
    shoes: dict[str, Image.Image],
) -> None:
    previews: list[Image.Image] = []
    for pose in POSES[:4]:
        panel = Image.new("RGB", (512, 820), (255, 249, 252))
        avatar = compose(pose, frames[pose], shoes[pose]).resize(
            (512, 768),
            Image.Resampling.LANCZOS,
        )
        panel.paste(avatar, (0, 52), avatar.getchannel("A"))
        draw = ImageDraw.Draw(panel)
        draw.text((20, 16), _pose_label(pose), font=_font(22), fill=(57, 42, 51))
        previews.append(panel)
    previews[0].save(
        WALK_GIF,
        save_all=True,
        append_images=previews[1:],
        duration=140,
        loop=0,
        disposal=2,
        optimize=False,
    )


def frame_path(pose: str) -> Path:
    return OUTPUT / f"room_avatar_bottom_male_monochrome_street_tailoring_bottom_v2_{pose}.png"


def _save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def render() -> tuple[Path, ...]:
    room_before = tree_sha256(ROOM)
    _, static_approval_receipt_sha256 = verify_static_approval()
    source = _load_hash_bound(STATIC, STATIC_SHA256)
    (
        shoes,
        approved_shoe_hashes,
        shoe_approval_receipt_sha256,
    ) = load_approved_shoes()
    frames = _build_frames_from_approved_inputs(source, shoes)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frame_outputs: list[Path] = []
    for pose, frame in frames.items():
        path = frame_path(pose)
        _save(frame, path)
        frame_outputs.append(path)
    _save(approval_board(frames, shoes, black=False), APPROVAL_CHECKER)
    _save(approval_board(frames, shoes, black=True), APPROVAL_BLACK)
    render_walk_gif(frames, shoes)
    room_after = tree_sha256(ROOM)
    manifest = {
        "schemaVersion": 1,
        "itemId": "monochrome_street_tailoring_bottom",
        "approvalScope": "static_user_approved_motion_user_approval_pending",
        "candidateOnly": True,
        "runtimePromoted": False,
        "staticApprovalReceipt": str(STATIC_APPROVAL.relative_to(REPO)),
        "staticApprovalReceiptSha256": static_approval_receipt_sha256,
        "staticSha256": STATIC_SHA256,
        "shoeApprovalReceipt": str(SHOE_APPROVAL.relative_to(REPO)),
        "shoeApprovalReceiptSha256": shoe_approval_receipt_sha256,
        "frames": {
            pose: {
                "path": str(frame_path(pose).relative_to(REPO)),
                "sha256": sha256(frame_path(pose)),
                "approvedShoePath": str(_shoe_path(pose).relative_to(REPO)),
                "approvedShoeSha256": approved_shoe_hashes[pose],
            }
            for pose in POSES
        },
        "evidence": {
            str(APPROVAL_CHECKER.relative_to(REPO)): sha256(APPROVAL_CHECKER),
            str(APPROVAL_BLACK.relative_to(REPO)): sha256(APPROVAL_BLACK),
            str(WALK_GIF.relative_to(REPO)): sha256(WALK_GIF),
        },
        "runtimeRoomTreeSha256Before": room_before,
        "runtimeRoomTreeSha256After": room_after,
    }
    if room_before != room_after:
        raise RuntimeError("candidate motion render changed the runtime room tree")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    return (*frame_outputs, APPROVAL_CHECKER, APPROVAL_BLACK, WALK_GIF, MANIFEST)


def main() -> None:
    for output in render():
        print(output.relative_to(REPO))


if __name__ == "__main__":
    main()
