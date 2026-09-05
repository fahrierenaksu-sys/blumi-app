"""Finish the non-live modern track trouser candidate on the canonical male rig."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
QA = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-26/reillustrated-wave2"
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"


def close_front_rise(layer: Image.Image) -> Image.Image:
    """Close the triangular body exposure while retaining a narrow leg split."""

    result = layer.copy()
    pixels = result.load()
    for y in range(294, 326):
        opaque = [x for x in range(96, 160) if pixels[x, y][3] >= 80]
        if not opaque:
            continue
        center_left = max((x for x in opaque if x < 128), default=None)
        center_right = min((x for x in opaque if x >= 128), default=None)
        if center_left is None or center_right is None:
            continue
        # The front rise is closed through the upper thigh. Lower down, two
        # dark seam pixels distinguish the legs without exposing body skin.
        repair_left = 118
        repair_right = 139
        for x in range(repair_left, repair_right):
            # Sample well inside the cloth, not from the dark antialiased edge
            # of the generated leg opening.
            sample_x = 112 if x < 128 else 144
            red, green, blue, _ = pixels[sample_x, y]
            if y >= 309 and x in (127, 128):
                pixels[x, y] = (max(0, red - 22), max(0, green - 22), max(0, blue - 18), 255)
            else:
                pixels[x, y] = (red, green, blue, 255)
    return result


def main() -> None:
    layer_path = QA / "modern_track_luxury_bottom_alpha.png"
    layer = close_front_rise(Image.open(layer_path).convert("RGBA"))
    layer.save(layer_path)

    composite = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    for name in (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1.png",
    ):
        composite.alpha_composite(Image.open(ROOM / name).convert("RGBA"))
    composite.alpha_composite(layer)
    composite.save(QA / "modern_track_luxury_bottom_canonical_composite.png")
    composite.crop((82, 270, 174, 356)).resize((552, 516), Image.Resampling.NEAREST).save(
        QA / "modern_track_luxury_bottom_canonical_closeup.png"
    )


if __name__ == "__main__":
    main()
