#!/usr/bin/env python3
"""Maintain male room wardrobe fit contracts.

Top layers retain their construction-aware fitting flow. The old lower-body
normalizer is kept solely to reproduce and inspect legacy runtime artwork; it
is not an asset-production path. New male bottoms must be re-illustrated as
full 256×384 masters on the canonical rig and pass an item-level construction
contract before a static candidate can be rendered.
"""

from __future__ import annotations

import argparse
import io
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ROOM = ROOT / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
BASE = ROOM / "avatar_room_base_male_light_v1.png"
BASE_ALPHA = Image.open(BASE).convert("RGBA").getchannel("A")
REFERENCE_SHOES = ROOM / "avatar_room_shoes_male_milk_tea_court_v1.png"
WALKING_BASE_F01 = ROOM / "motion/room_avatar_base_male_light_v1_walking_front_f01.png"
CHROMA_KEY_COLORS = ((0, 255, 0), (0, 255, 255), (255, 0, 255), (255, 255, 0), (255, 0, 0), (0, 0, 255))

@dataclass(frozen=True)
class NecklineGeometry:
    """Canonical front-view neckline geometry for one garment construction.

    Points live on the 256×384 rig after fitting.  They describe the skin
    opening, not a destructive crop rectangle, so each construction can keep
    its own collar/placket/hood silhouette.
    """

    strategy: str
    opening_points: tuple[tuple[int, int], ...] = ()
    rear_occlusion_points: tuple[tuple[int, int], ...] = ()

    @staticmethod
    def _area(points: tuple[tuple[int, int], ...]) -> int:
        if len(points) < 3:
            return 0
        area = 0
        for first, second in zip(points, points[1:] + points[:1]):
            area += first[0] * second[1] - second[0] * first[1]
        return abs(area) // 2

    @property
    def opening_area(self) -> int:
        return self._area(self.opening_points)

    @property
    def rear_occlusion_area(self) -> int:
        return self._area(self.rear_occlusion_points)


@dataclass(frozen=True)
class TopFitProfile:
    """Item-level fit contract; no top falls back to a global neckline mask."""

    family: str
    box: tuple[int, int, int, int]
    neckline: NecklineGeometry


@dataclass(frozen=True)
class BottomFitProfile:
    """Legacy lower-body normalizer contract; never a new-art production spec."""

    kind: str
    box: tuple[int, int, int, int]
    expose_shoe_vamp: bool


@dataclass(frozen=True)
class ShoeFitProfile:
    """Item-level front-view footwear scale and sole anchor."""

    box: tuple[int, int, int, int]


@dataclass(frozen=True)
class BottomConstructionProfile:
    """Direct-master construction contract for one worn male bottom.

    These coordinates describe the actual garment construction on the male
    rig—not a rectangle to stretch a source image into. A generated master
    must already contain the waist, crotch, left leg, right leg and hem in
    these regions before it is eligible for static-fit review.
    """

    family: str
    waist_y: int
    crotch_y: int
    left_leg: tuple[int, int]
    right_leg: tuple[int, int]
    hem_y: int
    requires_direct_master: bool = True


# The catalog has different collar constructions.  Keep the method catalogue
# explicit so a future hoodie/polo cannot silently inherit a shirt crop.
HOODIE_STRATEGIES = (
    "pullover_hood",
    "zip_hood",
    "cropped_hood",
    "funnel_sweatshirt",
)
POLO_STRATEGIES = (
    "classic_polo",
    "rugby_polo",
    "textured_knit_polo",
    "camp_polo",
    "zip_polo",
)


def _neckline(
    strategy: str,
    points: tuple[tuple[int, int], ...] = (),
    rear_points: tuple[tuple[int, int], ...] = (),
) -> NecklineGeometry:
    return NecklineGeometry(strategy=strategy, opening_points=points, rear_occlusion_points=rear_points)


