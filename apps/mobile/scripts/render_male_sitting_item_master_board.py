"""Render all 19 candidate seated-bottom masters at one consistent scale."""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
MASTER_DIR = (
    ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-sitting-on-base-v6/item-masters"
)
OUTPUT = MASTER_DIR / "male-bottom-sitting-item-master-board-v1.png"
FONT = ImageFont.load_default()
TITLE_FONT = ImageFont.load_default()


@dataclass(frozen=True)
class Panel:
    key: str
    title: str
    source: Path


def _panel(key: str, title: str) -> Panel:
    return Panel(key, title, MASTER_DIR / f"{key}-sitting-master-v1-1024.png")


PANELS = (
    _panel("charcoal-tapered-chinos", "Charcoal Tapered Chinos"),
    _panel("mid-blue-straight-jeans", "Mid Blue Straight Jeans"),
    _panel("navy-straight-pants", "Navy Straight Pants"),
    _panel("wide-pleated-technical-trousers", "Wide Pleated Technical"),
    _panel("straight-utility-tailored-trousers", "Straight Utility Tailored"),
    _panel("midnight-relaxed-tailoring-trousers", "Midnight Relaxed Tailoring"),
    _panel("warm-sand-relaxed-pants", "Warm Sand Relaxed"),
    _panel("warm-sand-deconstructed-trousers", "Warm Sand Deconstructed"),
    _panel("washed-baggy-denim", "Washed Baggy Denim"),
    _panel("soft-parachute-cargo-pants", "Soft Parachute Cargo"),
    _panel("creative-utility-bottom", "Creative Utility Cargo"),
    _panel("monochrome-street-tailoring-bottom", "Monochrome Street Tailoring"),
    _panel("modern-track-luxury-bottom", "Modern Track Luxury"),
    _panel("colorblock-nylon-track-pants", "Colorblock Nylon Track"),
    _panel("sage-cuffed-shorts", "Sage Cuffed Shorts"),
    _panel("relaxed-tailored-shorts", "Relaxed Tailored Shorts"),
    _panel("refined-utility-cargo-shorts", "Refined Utility Cargo Shorts"),
    _panel("technical-sport-shorts", "Technical Sport Shorts"),
    _panel("contemporary-resort-street-bottom", "Contemporary Resort Street"),
)


def render_board() -> Image.Image:
    board = Image.new("RGBA", (1080, 1760), "#fffafd")
    draw = ImageDraw.Draw(board)
    draw.text((30, 22), "MALE BOTTOMS — COMPLETE SITTING REVIEW", fill="#302936", font=TITLE_FONT)
    draw.text((30, 42), "19 candidate-only item masters · same seated base · runtime unchanged", fill="#746a77", font=FONT)
    for index, panel in enumerate(PANELS):
        column, row = index % 4, index // 4
        x, y = 30 + column * 262, 76 + row * 330
        draw.rounded_rectangle((x, y, x + 240, y + 302), radius=16, fill="#ffffff", outline="#edd7e2", width=2)
        draw.text((x + 12, y + 12), panel.title, fill="#332b38", font=FONT)
        with Image.open(panel.source) as source:
            image = source.convert("RGBA")
            image.thumbnail((200, 270), Image.Resampling.LANCZOS)
        board.alpha_composite(image, (x + (240 - image.width) // 2, y + 30))
    return board


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    render_board().save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
