#!/usr/bin/env python3
"""Render one honest 54-item male wardrobe redesign progress board.

Every source must be a candidate-only, 256x384 RGBA composite already rendered
on the canonical male base. The board is visual progress evidence; it does not
promote assets or turn candidate files into PASS verdicts.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
DEFAULT_MANIFEST = EVIDENCE_ROOT / "asset-manifest.json"
DEFAULT_SELECTION = EVIDENCE_ROOT / "review-composite-selection.json"
DEFAULT_OUTPUT = EVIDENCE_ROOT / "male-wardrobe-54-on-base-progress-board.png"

CANVAS = (256, 384)
COLUMNS = 9
ROWS = 6
CELL = (320, 452)
HEADER = 52
BOARD_SIZE = (COLUMNS * CELL[0], ROWS * CELL[1])
CANDIDATE_PREFIX = Path(
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates"
)


@dataclass(frozen=True)
class ReviewComposite:
    ordinal: int
    category: str
    family: str
    slug: str
    source_path: Path
    layer_path: Path
    source_label: str


@dataclass(frozen=True)
class ReviewBoardResult:
    item_count: int
    columns: int
    rows: int
    size: tuple[int, int]
    output_path: Path


def _inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _load_json(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def _candidate_layer_suffix(composite_suffix: Path) -> Path:
    name = composite_suffix.name
    if name == "composite.png":
        layer_name = "static.png"
    elif name.startswith("composite-"):
        layer_name = f"static-{name.removeprefix('composite-')}"
    else:
        raise ValueError(f"cannot derive garment layer from {composite_suffix}")
    return composite_suffix.with_name(layer_name)


def resolve_review_composites(
    *,
    repository_root: Path,
    manifest_path: Path,
    selection_path: Path,
) -> tuple[ReviewComposite, ...]:
    manifest = _load_json(manifest_path)
    selection = _load_json(selection_path)
    items = manifest.get("items")
    if not isinstance(items, list) or len(items) != 54:
        raise ValueError("review board requires exactly 54 manifest items")

    category_counts = {
        category: sum(item.get("category") == category for item in items)
        for category in ("top", "bottom", "shoes")
    }
    if category_counts != {"top": 27, "bottom": 19, "shoes": 8}:
        raise ValueError(f"unexpected wardrobe inventory: {category_counts}")

    defaults = selection.get("defaultCompositeByCategory", {})
    overrides = selection.get("overrides", {})
    resolved: list[ReviewComposite] = []
    seen_slugs: set[str] = set()

    for ordinal, item in enumerate(items, start=1):
        slug = item.get("slug")
        category = item.get("category")
        family = item.get("family")
        candidate_root_value = item.get("candidateRoot")
        if not all(
            isinstance(value, str) and value
            for value in (slug, category, family, candidate_root_value)
        ):
            raise ValueError(f"invalid manifest item at position {ordinal}")
        if slug in seen_slugs:
            raise ValueError(f"duplicate slug: {slug}")
        seen_slugs.add(slug)

        relative_candidate_root = Path(candidate_root_value)
        if (
            relative_candidate_root.is_absolute()
            or ".." in relative_candidate_root.parts
            or relative_candidate_root.parts[: len(CANDIDATE_PREFIX.parts)]
            != CANDIDATE_PREFIX.parts
        ):
            raise ValueError(f"{slug} candidateRoot is not candidate-only")

        selected_relative = overrides.get(slug, defaults.get(category))
        if not isinstance(selected_relative, str) or not selected_relative:
            raise ValueError(f"{slug} has no selected review composite")
        selected_suffix = Path(selected_relative)
        if selected_suffix.is_absolute() or ".." in selected_suffix.parts:
            raise ValueError(f"{slug} selected composite escapes candidate root")

        absolute_source = repository_root / relative_candidate_root / selected_suffix
        layer_suffix = _candidate_layer_suffix(selected_suffix)
        absolute_layer = repository_root / relative_candidate_root / layer_suffix
        if not _inside(repository_root / relative_candidate_root, absolute_source):
            raise ValueError(f"{slug} selected composite escapes candidate root")
        if not _inside(repository_root / relative_candidate_root, absolute_layer):
            raise ValueError(f"{slug} selected layer escapes candidate root")
        if not absolute_source.is_file():
            raise FileNotFoundError(
                f"{slug} missing selected review composite: {absolute_source}"
            )
        if not absolute_layer.is_file():
            raise FileNotFoundError(
                f"{slug} missing selected review layer: {absolute_layer}"
            )

        for kind, path in (("composite", absolute_source), ("layer", absolute_layer)):
            with Image.open(path) as opened:
                opened.load()
                if opened.size != CANVAS or opened.mode != "RGBA":
                    raise ValueError(
                        f"{slug} review {kind} must be 256x384 RGBA; "
                        f"received {opened.size} {opened.mode}"
                    )

        resolved.append(
            ReviewComposite(
                ordinal=ordinal,
                category=category,
                family=family,
                slug=slug,
                source_path=absolute_source,
                layer_path=absolute_layer,
                source_label=layer_suffix.as_posix(),
            )
        )

    return tuple(resolved)


def _checkerboard(size: tuple[int, int], square: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (252, 249, 251, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (
                        x,
                        y,
                        min(x + square - 1, size[0] - 1),
                        min(y + square - 1, size[1] - 1),
                    ),
                    fill=(232, 227, 231, 255),
                )
    return image


def _load_room_layer(repository_root: Path, filename: str) -> Image.Image:
    path = (
        repository_root
        / "apps/mobile/src/features/avatarV2/assets/room"
        / filename
    )
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as opened:
        opened.load()
        if opened.size != CANVAS or opened.mode != "RGBA":
            raise ValueError(
                f"{filename} must be 256x384 RGBA; "
                f"received {opened.size} {opened.mode}"
            )
        return opened.copy()


def _selected_canonical_layer(
    repository_root: Path,
    selection_path: Path | None,
    *,
    selection_key: str,
    default_filename: str,
) -> Image.Image:
    if selection_path is None:
        return _load_room_layer(repository_root, default_filename)
    selection = _load_json(selection_path)
    selected = selection.get("canonicalLayers", {}).get(selection_key)
    if selected is None:
        return _load_room_layer(repository_root, default_filename)
    if not isinstance(selected, str) or not selected:
        raise ValueError(
            f"canonicalLayers.{selection_key} must be a non-empty path"
        )
    relative = Path(selected)
    if (
        relative.is_absolute()
        or ".." in relative.parts
        or relative.parts[: len(CANDIDATE_PREFIX.parts)]
        != CANDIDATE_PREFIX.parts
    ):
        raise ValueError(f"canonical {selection_key} must be candidate-only")
    absolute = repository_root / relative
    if not absolute.is_file():
        raise FileNotFoundError(absolute)
    with Image.open(absolute) as opened:
        opened.load()
        if opened.size != CANVAS or opened.mode != "RGBA":
            raise ValueError(
                f"canonical {selection_key} must be 256x384 RGBA; "
                f"received {opened.size} {opened.mode}"
            )
        return opened.copy()


def compose_canonical_outfit(
    repository_root: Path,
    item: ReviewComposite,
    *,
    selection_path: Path | None = None,
) -> Image.Image:
    """Recompose every candidate on one neutral canonical male character."""

    base = _load_room_layer(
        repository_root,
        "avatar_room_base_male_light_v1.png",
    )
    face = _load_room_layer(
        repository_root,
        "avatar_room_face_male_warm_friendly_v1.png",
    )
    hair = _selected_canonical_layer(
        repository_root,
        selection_path,
        selection_key="hairFront",
        default_filename="avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    neutral_top = _load_room_layer(
        repository_root,
        "avatar_room_top_male_cream_basic_tee_v1.png",
    )
    neutral_bottom = _selected_canonical_layer(
        repository_root,
        selection_path,
        selection_key="bottom",
        default_filename="avatar_room_bottom_male_navy_straight_pants_v1.png",
    )
    neutral_shoes = _load_room_layer(
        repository_root,
        "avatar_room_shoes_male_milk_tea_court_v1.png",
    )
    with Image.open(item.layer_path) as opened:
        selected = opened.convert("RGBA")

    if item.category == "top":
        layers = (base, face, neutral_bottom, neutral_shoes, selected, hair)
    elif item.category == "bottom":
        if item.slug == "navy_straight_pants":
            layers = (base, face, selected, neutral_shoes, neutral_top, hair)
        else:
            layers = (base, face, neutral_shoes, selected, neutral_top, hair)
    elif item.category == "shoes":
        layers = (base, face, selected, neutral_bottom, neutral_top, hair)
    else:
        raise ValueError(f"unsupported category: {item.category}")

    outfit = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        outfit = Image.alpha_composite(outfit, layer)
    return outfit


def _cell(
    item: ReviewComposite,
    repository_root: Path,
    selection_path: Path,
) -> Image.Image:
    cell = Image.new("RGBA", CELL, (255, 248, 251, 255))
    draw = ImageDraw.Draw(cell)
    font = ImageFont.load_default()
    draw.text(
        (10, 7),
        f"{item.ordinal:02d}  {item.slug}",
        font=font,
        fill=(47, 37, 48, 255),
    )
    draw.text(
        (10, 25),
        f"{item.category} · {item.family}",
        font=font,
        fill=(112, 91, 104, 255),
    )
    draw.text(
        (10, 40),
        item.source_label[-45:],
        font=font,
        fill=(164, 86, 122, 255),
    )

    panel = _checkerboard(CANVAS)
    composite = compose_canonical_outfit(
        repository_root,
        item,
        selection_path=selection_path,
    )
    panel.alpha_composite(composite)
    cell.alpha_composite(panel, ((CELL[0] - CANVAS[0]) // 2, HEADER + 8))
    return cell


def render_review_board(
    *,
    repository_root: Path,
    manifest_path: Path,
    selection_path: Path,
    output_path: Path,
) -> ReviewBoardResult:
    items = resolve_review_composites(
        repository_root=repository_root,
        manifest_path=manifest_path,
        selection_path=selection_path,
    )
    board = Image.new("RGBA", BOARD_SIZE, (244, 237, 242, 255))
    for index, item in enumerate(items):
        board.alpha_composite(
            _cell(item, repository_root, selection_path),
            ((index % COLUMNS) * CELL[0], (index // COLUMNS) * CELL[1]),
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(output_path, optimize=True)
    return ReviewBoardResult(
        item_count=len(items),
        columns=COLUMNS,
        rows=ROWS,
        size=BOARD_SIZE,
        output_path=output_path,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    result = render_review_board(
        repository_root=REPO_ROOT,
        manifest_path=arguments.manifest,
        selection_path=arguments.selection,
        output_path=arguments.output,
    )
    print(
        f"Rendered {result.item_count} on-base candidates "
        f"({result.columns}x{result.rows}) to {result.output_path}"
    )


if __name__ == "__main__":
    main()
