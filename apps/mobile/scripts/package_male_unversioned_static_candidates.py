#!/usr/bin/env python3
"""Version and package the 29 selected male static candidates missing evidence."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[3]
REDESIGN = REPO / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
CANDIDATES = REDESIGN / "candidates"
ROOM = REPO / "apps/mobile/src/features/avatarV2/assets/room"
CANVAS = (256, 384)
VERSION = "v3"
STRONG_ALPHA = 128
SUPPORT_DIAMETER = 5
MIN_COMPONENT_PIXELS = 64


@dataclass(frozen=True)
class Item:
    category: str
    slug: str


ITEMS = (
    Item("top", "cream_basic_tee"),
    Item("top", "powder_blue_crew_tee"),
    Item("top", "sage_basic_tee"),
    Item("top", "dusty_navy_tee"),
    Item("top", "pixel_heart_boxy_tee"),
    Item("top", "mist_blue_oxford_shirt"),
    Item("top", "soft_sage_linen_shirt"),
    Item("top", "tonal_geometric_camp_collar_shirt"),
    Item("top", "abstract_resort_shirt"),
    Item("top", "textured_knit_polo"),
    Item("top", "colorblock_rugby_polo"),
    Item("top", "acid_washed_boxy_sweatshirt"),
    Item("top", "modern_track_luxury_top"),
    Item("top", "dusty_navy_chore_jacket"),
    Item("top", "cocoa_varsity_jacket"),
    Item("top", "asymmetric_utility_overshirt"),
    Item("top", "charcoal_leather_bomber_hybrid"),
    Item("top", "soft_varsity_knit_jacket"),
    Item("bottom", "charcoal_tapered_chinos"),
    Item("bottom", "navy_straight_pants"),
    Item("bottom", "mid_blue_straight_jeans"),
    Item("bottom", "warm_sand_deconstructed_trousers"),
    Item("bottom", "warm_sand_relaxed_pants"),
    Item("bottom", "midnight_relaxed_tailoring_trousers"),
    Item("bottom", "modern_track_luxury_bottom"),
    Item("bottom", "sage_cuffed_shorts"),
    Item("bottom", "relaxed_tailored_shorts"),
    Item("bottom", "refined_utility_cargo_shorts"),
    Item("bottom", "technical_sport_shorts"),
)

SOURCE_SHA256 = {
    Item("top", "cream_basic_tee"): "92d372c4045c8f8c0552dc612d1af6a90b09a7ea23b9e0fa4040aba9cdd630f0",
    Item("top", "powder_blue_crew_tee"): "60a1b083b36435c0ea7c0073156b245afac9d78d6ce625f0aaf5f84a89691c8f",
    Item("top", "sage_basic_tee"): "eef1568af2853ff299c7aeb6bee6eb90d80a89cedade6eff55c0a531a0b715f4",
    Item("top", "dusty_navy_tee"): "7128c18b3c4881ecac5fd61da8e7b8eca17ceda218831d25f3d57b748c2e44ec",
    Item("top", "pixel_heart_boxy_tee"): "22caf1f2bf43b1a4defcc680fc323271e65ad914883275810de493803ce5c9c3",
    Item("top", "mist_blue_oxford_shirt"): "79425900dac65117232dd453e3516d91644b1543807dd9b77efcc3ad1136c3ce",
    Item("top", "soft_sage_linen_shirt"): "e817ae023166e2d7101f2a5a185f1ffccb7fa123bfe2cf6974bbb0cc25f38ca8",
    Item("top", "tonal_geometric_camp_collar_shirt"): "c0d4ef7cb7c2eeac9e714c6cdbeedd2576486a0dafdb9d335367286ced32972c",
    Item("top", "abstract_resort_shirt"): "7e48d665e70ced155cf7d3a46240d5cbe560e227b3ccfe6160529ea1ed52ba39",
    Item("top", "textured_knit_polo"): "b9e64c29784df3a8ee03a17e8b166cc16d215802d975dae0754ee0d1c3e64bd5",
    Item("top", "colorblock_rugby_polo"): "424abcb5c6deb88638e24e1352dc88ef9a50064ef057c37afec1a643ad890e12",
    Item("top", "acid_washed_boxy_sweatshirt"): "348e10eb0b7edc52515384e7dd06d00097a8f3acff042cf53c484c20c91b0985",
    Item("top", "modern_track_luxury_top"): "05579431531ad7e45dc6ec2f8db9cc14c78f2b693b7d80a4706caad8e2e77f14",
    Item("top", "dusty_navy_chore_jacket"): "0ba219f3e5eb27ac4f9af21e2a3716dc40d8f783ae5d3cb0e1f77cc2ebb2e4ee",
    Item("top", "cocoa_varsity_jacket"): "e40cd4789948a9d0eca30bd41b2bddd297ca6818bba0b70c85cadc47b1b015cf",
    Item("top", "asymmetric_utility_overshirt"): "5be431e218fe597787b0d50e0c366116a52a21464a1f05f2c8daadbd634c31c9",
    Item("top", "charcoal_leather_bomber_hybrid"): "3d37fb5b8473650ae8209b6ae11f5dd7a47e4abb12c1c9b980e88f3fce46ed7f",
    Item("top", "soft_varsity_knit_jacket"): "6ba43d4b9b13ecea2fa0f2e498ac3aa8bd8eb0440080ee6823e6ce94b29a6b46",
    Item("bottom", "charcoal_tapered_chinos"): "58156d8b24a693654b315c139ec96d20b0c52e816436590f494e499ac5eb2308",
    Item("bottom", "navy_straight_pants"): "eca2cedeade256ba806ea05aa53b5fead449cf1b7713c686cff32b9673a4200b",
    Item("bottom", "mid_blue_straight_jeans"): "7db10de80a6a676164a2578bec40c89a3a39e00f2097880c8c1421d4232d4619",
    Item("bottom", "warm_sand_deconstructed_trousers"): "8c4196c1b43a20346e3a4f242dd7490719bc42419932598fe0404b45a84e6ed4",
    Item("bottom", "warm_sand_relaxed_pants"): "cdc874e47314e18e594e1ab449cef612a654d08047bae718e67bf79c084d76c6",
    Item("bottom", "midnight_relaxed_tailoring_trousers"): "2034ee6969210d50c98559147a7a52a0e9d93328eb921529834ad47fe1bcc8dc",
    Item("bottom", "modern_track_luxury_bottom"): "372d0312f904c8929f5751e994c00dc6f15d8acf9a4d7ee6c0647a785a54c819",
    Item("bottom", "sage_cuffed_shorts"): "999e15b68b85105b56f387ec03833c2dfa85928e302e30731db0c26567b351c0",
    Item("bottom", "relaxed_tailored_shorts"): "0dd60a664c9a33a1523957fd5df5a90a9cdd2b6c79c06ce849a99bd9256fae68",
    Item("bottom", "refined_utility_cargo_shorts"): "4aa46345cde5f94bfc8502a96426b1ec8d4e2295dd48ac9b8af8951ee3baf6e8",
    Item("bottom", "technical_sport_shorts"): "39cdaea052c45ba627381cbccd0bcec1a7078bca3ec32061f7f098ad592a571c",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def candidate_root(item: Item) -> Path:
    return CANDIDATES / item.category / item.slug


def static_source(item: Item) -> Path:
    return candidate_root(item) / "rig/static.png"


def composite_source(item: Item) -> Path:
    return candidate_root(item) / "rig/composite.png"


def sanitize_layer(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load_shared_cleanup():
    path = Path(__file__).with_name("produce_male_top_alpha_residue_repairs.py")
    spec = importlib.util.spec_from_file_location(
        "_shared_male_unversioned_static_cleanup",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load shared male alpha cleanup")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_SHARED_CLEANUP = _load_shared_cleanup()


def clean_residue(image: Image.Image) -> Image.Image:
    if image.size != CANVAS or image.mode != "RGBA":
        raise ValueError(f"expected 256x384 RGBA source, received {image.size} {image.mode}")
    pixels = np.asarray(image).copy()
    strong = pixels[..., 3] > STRONG_ALPHA
    support = np.asarray(
        Image.fromarray((strong * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(SUPPORT_DIAMETER)
        )
    ) > 0
    pixels[~support] = 0
    visible = pixels[..., 3] > 0
    for component in _SHARED_CLEANUP.connected_components(visible):
        if len(component) >= MIN_COMPONENT_PIXELS:
            continue
        if any(int(pixels[y, x, 3]) > STRONG_ALPHA for y, x in component):
            continue
        for y, x in component:
            pixels[y, x] = 0
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def _load_room(filename: str) -> Image.Image:
    image = sanitize_layer(Image.open(ROOM / filename).convert("RGBA"))
    if image.size != CANVAS:
        raise ValueError(f"{filename}: expected {CANVAS}, got {image.size}")
    return image


def build_composite(category: str, layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    if category == "bottom":
        for filename in (
            "avatar_room_base_male_light_v1.png",
            "avatar_room_face_male_warm_friendly_v1.png",
            "avatar_room_shoes_male_milk_tea_court_v1.png",
        ):
            result = Image.alpha_composite(result, _load_room(filename))
        result = Image.alpha_composite(result, layer)
        for filename in (
            "avatar_room_top_male_cream_basic_tee_v1.png",
            "avatar_room_hair_front_male_espresso_crop_v1.png",
        ):
            result = Image.alpha_composite(result, _load_room(filename))
        return sanitize_layer(result)

    defaults = (
        "avatar_room_base_male_light_v1.png",
        "avatar_room_face_male_warm_friendly_v1.png",
        "avatar_room_shoes_male_milk_tea_court_v1.png",
        "avatar_room_bottom_male_navy_straight_pants_v1.png",
        "avatar_room_top_male_powder_blue_crew_tee_v1.png",
        "avatar_room_hair_front_male_espresso_crop_v1.png",
    )
    for filename in defaults:
        if category == "top" and filename.endswith("top_male_powder_blue_crew_tee_v1.png"):
            continue
        result = Image.alpha_composite(result, _load_room(filename))
    return sanitize_layer(Image.alpha_composite(result, layer))


def _checkerboard(size: tuple[int, int], cell: int = 14) -> Image.Image:
    image = Image.new("RGBA", size, (255, 253, 254, 255))
    draw = ImageDraw.Draw(image)
    colors = ((255, 253, 254, 255), (226, 222, 226, 255))
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            draw.rectangle(
                (x, y, x + cell - 1, y + cell - 1),
                fill=colors[(x // cell + y // cell) % 2],
            )
    return image


def _render_triptych(
    layer: Image.Image,
    combined: Image.Image,
    crop: tuple[int, int, int, int],
    scale: int,
    labels: tuple[str, str, str],
    destination: Path,
) -> None:
    size = ((crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale)
    isolated = layer.crop(crop).resize(size, Image.Resampling.NEAREST)
    outfit = combined.crop(crop).resize(size, Image.Resampling.NEAREST)
    panels = []
    for background in (
        _checkerboard(size),
        Image.new("RGBA", size, (0, 0, 0, 255)),
    ):
        background.alpha_composite(isolated)
        panels.append(background)
    canonical = _checkerboard(size)
    canonical.alpha_composite(outfit)
    panels.append(canonical)
    header = 42
    board = Image.new("RGBA", (size[0] * 3, size[1] + header), (255, 248, 251, 255))
    draw = ImageDraw.Draw(board)
    for index, (label, panel) in enumerate(zip(labels, panels)):
        x = index * size[0]
        draw.text((x + 12, 14), label, fill=(69, 43, 57, 255))
        board.paste(panel, (x, header))
    board.save(destination)


def _relative(path: Path) -> str:
    if path.is_absolute():
        return path.relative_to(REPO).as_posix()
    return path.as_posix()


def build_manifest(item: Item, outputs: dict[Path, str]) -> dict:
    return {
        "schemaVersion": 1,
        "itemId": item.slug,
        "category": item.category,
        "status": "static_candidate_awaiting_independent_review",
        "candidateOnly": True,
        "runtimePromoted": False,
        "method": "strong-alpha-locked-residue-cleanup-and-versioning",
        "forbiddenTransform": "no reshape, warp, crop, blur, or runtime overwrite",
        "inputs": {
            _relative(static_source(item)): SOURCE_SHA256[item],
            _relative(composite_source(item)): _sha256(composite_source(item)),
        },
        "outputs": {_relative(path): checksum for path, checksum in outputs.items()},
        "independentReview": "PENDING",
        "explicitUserApproval": False,
        "approvalVerdict": "PENDING",
    }


def produce_item(item: Item) -> None:
    source = static_source(item)
    if _sha256(source) != SOURCE_SHA256[item]:
        raise ValueError(f"{item.slug}: reviewed source checksum drift")
    source_image = Image.open(source).convert("RGBA")
    layer = clean_residue(source_image)
    combined = build_composite(item.category, layer)
    selected = sanitize_layer(Image.open(composite_source(item)).convert("RGBA"))
    strong = np.asarray(source_image.getchannel("A")) > STRONG_ALPHA
    if not np.array_equal(np.asarray(combined)[strong], np.asarray(selected)[strong]):
        raise ValueError(f"{item.slug}: strong garment pixels drift from selected outfit")

    root = candidate_root(item)
    rig = root / "rig"
    review = root / f"static-review-baseline-{VERSION}"
    review.mkdir(parents=True, exist_ok=True)
    static_output = rig / f"static-review-baseline-{VERSION}.png"
    composite_output = rig / f"composite-review-baseline-{VERSION}.png"
    proof_output = review / f"{item.slug}-baseline-{VERSION}-proof.png"
    contact_a = review / f"{item.slug}-baseline-{VERSION}-contact-a.png"
    contact_b = review / f"{item.slug}-baseline-{VERSION}-contact-b.png"
    manifest_output = review / f"{item.slug}-baseline-{VERSION}-manifest.json"
    layer.save(static_output)
    combined.save(composite_output)

    if item.category == "top":
        proof_crop = (64, 190, 192, 312)
        first_crop = (78, 194, 178, 252)
        second_crop = (80, 246, 176, 308)
        first_labels = ("NECK / CHECKER", "NECK / BLACK", "NECK / COMBINATION")
        second_labels = ("WAIST / CHECKER", "WAIST / BLACK", "WAIST / COMBINATION")
    else:
        proof_crop = (78, 255, 178, 352)
        first_crop = (88, 258, 168, 298)
        second_crop = (86, 316, 170, 352)
        first_labels = ("WAIST / CHECKER", "WAIST / BLACK", "WAIST / COMBINATION")
        second_labels = ("HEM / CHECKER", "HEM / BLACK", "HEM / COMBINATION")

    _render_triptych(
        layer,
        combined,
        proof_crop,
        4,
        ("LAYER / CHECKER", "LAYER / BLACK", "CANONICAL COMBINATION"),
        proof_output,
    )
    _render_triptych(layer, combined, first_crop, 6, first_labels, contact_a)
    _render_triptych(layer, combined, second_crop, 6, second_labels, contact_b)
    output_paths = (static_output, composite_output, proof_output, contact_a, contact_b)
    manifest = build_manifest(
        item,
        {path: _sha256(path) for path in output_paths},
    )
    manifest_output.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    for item in ITEMS:
        produce_item(item)
    print(f"Packaged {len(ITEMS)} versioned static candidates.")


if __name__ == "__main__":
    main()
