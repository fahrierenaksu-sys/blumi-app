#!/usr/bin/env python3
"""Render the live-catalog-backed current male wardrobe review board.

The board is candidate-only evidence. It reads product identities from the
current domain catalog, not from the older 54-item redesign manifest. The
manifest is used only to locate reviewed candidate layers shared with the live
catalog.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from render_male_wardrobe_54_progress_board import (
    CANVAS,
    CANDIDATE_PREFIX,
    ReviewBoardResult,
    _candidate_layer_suffix,
    _checkerboard,
    _inside,
    _load_json,
    _load_room_layer,
    _selected_canonical_layer,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
)
DEFAULT_CATALOG = (
    REPO_ROOT / "packages/domain/src/avatar/avatarLoadoutCatalog.ts"
)
DEFAULT_MANIFEST = EVIDENCE_ROOT / "asset-manifest.json"
DEFAULT_SELECTION = EVIDENCE_ROOT / "review-composite-selection.json"
DEFAULT_OUTPUT = EVIDENCE_ROOT / "male-wardrobe-66-on-base-progress-board.png"

PREMIUM_STATIC_PREFIX = Path(
    "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/"
    "candidate-layers/static"
)
YOUNG_STATIC_PREFIX = Path(
    "docs/avatar-motion-pipeline/male-young-drop/2026-07-18/"
    "candidate-layers/static"
)
ALLOWED_LAYER_PREFIXES = (
    CANDIDATE_PREFIX,
    PREMIUM_STATIC_PREFIX,
    YOUNG_STATIC_PREFIX,
)

PREMIUM_HAIR_SLUGS = (
    "soft_textured_crop",
    "controlled_modern_mullet",
    "voluminous_wavy_quiff",
    "short_twists_textured_style",
    "copper_compact_quiff",
    "ash_blond_low_fade_crop",
    "blue_black_short_curls",
)
PREMIUM_REPLACEMENT_TOPS = {
    "dusty_blue_weekend_crew_sweatshirt": "hoodie_or_sweat_closed_neck",
    "modern_track_luxury_top": "hoodie_or_sweat_closed_neck",
    "cocoa_sage_canvas_shacket": "jacket_open_lapel",
}
ACCESSORY_ROLES = {
    "soft_patch_beanie": "headwear",
    "nylon_crossbody_bag": "bag",
    "beaded_charm_necklace": "neck",
    "tortoiseshell_smoke_sunglasses": "eyewear",
    "matte_black_panto_sunglasses": "eyewear",
}
YOUNG_ACCESSORIES = {
    "soft_patch_beanie",
    "nylon_crossbody_bag",
    "beaded_charm_necklace",
    "tinted_star_glasses",
}
EXPECTED_COUNTS = {
    "top": 27,
    "bottom": 19,
    "shoes": 8,
    "hair": 7,
    "accessory": 5,
}
EXPECTED_ITEM_COUNT = sum(EXPECTED_COUNTS.values())
SHORT_NO_CONTACT_SLUGS = {
    "sage_cuffed_shorts",
    "relaxed_tailored_shorts",
    "refined_utility_cargo_shorts",
    "technical_sport_shorts",
}
SHOE_OVER_HEM_SLUGS = {
    "charcoal_tapered_chinos",
    "straight_utility_tailored_trousers",
}

COLUMNS = 11
ROWS = 6
CELL = (320, 452)
HEADER = 52
BOARD_SIZE = (COLUMNS * CELL[0], ROWS * CELL[1])


@dataclass(frozen=True)
class AuthoritativeItem:
    ordinal: int
    category: str
    role: str
    family: str
    slug: str
    shoe_contact_role: str | None
    layer_path: Path
    source_label: str


def _catalog_slugs(catalog_path: Path) -> dict[str, tuple[str, ...]]:
    if not catalog_path.is_file():
        raise FileNotFoundError(catalog_path)
    source = catalog_path.read_text(encoding="utf-8")
    catalog_marker = "export const AVATAR_LOADOUT_CATALOG"
    default_marker = "export const DEFAULT_MALE_AVATAR_LOADOUT"
    catalog_start = source.find(catalog_marker)
    catalog_end = source.find(default_marker, catalog_start)
    if catalog_start < 0 or catalog_end < 0:
        raise ValueError("cannot isolate AVATAR_LOADOUT_CATALOG source range")
    source = source[catalog_start:catalog_end]
    matches = re.finditer(
        r"avatar_v2_(top|bottom|shoes|hair|accessory)_male_"
        r"([a-z0-9_]+)",
        source,
    )
    found: dict[str, list[str]] = {
        category: []
        for category in ("top", "bottom", "shoes", "hair", "accessory")
    }
    for match in matches:
        category, slug = match.groups()
        if slug not in found[category]:
            found[category].append(slug)

    found["hair"] = [
        slug for slug in found["hair"] if slug in PREMIUM_HAIR_SLUGS
    ]
    return {category: tuple(slugs) for category, slugs in found.items()}


def _manifest_lookup(manifest_path: Path) -> dict[str, dict]:
    items = _load_json(manifest_path).get("items")
    if not isinstance(items, list):
        raise ValueError("asset manifest items must be a list")
    lookup: dict[str, dict] = {}
    for item in items:
        slug = item.get("slug")
        if not isinstance(slug, str) or not slug:
            raise ValueError("asset manifest contains an invalid slug")
        if slug in lookup:
            raise ValueError(f"asset manifest contains duplicate slug: {slug}")
        lookup[slug] = item
    return lookup


def _relative_candidate_layer(
    *,
    slug: str,
    category: str,
    manifest_lookup: dict[str, dict],
    selection: dict,
) -> tuple[Path, str]:
    product_layers = selection.get("productLayers", {})
    if not isinstance(product_layers, dict):
        raise ValueError("productLayers must be an object")
    selected_product_layer = product_layers.get(slug)
    if selected_product_layer is not None:
        if not isinstance(selected_product_layer, str) or not selected_product_layer:
            raise ValueError(f"{slug} productLayers entry must be a non-empty path")
        relative = Path(selected_product_layer)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"{slug} productLayers entry escapes repository")
        if slug in PREMIUM_REPLACEMENT_TOPS:
            return relative, PREMIUM_REPLACEMENT_TOPS[slug]
        if category == "hair":
            return relative, "hair_front"
        if category == "accessory":
            return relative, ACCESSORY_ROLES[slug]
        manifest_item = manifest_lookup.get(slug)
        if manifest_item is None or manifest_item.get("category") != category:
            raise ValueError(f"{slug} product layer has no matching manifest item")
        family = manifest_item.get("family")
        if not isinstance(family, str) or not family:
            raise ValueError(f"{slug} has no fit family")
        return relative, family

    if slug in PREMIUM_REPLACEMENT_TOPS:
        relative = PREMIUM_STATIC_PREFIX / f"{slug}.png"
        return relative, PREMIUM_REPLACEMENT_TOPS[slug]

    if category == "hair":
        relative = PREMIUM_STATIC_PREFIX / f"{slug}.png"
        return relative, "hair_front"

    if category == "accessory":
        prefix = YOUNG_STATIC_PREFIX if slug in YOUNG_ACCESSORIES else PREMIUM_STATIC_PREFIX
        relative = prefix / f"{slug}.png"
        return relative, ACCESSORY_ROLES[slug]

    manifest_item = manifest_lookup.get(slug)
    if manifest_item is None:
        raise ValueError(f"live catalog item has no candidate source: {slug}")
    if manifest_item.get("category") != category:
        raise ValueError(f"{slug} category differs between catalog and manifest")
    candidate_root_value = manifest_item.get("candidateRoot")
    family = manifest_item.get("family")
    if not isinstance(candidate_root_value, str) or not candidate_root_value:
        raise ValueError(f"{slug} has no candidateRoot")
    if not isinstance(family, str) or not family:
        raise ValueError(f"{slug} has no fit family")
    candidate_root = Path(candidate_root_value)
    if (
        candidate_root.is_absolute()
        or ".." in candidate_root.parts
        or candidate_root.parts[: len(CANDIDATE_PREFIX.parts)]
        != CANDIDATE_PREFIX.parts
    ):
        raise ValueError(f"{slug} candidateRoot is not candidate-only")

    defaults = selection.get("defaultCompositeByCategory", {})
    overrides = selection.get("overrides", {})
    selected_value = overrides.get(slug, defaults.get(category))
    if not isinstance(selected_value, str) or not selected_value:
        raise ValueError(f"{slug} has no selected review layer")
    selected_suffix = Path(selected_value)
    if selected_suffix.is_absolute() or ".." in selected_suffix.parts:
        raise ValueError(f"{slug} selected path escapes candidate root")
    layer_suffix = _candidate_layer_suffix(selected_suffix)
    return candidate_root / layer_suffix, family


def _validate_layer(
    repository_root: Path,
    relative_layer: Path,
    *,
    slug: str,
) -> Path:
    if relative_layer.is_absolute() or ".." in relative_layer.parts:
        raise ValueError(f"{slug} layer must be repository-relative")
    if not any(
        relative_layer.parts[: len(prefix.parts)] == prefix.parts
        for prefix in ALLOWED_LAYER_PREFIXES
    ):
        raise ValueError(f"{slug} layer is outside approved candidate roots")
    absolute = repository_root / relative_layer
    if not _inside(repository_root, absolute):
        raise ValueError(f"{slug} layer escapes repository root")
    resolved_absolute = absolute.resolve()
    if not any(
        _inside((repository_root / prefix).resolve(), resolved_absolute)
        for prefix in ALLOWED_LAYER_PREFIXES
    ):
        raise ValueError(f"{slug} resolved layer escapes approved candidate roots")
    if not absolute.is_file():
        raise FileNotFoundError(absolute)
    with Image.open(absolute) as opened:
        opened.load()
        if opened.size != CANVAS or opened.mode != "RGBA":
            raise ValueError(
                f"{slug} layer must be 256x384 RGBA; "
                f"received {opened.size} {opened.mode}"
            )
    return absolute


def resolve_authoritative_items(
    *,
    repository_root: Path,
    catalog_path: Path,
    manifest_path: Path,
    selection_path: Path,
) -> tuple[AuthoritativeItem, ...]:
    catalog = _catalog_slugs(catalog_path)
    counts = {category: len(catalog[category]) for category in EXPECTED_COUNTS}
    if counts != EXPECTED_COUNTS:
        raise ValueError(
            f"live male catalog is not the expected {EXPECTED_ITEM_COUNT}-item "
            f"product set: {counts}"
        )
    stale = {
        "fog_blue_relaxed_hoodie",
        "indigo_denim_relaxed_workshirt",
        "oatmeal_fine_gauge_crewneck",
    }
    if stale.intersection(catalog["top"]):
        raise ValueError("stale redesign-only tops leaked into the live catalog")
    if not set(PREMIUM_REPLACEMENT_TOPS).issubset(catalog["top"]):
        raise ValueError("live replacement tops are missing")
    if set(catalog["hair"]) != set(PREMIUM_HAIR_SLUGS):
        raise ValueError("active premium hair set differs from the catalog")
    if set(catalog["accessory"]) != set(ACCESSORY_ROLES):
        raise ValueError("seven-accessory set differs from the catalog")

    manifest_lookup = _manifest_lookup(manifest_path)
    selection = _load_json(selection_path)
    resolved: list[AuthoritativeItem] = []
    for category in ("top", "bottom", "shoes", "hair", "accessory"):
        for slug in catalog[category]:
            relative_layer, family = _relative_candidate_layer(
                slug=slug,
                category=category,
                manifest_lookup=manifest_lookup,
                selection=selection,
            )
            absolute_layer = _validate_layer(
                repository_root,
                relative_layer,
                slug=slug,
            )
            resolved.append(
                AuthoritativeItem(
                    ordinal=len(resolved) + 1,
                    category=category,
                    role=ACCESSORY_ROLES.get(
                        slug,
                        "hair" if category == "hair" else category,
                    ),
                    family=family,
                    slug=slug,
                    shoe_contact_role=(
                        "short_no_contact"
                        if slug in SHORT_NO_CONTACT_SLUGS
                        else "shoe_over_hem"
                        if slug in SHOE_OVER_HEM_SLUGS
                        else "bottom_over_shoe_upper"
                        if category == "bottom"
                        else None
                    ),
                    layer_path=absolute_layer,
                    source_label=relative_layer.as_posix(),
                )
            )
    if (
        len(resolved) != EXPECTED_ITEM_COUNT
        or len({item.slug for item in resolved}) != EXPECTED_ITEM_COUNT
    ):
        raise ValueError(
            "authoritative male product set must contain "
            f"{EXPECTED_ITEM_COUNT} unique items"
        )
    return tuple(resolved)


def _canonical_identity_layers(
    repository_root: Path,
    selection_path: Path,
) -> tuple[Image.Image, ...]:
    selection = _load_json(selection_path)
    canonical = selection.get("canonicalLayers", {})
    if not isinstance(canonical, dict):
        raise ValueError("canonicalLayers must be an object")
    if canonical.get("body") is not None:
        return (
            _selected_canonical_layer(
                repository_root,
                selection_path,
                selection_key="body",
                default_filename="avatar_room_base_male_light_v1.png",
            ),
        )
    return (
        _load_room_layer(
            repository_root,
            "avatar_room_base_male_light_v1.png",
        ),
        _selected_canonical_layer(
            repository_root,
            selection_path,
            selection_key="face",
            default_filename="avatar_room_face_male_warm_friendly_v1.png",
        ),
    )


def compose_authoritative_item(
    repository_root: Path,
    item: AuthoritativeItem,
    selection_path: Path,
) -> Image.Image:
    identity = _canonical_identity_layers(repository_root, selection_path)
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
        layers = (*identity, neutral_bottom, neutral_shoes, selected, hair)
    elif item.category == "bottom":
        if item.shoe_contact_role == "bottom_over_shoe_upper":
            layers = (*identity, neutral_shoes, selected, neutral_top, hair)
        else:
            layers = (*identity, selected, neutral_shoes, neutral_top, hair)
    elif item.category == "shoes":
        layers = (*identity, selected, neutral_bottom, neutral_top, hair)
    elif item.category == "hair":
        layers = (*identity, neutral_bottom, neutral_shoes, neutral_top, selected)
    elif item.category == "accessory" and item.role == "headwear":
        layers = (
            *identity,
            neutral_bottom,
            neutral_shoes,
            neutral_top,
            selected,
            hair,
        )
    elif item.category == "accessory":
        layers = (
            *identity,
            neutral_bottom,
            neutral_shoes,
            neutral_top,
            hair,
            selected,
        )
    else:
        raise ValueError(f"unsupported category: {item.category}")

    outfit = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for layer in layers:
        outfit = Image.alpha_composite(outfit, layer)
    return outfit


def _cell(
    item: AuthoritativeItem,
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
    panel.alpha_composite(
        compose_authoritative_item(
            repository_root,
            item,
            selection_path,
        )
    )
    cell.alpha_composite(panel, ((CELL[0] - CANVAS[0]) // 2, HEADER + 8))
    return cell


def render_review_board_66(
    *,
    repository_root: Path,
    catalog_path: Path,
    manifest_path: Path,
    selection_path: Path,
    output_path: Path,
) -> ReviewBoardResult:
    items = resolve_authoritative_items(
        repository_root=repository_root,
        catalog_path=catalog_path,
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


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def _display_output_path(output_path: Path) -> str:
    resolved_output = output_path.resolve()
    try:
        return str(resolved_output.relative_to(REPO_ROOT.resolve()))
    except ValueError:
        return str(resolved_output)


def main() -> None:
    arguments = _arguments()
    result = render_review_board_66(
        repository_root=REPO_ROOT,
        catalog_path=arguments.catalog,
        manifest_path=arguments.manifest,
        selection_path=arguments.selection,
        output_path=arguments.output,
    )
    print(
        json.dumps(
            {
                "itemCount": result.item_count,
                "columns": result.columns,
                "rows": result.rows,
                "size": list(result.size),
                "output": _display_output_path(result.output_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
