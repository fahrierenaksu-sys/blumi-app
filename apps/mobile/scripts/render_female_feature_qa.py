"""Render a compact native/zoom QA sheet for female face, hair and eyewear.

This is evidence generation only. It composites the real transparent runtime
layers on the approved female base; it does not create or alter product assets.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ROOM = ROOT / "src/features/avatarV2/assets/room"
OUT = ROOT.parent.parent / "docs/avatar-motion-pipeline/feature-qa"


def layer(name: str) -> Image.Image:
    return Image.open(ROOM / name).convert("RGBA")


BASE = layer("avatar_room_base_female_v2.png")
DEFAULT = {
    "face": layer("avatar_room_face_female_soft_doll_foundation_v2.png"),
    "eyes": layer("avatar_room_eyes_female_mocha_doe_v2.png"),
    "nose": layer("avatar_room_nose_female_soft_button_v2.png"),
    "mouth": layer("avatar_room_mouth_female_peach_whisper_smile_v2.png"),
}


def composite(
    face: str | None = None,
    hair: bool = True,
    glasses: str | None = None,
) -> Image.Image:
    canvas = Image.new("RGBA", BASE.size, (255, 247, 250, 255))
    # Back hair sits behind the head; the base carries the body and neck.
    if hair:
        canvas.alpha_composite(layer("avatar_room_hair_back_female_chestnut_butterfly_bob_v2.png"))
    canvas.alpha_composite(BASE)
    canvas.alpha_composite(layer(face) if face else DEFAULT["face"])
    for key in ("eyes", "nose", "mouth"):
        canvas.alpha_composite(DEFAULT[key])
    if glasses:
        canvas.alpha_composite(layer(glasses))
    # Runtime order is accessory (70) before hairFront (80). Keeping this
    # order in evidence prevents a clean-looking sheet from hiding a z-order
    # collision that users would see in the app.
    if hair:
        canvas.alpha_composite(layer("avatar_room_hair_front_female_chestnut_butterfly_bob_v2.png"))
    return canvas


def motion_layer(prefix: str, frame: str) -> Image.Image:
    return Image.open(ROOM / "motion" / f"{prefix}_{frame}.png").convert("RGBA")


def motion_composite(
    frame: str,
    face_prefix: str | None = None,
    glasses_prefix: str | None = None,
) -> Image.Image:
    canvas = Image.new("RGBA", BASE.size, (255, 247, 250, 255))
    canvas.alpha_composite(motion_layer("room_avatar_hair_back_female_chestnut_butterfly_bob_v2", frame))
    canvas.alpha_composite(motion_layer("room_avatar_base_female_v2", frame))
    canvas.alpha_composite(motion_layer(face_prefix or "room_avatar_face_female_soft_doll_foundation_v2", frame))
    canvas.alpha_composite(motion_layer("room_avatar_eyes_female_mocha_doe_v2", frame))
    canvas.alpha_composite(motion_layer("room_avatar_nose_female_soft_button_v2", frame))
    canvas.alpha_composite(motion_layer("room_avatar_mouth_female_peach_whisper_smile_v2", frame))
    if glasses_prefix:
        canvas.alpha_composite(motion_layer(glasses_prefix, frame))
    canvas.alpha_composite(motion_layer("room_avatar_hair_front_female_chestnut_butterfly_bob_v2", frame))
    return canvas


def label_card(image: Image.Image, label: str, scale: int = 2) -> Image.Image:
    card = Image.new("RGBA", (image.width * scale, image.height * scale + 42), (255, 247, 250, 255))
    card.alpha_composite(image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST))
    draw = ImageDraw.Draw(card)
    draw.text((10, image.height * scale + 10), label, fill=(74, 34, 60, 255))
    return card


def sheet(cards: list[Image.Image], columns: int, path: Path) -> None:
    gap = 18
    width = max(card.width for card in cards)
    height = max(card.height for card in cards)
    rows = (len(cards) + columns - 1) // columns
    canvas = Image.new("RGBA", (columns * width + (columns + 1) * gap, rows * height + (rows + 1) * gap), (255, 247, 250, 255))
    for index, card in enumerate(cards):
        x = gap + (index % columns) * (width + gap)
        y = gap + (index // columns) * (height + gap)
        canvas.alpha_composite(card, (x, y))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(path, quality=95)


def main() -> None:
    glasses = [
        ("rose", "avatar_room_accessory_female_rose_round_glasses_v2.png"),
        ("lavender", "avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2.png"),
        ("mint", "avatar_room_accessory_female_mint_star_oval_glasses_v2.png"),
        ("honey", "avatar_room_accessory_female_honey_blossom_square_glasses_v2.png"),
    ]
    cards = [label_card(composite(glasses=filename), f"glasses · {name}") for name, filename in glasses]
    sheet(cards, 2, OUT / "2026-07-15-female-feature-glasses-native-contact-sheet.png")

    faces = [
        ("warm peach", "avatar_room_face_female_warm_peach_foundation_v2.png"),
        ("rose heart", "avatar_room_face_female_rose_heart_foundation_v2.png"),
    ]
    cards = [label_card(composite(face=filename), f"face · {name}") for name, filename in faces]
    sheet(cards, 2, OUT / "2026-07-15-female-feature-face-native-contact-sheet.png")

    hair_card = label_card(composite(), "hair · chestnut butterfly bob")
    sheet([hair_card], 1, OUT / "2026-07-15-female-feature-hair-native-contact-sheet.png")

    # A close-up matrix keeps the actual landmark fit readable without relying
    # on a simulator screenshot.
    closeups = []
    for name, filename in glasses:
        closeups.append(label_card(composite(glasses=filename).crop((40, 60, 216, 230)), f"{name} · head close-up", 8))
    for name, filename in faces:
        closeups.append(label_card(composite(face=filename).crop((40, 60, 216, 230)), f"{name} · head close-up", 8))
    sheet(closeups, 2, OUT / "2026-07-15-female-feature-head-closeup-matrix.png")

    motion_items = [
        ("rose glasses", "room_avatar_accessory_female_rose_round_glasses_v2", None),
        ("lavender glasses", "room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2", None),
        ("mint glasses", "room_avatar_accessory_female_mint_star_oval_glasses_v2", None),
        ("honey glasses", "room_avatar_accessory_female_honey_blossom_square_glasses_v2", None),
        ("warm peach face", None, "room_avatar_face_female_warm_peach_foundation_v2"),
        ("rose heart face", None, "room_avatar_face_female_rose_heart_foundation_v2"),
    ]
    frames = ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]
    motion_cards = []
    for name, glasses_prefix, face_prefix in motion_items:
        for frame in frames:
            motion_cards.append(label_card(
                motion_composite(frame, face_prefix=face_prefix, glasses_prefix=glasses_prefix),
                f"{name} · {frame}",
                2,
            ))
    sheet(motion_cards, 5, OUT / "2026-07-15-female-feature-motion-4w1s-contact-sheet.png")


if __name__ == "__main__":
    main()