_OPEN_SHIRT = _neckline(
    "open_camp_collar",
    ((121, 219), (135, 219), (139, 223), (134, 229), (128, 235), (122, 229), (117, 223)),
    ((119, 214), (137, 214), (140, 219), (136, 221), (120, 221), (116, 219)),
)
_BUTTON_SHIRT = _neckline(
    "button_spread_collar",
    ((122, 220), (134, 220), (138, 224), (134, 229), (128, 234), (122, 229), (118, 224)),
    ((120, 215), (136, 215), (139, 220), (136, 222), (120, 222), (117, 220)),
)
_JACKET_LAPEL = _neckline(
    "lapel_over_base_neck",
    ((120, 218), (136, 218), (141, 223), (135, 231), (128, 238), (121, 231), (115, 223)),
    ((117, 214), (139, 214), (143, 220), (139, 223), (117, 223), (113, 220)),
)
# Portals follow the canonical base neck: narrow at the top, gently widening
# into the body.  They remove only the rear plane inside a collar, never the
# visible front collar shoulders.
_CREW_NECK_PORTAL = ((121, 215), (135, 215), (137, 219), (136, 224), (132, 226), (124, 226), (120, 224), (119, 219))
_HIGH_NECK_PORTAL = ((123, 215), (133, 215), (135, 218), (134, 222), (131, 224), (125, 224), (122, 222), (121, 218))
_DEEP_RING_PORTAL = ((120, 215), (136, 215), (138, 219), (138, 224), (134, 229), (122, 229), (118, 224), (118, 219))
_POLO_RING_PORTAL = ((120, 215), (136, 215), (138, 219), (138, 224), (134, 228), (122, 228), (118, 224), (118, 219))
_MOTO_NECK_PORTAL = ((121, 215), (135, 215), (137, 218), (137, 222), (133, 226), (123, 226), (119, 222), (119, 218))
_COCOA_VARSITY_PORTAL = ((121, 215), (135, 215), (137, 218), (137, 221), (133, 225), (123, 225), (119, 221), (119, 218))
_PANEL_BOMBER_PORTAL = ((120, 215), (136, 215), (138, 219), (137, 223), (133, 227), (123, 227), (119, 223), (118, 219))
_KNIT_VARSITY_PORTAL = ((121, 215), (135, 215), (137, 219), (136, 224), (132, 228), (124, 228), (120, 224), (119, 219))
_RUGBY_POLO_PORTAL = ((120, 215), (136, 215), (138, 219), (137, 223), (133, 226), (123, 226), (119, 223), (118, 219))
_KNIT_POLO_PORTAL = ((121, 215), (135, 215), (137, 219), (136, 223), (132, 227), (124, 227), (120, 223), (119, 219))
_CARDIGAN_PORTAL = ((121, 215), (135, 215), (137, 218), (137, 222), (132, 226), (124, 226), (119, 222), (119, 218))
_HOODIE_CLOSED = _neckline("pullover_hood", rear_points=_CREW_NECK_PORTAL)
_POLO_OPEN = _neckline(
    "classic_polo",
    ((124, 220), (132, 220), (134, 224), (128, 228), (122, 224)),
    ((122, 216), (134, 216), (136, 220), (120, 220)),
)
_CLOSED_CREW = _neckline("closed_crew", rear_points=_CREW_NECK_PORTAL)
_MOCK_NECK = _neckline("zip_mock_neck", rear_points=_HIGH_NECK_PORTAL)
_CLOSED_JACKET = _neckline("closed_jacket", rear_points=_CREW_NECK_PORTAL)
_BOMBER_RIB = _neckline("bomber_rib_collar", rear_points=_HIGH_NECK_PORTAL)
_VARSITY_RING = _neckline("varsity_ring_collar", rear_points=_DEEP_RING_PORTAL)
_MOTO_RING = _neckline("moto_ring_collar", rear_points=_DEEP_RING_PORTAL)
_CHORE_COLLARED = _neckline(
    "chore_collared",
    _BUTTON_SHIRT.opening_points,
    _BUTTON_SHIRT.rear_occlusion_points,
)
_CARDIGAN_FRONT = _neckline(
    "cardigan_front",
    ((122, 220), (134, 220), (138, 224), (128, 233), (118, 224)),
    _CARDIGAN_PORTAL,
)

