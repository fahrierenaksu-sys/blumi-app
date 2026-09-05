"""Create a compact, candidate-only review board for seated male bottom families."""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_DIR = (
    ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30"
    / "bottom-sitting-on-base-v6/family-masters"
)
OUTPUT = EVIDENCE_DIR / "male-bottom-sitting-family-master-board-v1.png"
FONT = ImageFont.load_default()


@dataclass(frozen=True)
class Panel:
    key: str
    title: str
    subtitle: str
    source: Path


PANELS = (
    Panel(
        "straight",
        "STRAIGHT",
        "Mid Blue Jeans · shaped thighs · separate cuffs",
        EVIDENCE_DIR / "mid-blue-straight-jeans-sitting-master-v1-256.png",
    ),
    Panel(
        "relaxed",
        "RELAXED",
        "Warm Sand · controlled volume · shoe-aware break",
        EVIDENCE_DIR / "warm-sand-relaxed-pants-sitting-master-v1-256.png",
    ),
    Panel(
        "cargo",
        "CARGO",
        "Creative Utility · attached pockets · two leg volumes",
        EVIDENCE_DIR / "creative-utility-cargo-sitting-master-v1-256.png",
    ),
    Panel(
        "shorts",
        "SHORTS",
        "Sage Cuffed · exposed lower legs · no shoe overlap",
        EVIDENCE_DIR / "sage-cuffed-shorts-sitting-master-v1-256.png",
    ),
)


def render_board() -> Image.Image:
    board = Image.new("RGBA", (760, 1040), "#fffafd")
    draw = ImageDraw.Draw(board)
    draw.text((30, 22), "MALE BOTTOMS — SITTING FAMILY MASTERS", fill="#302936", font=FONT)
    draw.text(
        (30, 44),
        "candidate-only · canonical seated pose · no runtime promotion",
        fill="#746a77",
        font=FONT,
    )
    for index, panel in enumerate(PANELS):
        column, row = index % 2, index // 2
        x, y = 30 + column * 365, 80 + row * 455
        draw.rounded_rectangle((x, y, x + 335, y + 445), radius=20, fill="#ffffff", outline="#edd7e2", width=2)
        draw.text((x + 18, y + 16), panel.title, fill="#332b38", font=FONT)
        draw.text((x + 18, y + 34), panel.subtitle, fill="#786e7c", font=FONT)
        with Image.open(panel.source) as source:
            image = source.convert("RGBA")
        board.alpha_composite(image, (x + 39, y + 55))
    return board


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    render_board().save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