HOODIE_NECKLINES = {
    "pullover_hood": _HOODIE_CLOSED,
    "zip_hood": _neckline("zip_hood", rear_points=_HIGH_NECK_PORTAL),
    "cropped_hood": _neckline("cropped_hood", ((120, 220), (136, 220), (140, 225), (128, 232), (116, 225)), ((117, 215), (139, 215), (143, 221), (113, 221))),
    "funnel_sweatshirt": _neckline("funnel_sweatshirt", rear_points=_HIGH_NECK_PORTAL),
}
POLO_NECKLINES = {
    "classic_polo": _POLO_OPEN,
    "rugby_polo": _neckline("rugby_polo", ((122, 220), (134, 220), (137, 224), (128, 230), (119, 224)), _RUGBY_POLO_PORTAL),
    "textured_knit_polo": _neckline("textured_knit_polo", ((123, 220), (133, 220), (136, 224), (128, 230), (120, 224)), _KNIT_POLO_PORTAL),
    "camp_polo": _neckline("camp_polo", ((121, 219), (135, 219), (139, 224), (128, 234), (117, 224)), ((118, 214), (138, 214), (142, 220), (114, 220))),
    "zip_polo": _neckline("zip_polo", ((124, 220), (132, 220), (134, 224), (128, 228), (122, 224)), ((122, 216), (134, 216), (136, 220), (120, 220))),
}
SHIRT_NECKLINES = {
    "open_camp_collar": _OPEN_SHIRT,
    "button_spread_collar": _BUTTON_SHIRT,
    "resort_open_collar": _neckline("resort_open_collar", ((120, 219), (136, 219), (141, 224), (128, 235), (115, 224)), ((117, 214), (139, 214), (143, 220), (113, 220))),
}
TSHIRT_NECKLINES = {
    "closed_crew": _CLOSED_CREW,
    "closed_boxy_crew": _neckline("closed_boxy_crew", rear_points=_CREW_NECK_PORTAL),
}
JACKET_NECKLINES = {
    "lapel_over_base_neck": _JACKET_LAPEL,
    "bomber_rib_collar": _BOMBER_RIB,
    "chore_collared": _CHORE_COLLARED,
    "zip_mock_neck": _MOCK_NECK,
    "cardigan_front": _CARDIGAN_FRONT,
    "closed_jacket": _CLOSED_JACKET,
    "varsity_ring_collar": _VARSITY_RING,
    "moto_ring_collar": _MOTO_RING,
}
STRATEGIES_BY_FAMILY = {
    "shirt": SHIRT_NECKLINES,
    "tshirt": TSHIRT_NECKLINES,
    "jacket": JACKET_NECKLINES,
    "hoodie": HOODIE_NECKLINES,
    "polo": POLO_NECKLINES,
}


def _profiles() -> Mapping[str, TopFitProfile]:
    """Return the explicit item registry used by static and motion masters."""

    profiles: dict[str, TopFitProfile] = {}

    def add(names: tuple[str, ...], family: str, neckline: NecklineGeometry, box: tuple[int, int, int, int] = (82, 214, 174, 296)) -> None:
        for name in names:
            profiles[name] = TopFitProfile(family=family, box=box, neckline=neckline)

    add(("abstract_resort_shirt", "tonal_geometric_camp_collar_shirt"), "shirt", _OPEN_SHIRT)
    add(("contemporary_resort_street_top",), "shirt", _OPEN_SHIRT, (82, 214, 174, 300))
    add(("mist_blue_oxford_shirt", "soft_sage_linen_shirt"), "shirt", _BUTTON_SHIRT)

    add(("cream_basic_tee", "dusty_navy_tee", "powder_blue_crew_tee", "sage_basic_tee"), "tshirt", _CLOSED_CREW, (88, 216, 168, 294))
    add(("pixel_heart_boxy_tee",), "tshirt", _CLOSED_CREW, (82, 214, 174, 300))

    add(("cropped_cocoa_moto_jacket",), "jacket", _neckline("moto_ring_collar", rear_points=_MOTO_NECK_PORTAL), (84, 216, 172, 300))
    add(("soft_panel_overshirt_bomber",), "jacket", _neckline("varsity_ring_collar", rear_points=_PANEL_BOMBER_PORTAL), (82, 214, 174, 300))
    add(("soft_varsity_knit_jacket",), "jacket", _neckline("varsity_ring_collar", rear_points=_KNIT_VARSITY_PORTAL), (82, 214, 174, 300))
    add(("striped_chunky_cardigan",), "jacket", _CARDIGAN_FRONT, (82, 214, 174, 300))
    add(("asymmetric_utility_overshirt", "monochrome_street_tailoring_top"), "jacket", _CLOSED_JACKET)
    add(("charcoal_leather_bomber_hybrid",), "jacket", _BOMBER_RIB)
    add(("cocoa_varsity_jacket",), "jacket", _neckline("varsity_ring_collar", rear_points=_COCOA_VARSITY_PORTAL))
    add(("modern_track_luxury_top",), "jacket", _MOCK_NECK)
    add(("dusty_navy_chore_jacket", "creative_utility_top"), "jacket", _CHORE_COLLARED)
    add(("midnight_relaxed_tailoring_jacket", "warm_sand_deconstructed_jacket"), "jacket", _JACKET_LAPEL)
    add(("diagonal_seam_zip_mock_neck",), "jacket", _MOCK_NECK)

    add(("acid_washed_boxy_sweatshirt",), "hoodie", _HOODIE_CLOSED, (82, 214, 174, 300))
    add(("colorblock_rugby_polo",), "polo", POLO_NECKLINES["rugby_polo"], (82, 214, 174, 300))
    add(("textured_knit_polo",), "polo", POLO_NECKLINES["textured_knit_polo"], (82, 214, 174, 296))
    return profiles


TOP_FIT_PROFILES = dict(_profiles())

PREMIUM_CANDIDATE_ROOT = ROOT / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/candidate-layers/static"
YOUNG_DROP_CANDIDATE_ROOT = ROOT / "docs/avatar-motion-pipeline/male-young-drop/2026-07-18/candidate-layers/static"
HEAD_SOURCE_BOTTOMS = {
    "charcoal_tapered_chinos",
    "mid_blue_straight_jeans",
    "navy_straight_pants",
    "sage_cuffed_shorts",
    "warm_sand_relaxed_pants",
}

def _bottom_profiles() -> Mapping[str, BottomFitProfile]:
    profiles: dict[str, BottomFitProfile] = {}

    def add(names: tuple[str, ...], kind: str, box: tuple[int, int, int, int]) -> None:
        for name in names:
            profiles[name] = BottomFitProfile(kind=kind, box=box, expose_shoe_vamp=not kind.endswith("shorts"))

    add(("charcoal_tapered_chinos", "mid_blue_straight_jeans", "midnight_relaxed_tailoring_trousers", "modern_track_luxury_bottom", "navy_straight_pants", "straight_utility_tailored_trousers", "warm_sand_deconstructed_trousers"), "trousers", (97, 286, 159, 326))
    add(("colorblock_nylon_track_pants",), "trousers", (96, 286, 160, 326))
    add(("contemporary_resort_street_bottom", "creative_utility_bottom", "warm_sand_relaxed_pants", "washed_baggy_denim", "wide_pleated_technical_trousers"), "trousers", (96, 286, 160, 326))
    add(("monochrome_street_tailoring_bottom",), "trousers", (97, 286, 159, 326))
    add(("soft_parachute_cargo_pants",), "trousers", (96, 286, 160, 326))
    add(("refined_utility_cargo_shorts", "relaxed_tailored_shorts", "sage_cuffed_shorts", "technical_sport_shorts"), "shorts", (97, 286, 159, 318))
    return profiles


BOTTOM_FIT_PROFILES = dict(_bottom_profiles())
# Compatibility view for older producer imports; the profile registry remains
# the sole authored source of truth.
BOTTOM_BOXES = {name: profile.box for name, profile in BOTTOM_FIT_PROFILES.items()}


def _bottom_construction_profiles() -> Mapping[str, BottomConstructionProfile]:
    """Describe every worn lower garment before any art is admitted.

    The distinct family labels are intentional. A tailored trouser, denim,
    nylon track pant, utility trouser, resort trouser and short do not share a
    generic source-resize or crotch-sealing recipe.
    """

    profiles: dict[str, BottomConstructionProfile] = {}

    def add(
        names: tuple[str, ...],
        family: str,
        waist_y: int,
        crotch_y: int,
        left_leg: tuple[int, int],
        right_leg: tuple[int, int],
        hem_y: int,
    ) -> None:
        for name in names:
            profiles[name] = BottomConstructionProfile(
                family=family,
                waist_y=waist_y,
                crotch_y=crotch_y,
                left_leg=left_leg,
                right_leg=right_leg,
                hem_y=hem_y,
            )

    add(
        ("charcoal_tapered_chinos", "midnight_relaxed_tailoring_trousers", "monochrome_street_tailoring_bottom", "navy_straight_pants"),
        "tailored_trouser",
        260,
        294,
        (97, 127),
        (129, 159),
        326,
    )
    add(("mid_blue_straight_jeans", "washed_baggy_denim"), "denim", 260, 294, (96, 127), (129, 160), 326)
    add(("colorblock_nylon_track_pants", "modern_track_luxury_bottom"), "track_trouser", 261, 295, (96, 127), (129, 160), 326)
    add(
        (
            "creative_utility_bottom",
            "soft_parachute_cargo_pants",
            "straight_utility_tailored_trousers",
            "warm_sand_deconstructed_trousers",
            "warm_sand_relaxed_pants",
            "wide_pleated_technical_trousers",
        ),
        "utility_trouser",
        260,
        294,
        (96, 127),
        (129, 160),
        326,
    )
    add(("contemporary_resort_street_bottom",), "resort_trouser", 261, 294, (96, 127), (129, 160), 326)
    add(
        ("refined_utility_cargo_shorts", "relaxed_tailored_shorts", "sage_cuffed_shorts", "technical_sport_shorts"),
        "short",
        286,
        303,
        (97, 127),
        (129, 159),
        318,
    )
    return profiles


BOTTOM_CONSTRUCTION_PROFILES = dict(_bottom_construction_profiles())
BOTTOM_REILLUSTRATED_MASTER_ROOT = ROOT / "docs/avatar-motion-pipeline/male-wardrobe-fit-qa/2026-07-26/reillustrated-masters"

SHOE_FIT_PROFILES = {
    "chunky_skate_sneakers": ShoeFitProfile((101, 323, 155, 350)),
    "cloud_white_trainers": ShoeFitProfile((105, 326, 151, 348)),
    "cocoa_penny_loafers": ShoeFitProfile((104, 326, 152, 349)),
    "dusty_blue_canvas_sneakers": ShoeFitProfile((104, 325, 152, 349)),
    "lightweight_trail_sneakers": ShoeFitProfile((100, 323, 156, 350)),
    "milk_tea_court": ShoeFitProfile((105, 326, 151, 348)),
    "retro_colorblock_runner": ShoeFitProfile((100, 323, 156, 350)),
    "suede_penny_mules": ShoeFitProfile((103, 326, 153, 349)),
}


def slug(path: Path, category: str) -> str:
    return path.stem.removeprefix(f"avatar_room_{category}_male_").removesuffix("_v1")


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("asset has no visible alpha")
    return bbox


def crop_to_alpha(image: Image.Image) -> Image.Image:
    left, top, right, bottom = alpha_bounds(image)
    return image.crop((left, top, right, bottom))


def fit_to_box(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    fitted = crop_to_alpha(source).resize((right - left, bottom - top), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(fitted, (left, top))
    return result


def build_neckline_mask(size: tuple[int, int], geometry: NecklineGeometry) -> Image.Image:
    """Rasterize a smooth construction-specific neck mask.

    Supersampling prevents the torn stair-step edges produced by drawing the
    collar cut directly on the 256×384 pixel-art canvas.
    """

    scale = 4
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    if geometry.rear_occlusion_points:
        draw.polygon(tuple((x * scale, y * scale) for x, y in geometry.rear_occlusion_points), fill=255)
    if geometry.opening_points:
        draw.polygon(tuple((x * scale, y * scale) for x, y in geometry.opening_points), fill=255)
    return mask.resize(size, Image.Resampling.LANCZOS)


def apply_top_fit_profile(source: Image.Image, profile: TopFitProfile) -> Image.Image:
    """Apply a construction-aware neckline without mutating the source layer."""

    result = source.convert("RGBA").copy()
    geometry_mask = build_neckline_mask(result.size, profile.neckline)
    if result.size == CANVAS:
        geometry_mask = ImageChops.multiply(geometry_mask, BASE_ALPHA)
    if geometry_mask.getbbox() is None:
        return result
    alpha = result.getchannel("A")
    result.putalpha(ImageChops.subtract(alpha, geometry_mask))
    return result


def source_path_for(path: Path) -> Path | None:
    """Resolve a clean artwork source instead of refitting a dirty output."""

    if "_bottom_male_" in path.name:
        category = "bottom"
    elif "_shoes_male_" in path.name:
        category = "shoes"
    else:
        category = "top"
    name = slug(path, category)
    is_bottom = category == "bottom"
    if is_bottom:
        if name in HEAD_SOURCE_BOTTOMS:
            return None
    for root in (PREMIUM_CANDIDATE_ROOT, YOUNG_DROP_CANDIDATE_ROOT):
        candidate = root / f"{name}.png"
        if candidate.exists():
            return candidate
    if category == "shoes":
        # Tracked starter shoes are recovered from HEAD by load_source; never
        # resize an already fitted runtime destination a second time.
        return None
    return path


def load_source(path: Path) -> Image.Image:
    source_path = source_path_for(path)
    if source_path is not None:
        return Image.open(source_path).convert("RGBA")
    relative = path.relative_to(ROOT).as_posix()
    raw = subprocess.check_output(["git", "show", f"HEAD:{relative}"])
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha <= 64 and any(max(abs(red - key_red), abs(green - key_green), abs(blue - key_blue)) <= 24 for key_red, key_green, key_blue in CHROMA_KEY_COLORS):
                # Low-alpha exact/near key colors are matte-fringe residue,
                # never intentional garment detail. Neutralize before export.
                pixels[x, y] = (0, 0, 0, alpha)
            elif green > red + 12 and green > blue + 12:
                pixels[x, y] = (red, min(green, max(red, blue) + 6), blue, alpha)
    return image


def project_generated_bottom_to_rig(name: str, source: Image.Image) -> Image.Image:
    """Uniformly project generated art onto the rig without aspect warping.

    Source artwork is generated against the full 2:3 layout, then extracted.
    This projection uses one scale factor for both axes and anchors the hem;
    it never stretches a conventional trouser into a shallow rectangle.
    """

    profile = BOTTOM_CONSTRUCTION_PROFILES.get(name)
    if profile is None:
        raise ValueError(f"missing direct-master construction contract: {name}")
    artwork = crop_to_alpha(source.convert("RGBA"))
    target_width = profile.right_leg[1] - profile.left_leg[0]
    scale = target_width / artwork.width
    target_height = max(1, round(artwork.height * scale))
    fitted = artwork.resize((target_width, target_height), Image.Resampling.LANCZOS)
    left = (CANVAS[0] - target_width) // 2
    top = profile.hem_y - target_height
    if top < 0:
        raise ValueError(f"{name}: uniformly projected master exceeds the canonical canvas")
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(fitted, (left, top))
    if profile.family != "short":
        pixels = result.load()
        for y in range(profile.hem_y - 8, profile.hem_y):
            pixels[127, y] = (0, 0, 0, 0)
            pixels[128, y] = (0, 0, 0, 0)
    return clean_transparent_rgb(result)


def reillustrated_bottom_master_path(name: str) -> Path:
    """Return the only admissible master location for a new male bottom."""

    if name not in BOTTOM_CONSTRUCTION_PROFILES:
        raise ValueError(f"missing direct-master construction contract: {name}")
    return BOTTOM_REILLUSTRATED_MASTER_ROOT / f"{name}.png"


def load_reillustrated_bottom_master(name: str) -> Image.Image:
    """Load a purpose-drawn full-rig master; never fall back to a resized crop."""

    path = reillustrated_bottom_master_path(name)
    if not path.exists():
        raise FileNotFoundError(
            f"{name} requires a direct reillustrated 256x384 master at {path}; "
            "legacy source resizing is intentionally disabled for new bottom candidates"
        )
    return Image.open(path).convert("RGBA")


def _has_opaque_pixel(image: Image.Image, x_range: range, y: int) -> bool:
    return any(image.getpixel((x, y))[3] > 16 for x in x_range)


def build_bottom_candidate_from_master(name: str, master: Image.Image) -> Image.Image:
    """Validate and return directly constructed bottom art without resizing it.

    The old generic ``fit_to_box`` path compressed a whole garment into a
    lower-body rectangle. This function deliberately accepts only a complete
    canonical-canvas master that already reads as a garment on the base rig.
    """

    profile = BOTTOM_CONSTRUCTION_PROFILES.get(name)
    if profile is None:
        raise ValueError(f"missing direct-master construction contract: {name}")
    if master.size != CANVAS:
        raise ValueError(f"{name}: direct master must be {CANVAS}, got {master.size}")
    candidate = clean_transparent_rgb(master.convert("RGBA").copy())
    left, top, right, bottom = alpha_bounds(candidate)
    if left < profile.left_leg[0] - 2 or right > profile.right_leg[1] + 2:
        raise ValueError(f"{name}: master exceeds its canonical male leg envelope")
    if top < profile.waist_y - 8:
        raise ValueError(f"{name}: master extends above the waist construction envelope")
    if top > profile.waist_y + 2:
        raise ValueError(f"{name}: master does not reach the waist construction line")
    if bottom < profile.hem_y - 1:
        raise ValueError(f"{name}: master ends above the required hem line")
    for y in (profile.crotch_y + 2, profile.hem_y - 3):
        if not _has_opaque_pixel(candidate, range(*profile.left_leg), y):
            raise ValueError(f"{name}: left leg is not constructed at y={y}")
        if not _has_opaque_pixel(candidate, range(*profile.right_leg), y):
            raise ValueError(f"{name}: right leg is not constructed at y={y}")
    if profile.family != "short":
        for y in range(profile.hem_y - 8, profile.hem_y - 1):
            if candidate.getpixel((127, y))[3] > 16 or candidate.getpixel((128, y))[3] > 16:
                raise ValueError(f"{name}: inner hem has no canonical two-leg separation")
            if candidate.getpixel((126, y))[3] <= 16 or candidate.getpixel((129, y))[3] <= 16:
                raise ValueError(f"{name}: inner hem separation is wider than the canonical two pixels")
    return candidate


def seal_crotch(image: Image.Image, shorts: bool, end_y: int) -> Image.Image:
    """Close accidental mid-seam gaps while retaining a narrow leg split."""

    pixels = image.load()
    # Long trousers need a closed front plane so the transparent body slit
    # cannot read as a pasted layer or a missing garment panel. Shorts keep a
    # single-pixel leg split for readability.
    seam_gap = 1 if shorts else 0
    for y in range(294, min(end_y, CANVAS[1])):
        # Ignore stray antialiased pixels in the middle of a split leg. Use
        # the outer edge of each trouser leg as the seam anchors, then close
        # every accidental hole between them.
        left = max((x for x in range(96, 127) if pixels[x, y][3] >= 16), default=None)
        right = min((x for x in range(130, 161) if pixels[x, y][3] >= 16), default=None)
        if left is None or right is None or right - left <= seam_gap + 1:
            continue
        gap_start = left + 1
        gap_end = right
        center = (gap_start + gap_end - 1) // 2
        for x in range(gap_start, gap_end):
            if seam_gap and abs(x - center) <= seam_gap // 2:
                continue
            sample_x = left if x < center else right
            red, green, blue, _ = pixels[sample_x, y]
            pixels[x, y] = (red, green, blue, 255)
        if not shorts:
            # Close sub-threshold anti-aliased pinholes that sit just outside
            # the measured seam anchors. They otherwise read as a black body
            # slit in a front composite even though the garment is meant to be
            # a single opaque trouser plane.
            for x in range(120, 137):
                if pixels[x, y][3] >= 16:
                    continue
                sample_x = left if abs(x - left) <= abs(x - right) else right
                red, green, blue, _ = pixels[sample_x, y]
                pixels[x, y] = (red, green, blue, 255)
    if shorts:
        # Keep the front waist hinge connected on the two sides of the
        # intended one-pixel centre split. A low-alpha source fringe here
        # reads as a torn seam once shoes are composited underneath.
        for x in range(104, 152):
            if x == 128 or pixels[x, 318][3] > 10:
                continue
            for distance in range(1, 16):
                for candidate_x in (x - distance, x + distance):
                    if 0 <= candidate_x < CANVAS[0] and pixels[candidate_x, 318][3] > 10:
                        red, green, blue, _ = pixels[candidate_x, 318]
                        pixels[x, 318] = (red, green, blue, 255)
                        break
                if pixels[x, 318][3] > 10:
                    break
    return image


def restore_canonical_inner_leg_gap(image: Image.Image, end_y: int) -> Image.Image:
    """Reveal only a short two-pixel foot separation, not a fabric tear."""

    pixels = image.load()
    for y in range(max(0, end_y - 4), min(end_y, CANVAS[1])):
        for x in (127, 128):
            if BASE_ALPHA.getpixel((x, y)) <= 16:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def repair_trouser_contact_zone(image: Image.Image, end_y: int) -> Image.Image:
    """Close the crotch, keep a short foot gap, and remove orphan hem pixels."""

    result = seal_crotch(image.convert("RGBA").copy(), shorts=False, end_y=end_y)
    pixels = result.load()
    for y in range(end_y, CANVAS[1]):
        for x in range(CANVAS[0]):
            pixels[x, y] = (0, 0, 0, 0)
    return restore_canonical_inner_leg_gap(result, end_y)


def expose_shoe_vamp_lane(image: Image.Image, end_y: int) -> Image.Image:
    """Keep the center of the shoe upper visible below a trouser hem."""

    shoes = Image.open(REFERENCE_SHOES).convert("RGBA")
    pixels = image.load()
    shoe_pixels = shoes.load()
    for y in range(max(326, end_y - 4), min(end_y + 1, CANVAS[1])):
        for x in range(120, 137):
            # Only reopen pixels that belong to the shoe upper. Clearing the
            # whole center lane would reveal the walking base's ankle skin in
            # motion composites where the rig has a narrow center bridge.
            if shoe_pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def seal_body_to_shoe_contact(image: Image.Image, end_y: int) -> Image.Image:
    """Close exposed ankle pixels without painting over the shoe vamp."""

    bases = [Image.open(BASE).convert("RGBA")]
    if WALKING_BASE_F01.exists():
        bases.append(Image.open(WALKING_BASE_F01).convert("RGBA"))
    shoes = Image.open(REFERENCE_SHOES).convert("RGBA")
    pixels = image.load()
    base_pixels = [base.load() for base in bases]
    shoe_pixels = shoes.load()
    # Cover the full lower-leg contact band, not only the final hem rows. The
    # source crops can leave narrow base-rig strips beside a tapered leg well
    # above the hem; in a front composite those read as floating skin. Keep
    # the shoe pixels authoritative so the vamp is never painted over.
    for y in range(294, min(end_y + 8, CANVAS[1])):
        for x in range(100, 157):
            if not any(base[x, y][3] > 10 for base in base_pixels) or shoe_pixels[x, y][3] > 10 or pixels[x, y][3] > 10:
                continue
            source = None
            for distance in range(1, 12):
                for candidate_x in (x - distance, x + distance):
                    if 0 <= candidate_x < CANVAS[0] and pixels[candidate_x, y][3] > 10:
                        source = pixels[candidate_x, y]
                        break
                if source is not None:
                    break
            if source is None and y > 0 and pixels[x, y - 1][3] > 10:
                source = pixels[x, y - 1]
            if source is None:
                for radius in range(1, 12):
                    for delta_y in range(-radius, radius + 1):
                        for delta_x in range(-radius, radius + 1):
                            candidate_x, candidate_y = x + delta_x, y + delta_y
                            if (
                                0 <= candidate_x < CANVAS[0]
                                and 0 <= candidate_y < CANVAS[1]
                                and pixels[candidate_x, candidate_y][3] > 10
                            ):
                                source = pixels[candidate_x, candidate_y]
                                break
                        if source is not None:
                            break
                    if source is not None:
                        break
            if source is not None:
                red, green, blue, _ = source
                pixels[x, y] = (red, green, blue, 255)
    return image


def fit_top(path: Path) -> Image.Image:
    name = slug(path, "top")
    profile = TOP_FIT_PROFILES.get(name)
    if profile is None:
        raise ValueError(f"missing item-level male top fit profile: {name}")
    return apply_top_fit_profile(fit_to_box(load_source(path), profile.box), profile)


def fit_bottom_source(name: str, source: Image.Image) -> Image.Image:
    """Fit a clean bottom master through the canonical item pipeline."""

    profile = BOTTOM_FIT_PROFILES.get(name)
    if profile is None:
        raise ValueError(f"missing item-level male bottom fit profile: {name}")
    fitted = seal_crotch(fit_to_box(source, profile.box), profile.kind.endswith("shorts"), profile.box[3])
    if profile.expose_shoe_vamp:
        fitted = expose_shoe_vamp_lane(seal_body_to_shoe_contact(fitted, profile.box[3]), profile.box[3])
    # This must be the final lower-body operation. Contact sealing is allowed
    # to close stray skin beside the trouser legs, but it must not repaint the
    # canonical two-leg separation at the hem.
    if profile.kind == "trousers":
        fitted = repair_trouser_contact_zone(fitted, profile.box[3])
    return fitted


def fit_bottom(path: Path) -> Image.Image:
    name = slug(path, "bottom")
    return fit_bottom_source(name, load_source(path))


def fit_shoe_source(name: str, source: Image.Image) -> Image.Image:
    """Fit a clean shoe master through its item-specific anchor."""

    profile = SHOE_FIT_PROFILES.get(name)
    if profile is None:
        raise ValueError(f"missing item-level male shoe fit profile: {name}")
    return fit_to_box(source, profile.box)


def fit_shoes(path: Path) -> Image.Image:
    name = slug(path, "shoes")
    return fit_shoe_source(name, load_source(path))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write normalized layers in place")
    parser.add_argument("--seal-only", action="store_true", help="only close lower-body seam on already fitted layers")
    parser.add_argument("--clean-only", action="store_true", help="only remove fringe/residue on already fitted layers")
    parser.add_argument("--shoe-lane-only", action="store_true", help="refit existing bottoms to item-level shoe-lane profiles")
    parser.add_argument("--neckline-only", action="store_true", help="remove the rear collar plane from existing tops")
    args = parser.parse_args()
    if not args.write:
        raise SystemExit("refusing to modify assets without --write")

    paths = [
        *sorted(ROOM.glob("avatar_room_top_male_*.png")),
        *sorted(ROOM.glob("avatar_room_bottom_male_*.png")),
        *sorted(ROOM.glob("avatar_room_shoes_male_*.png")),
    ]
    if args.seal_only:
        for path in sorted(ROOM.glob("avatar_room_bottom_male_*.png")):
            name = slug(path, "bottom")
            image = seal_crotch(Image.open(path).convert("RGBA"), "shorts" in name, BOTTOM_BOXES[name][3])
            if "shorts" not in name:
                image = expose_shoe_vamp_lane(seal_body_to_shoe_contact(image, BOTTOM_BOXES[name][3]), BOTTOM_BOXES[name][3])
            clean_transparent_rgb(image).save(path, optimize=True)
            print(path.relative_to(ROOT))
        return
    if args.shoe_lane_only:
        for path in sorted(ROOM.glob("avatar_room_bottom_male_*.png")):
            fitted = fit_bottom(path)
            clean_transparent_rgb(fitted).save(path, optimize=True)
            print(path.relative_to(ROOT))
        return
    if args.neckline_only:
        for path in sorted(ROOM.glob("avatar_room_top_male_*.png")):
            name = slug(path, "top")
            profile = TOP_FIT_PROFILES.get(name)
            if profile is None:
                raise ValueError(f"missing item-level male top fit profile: {name}")
            image = apply_top_fit_profile(Image.open(path).convert("RGBA"), profile)
            clean_transparent_rgb(image).save(path, optimize=True)
            print(path.relative_to(ROOT))
        return
    if args.clean_only:
        for path in paths:
            image = clean_transparent_rgb(Image.open(path).convert("RGBA"))
            image.save(path, optimize=True)
            print(path.relative_to(ROOT))
        return
    for path in paths:
        if path.name.endswith("_sitting_front_f01.png"):
            continue
        if path.name.startswith("avatar_room_top_male_"):
            fitted = fit_top(path)
        elif path.name.startswith("avatar_room_bottom_male_"):
            fitted = fit_bottom(path)
        else:
            fitted = fit_shoes(path)
        clean_transparent_rgb(fitted).save(path, optimize=True)
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
