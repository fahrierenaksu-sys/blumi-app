from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from render_male_wardrobe_54_progress_board import CANVAS
from render_male_wardrobe_66_progress_board import (
    AuthoritativeItem,
    COLUMNS,
    DEFAULT_CATALOG,
    DEFAULT_MANIFEST,
    DEFAULT_SELECTION,
    REPO_ROOT,
    ROWS,
    _display_output_path,
    compose_authoritative_item,
    render_review_board_66,
    resolve_authoritative_items,
)


class RenderMaleWardrobe66ProgressBoardTests(unittest.TestCase):
    def test_display_output_path_accepts_paths_outside_repository(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            outside = Path(temporary_directory) / "board.png"

            self.assertEqual(str(outside.resolve()), _display_output_path(outside))

    def _room_fixture(self, root: Path) -> None:
        room = root / "apps/mobile/src/features/avatarV2/assets/room"
        room.mkdir(parents=True)
        layers = {
            "avatar_room_base_male_light_v1.png": ((1, 1), (11, 12, 13, 255)),
            "avatar_room_face_male_warm_friendly_v1.png": ((2, 2), (21, 22, 23, 255)),
            "avatar_room_hair_front_male_espresso_crop_v1.png": (
                (3, 3),
                (31, 32, 33, 255),
            ),
            "avatar_room_top_male_cream_basic_tee_v1.png": (
                (4, 4),
                (41, 42, 43, 255),
            ),
            "avatar_room_bottom_male_navy_straight_pants_v1.png": (
                (5, 5),
                (51, 52, 53, 255),
            ),
            "avatar_room_shoes_male_milk_tea_court_v1.png": (
                (6, 6),
                (61, 62, 63, 255),
            ),
        }
        for name, (point, color) in layers.items():
            image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            image.putpixel(point, color)
            image.save(room / name)

    @staticmethod
    def _catalog_source(
        tops: list[str],
        bottoms: list[str],
        shoes: list[str],
        hair: list[str],
        accessories: list[str],
    ) -> str:
        values = [
            *(f'"avatar_v2_top_male_{slug}"' for slug in tops),
            *(f'"avatar_v2_bottom_male_{slug}"' for slug in bottoms),
            *(f'"avatar_v2_shoes_male_{slug}"' for slug in shoes),
            *(f'"avatar_v2_hair_male_{slug}"' for slug in hair),
            *(f'"avatar_v2_accessory_male_{slug}"' for slug in accessories),
        ]
        return (
            "export const AVATAR_LOADOUT_CATALOG = freezeCatalog([\n"
            + ",\n".join(values)
            + "\n]);\n"
            + "export const DEFAULT_MALE_AVATAR_LOADOUT = freezeLoadout({\n"
            + '  topId: "avatar_v2_top_male_default_only_mask",\n'
            + "});\n"
        )

    def _fixture(self, root: Path) -> tuple[Path, Path, Path]:
        self._room_fixture(root)
        replacement_tops = [
            "fog_blue_relaxed_hoodie",
            "indigo_denim_relaxed_workshirt",
            "oatmeal_fine_gauge_crewneck",
        ]
        common_tops = [f"top_{index:02d}" for index in range(24)]
        bottoms = [f"bottom_{index:02d}" for index in range(19)]
        shoes = [f"shoes_{index:02d}" for index in range(8)]
        premium_hair = [
            "soft_textured_crop",
            "controlled_modern_mullet",
            "voluminous_wavy_quiff",
            "short_twists_textured_style",
            "copper_compact_quiff",
            "ash_blond_low_fade_crop",
            "blue_black_short_curls",
        ]
        baseline_hair = [
            "espresso_crop",
            "cocoa_textured_quiff",
            "soft_black_side_part",
            "chestnut_short_waves",
        ]
        accessories = [
            "soft_patch_beanie",
            "nylon_crossbody_bag",
            "beaded_charm_necklace",
            "tortoiseshell_smoke_sunglasses",
            "matte_black_panto_sunglasses",
        ]
        catalog = root / "avatarLoadoutCatalog.ts"
        catalog.write_text(
            self._catalog_source(
                [*common_tops, *replacement_tops],
                bottoms,
                shoes,
                [*baseline_hair, *premium_hair],
                accessories,
            ),
            encoding="utf-8",
        )

        manifest_items = []
        for category, slugs in (
            ("top", [*common_tops, "dusty_blue_weekend_crew_sweatshirt", "cocoa_sage_canvas_shacket"]),
            ("bottom", bottoms),
            ("shoes", shoes),
        ):
            for slug in slugs:
                candidate_root = (
                    root
                    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                    / "candidates"
                    / category
                    / slug
                )
                rig = candidate_root / "rig"
                rig.mkdir(parents=True)
                Image.new("RGBA", CANVAS, (0, 0, 0, 0)).save(
                    rig / "static.png"
                )
                manifest_items.append(
                    {
                        "category": category,
                        "slug": slug,
                        "family": f"{category}_family",
                        "candidateRoot": candidate_root.relative_to(root).as_posix(),
                    }
                )
        manifest = root / "asset-manifest.json"
        manifest.write_text(
            json.dumps({"items": manifest_items}),
            encoding="utf-8",
        )
        selection = root / "selection.json"
        selection.write_text(
            json.dumps(
                {
                    "defaultCompositeByCategory": {
                        "top": "rig/composite.png",
                        "bottom": "rig/composite.png",
                        "shoes": "rig/composite.png",
                    },
                    "overrides": {},
                }
            ),
            encoding="utf-8",
        )

        premium = (
            root
            / "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16"
            / "candidate-layers/static"
        )
        young = (
            root
            / "docs/avatar-motion-pipeline/male-young-drop/2026-07-18"
            / "candidate-layers/static"
        )
        premium.mkdir(parents=True)
        young.mkdir(parents=True)
        premium_slugs = [
            *replacement_tops,
            *premium_hair,
            "tortoiseshell_smoke_sunglasses",
            "matte_black_panto_sunglasses",
        ]
        young_slugs = accessories[:3]
        for index, (directory, slug) in enumerate(
            [
                *((premium, slug) for slug in premium_slugs),
                *((young, slug) for slug in young_slugs),
            ]
        ):
            image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            image.putpixel((20 + index, 20), (100 + index, 80, 90, 255))
            image.save(directory / f"{slug}.png")
        return catalog, manifest, selection

    def test_live_catalog_resolves_the_current_66_without_rejected_items(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            resolved = resolve_authoritative_items(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
            )

            self.assertEqual(66, len(resolved))
            self.assertEqual(
                {"top": 27, "bottom": 19, "shoes": 8, "hair": 7, "accessory": 5},
                {
                    category: sum(item.category == category for item in resolved)
                    for category in ("top", "bottom", "shoes", "hair", "accessory")
                },
            )
            slugs = {item.slug for item in resolved}
            self.assertNotIn("cropped_cocoa_moto_jacket", slugs)
            self.assertNotIn("diagonal_seam_zip_mock_neck", slugs)
            self.assertNotIn("dusty_blue_weekend_crew_sweatshirt", slugs)
            self.assertNotIn("cocoa_sage_canvas_shacket", slugs)
            self.assertNotIn("medium_curtain_middle_part", slugs)
            self.assertNotIn("modern_track_luxury_top", slugs)
            self.assertNotIn("slim_oval_glasses", slugs)
            self.assertNotIn("soft_rectangular_glasses", slugs)
            self.assertNotIn("translucent_wrap_glasses", slugs)
            self.assertNotIn("tinted_star_glasses", slugs)
            self.assertEqual(list(range(1, 67)), [item.ordinal for item in resolved])

    def test_headwear_renders_behind_hair_but_eyewear_renders_in_front(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            items = resolve_authoritative_items(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
            )
            headwear = next(item for item in items if item.slug == "soft_patch_beanie")
            eyewear = next(
                item
                for item in items
                if item.slug == "tortoiseshell_smoke_sunglasses"
            )
            for item in (headwear, eyewear):
                layer = Image.open(item.layer_path).convert("RGBA")
                layer.putpixel((3, 3), (200, 10, 20, 255))
                layer.save(item.layer_path)

            headwear_outfit = compose_authoritative_item(
                root,
                headwear,
                selection,
            )
            eyewear_outfit = compose_authoritative_item(
                root,
                eyewear,
                selection,
            )

            self.assertEqual(
                (31, 32, 33, 255),
                headwear_outfit.getpixel((3, 3)),
            )
            self.assertEqual(
                (200, 10, 20, 255),
                eyewear_outfit.getpixel((3, 3)),
            )

    def test_each_bottom_contact_role_controls_the_shoe_occlusion_order(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self._room_fixture(root)
            layer = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/bottom/contact_case/rig/static.png"
            )
            layer.parent.mkdir(parents=True)
            selected = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            selected.putpixel((6, 6), (201, 10, 20, 255))
            selected.save(layer)
            selection = root / "selection.json"
            selection.write_text("{}", encoding="utf-8")

            def item(role: str) -> AuthoritativeItem:
                return AuthoritativeItem(
                    ordinal=1,
                    category="bottom",
                    role="bottom",
                    family="male_straight",
                    slug="contact_case",
                    shoe_contact_role=role,
                    layer_path=layer,
                    source_label="static.png",
                )

            bottom_over = compose_authoritative_item(
                root,
                item("bottom_over_shoe_upper"),
                selection,
            )
            shoe_over = compose_authoritative_item(
                root,
                item("shoe_over_hem"),
                selection,
            )

            self.assertEqual((201, 10, 20, 255), bottom_over.getpixel((6, 6)))
            self.assertEqual((61, 62, 63, 255), shoe_over.getpixel((6, 6)))

    def test_compose_uses_selected_canonical_face_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            face = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/canonical/face/rig/continuous.png"
            )
            face.parent.mkdir(parents=True)
            image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            image.putpixel((2, 2), (211, 122, 33, 255))
            image.save(face)
            data = json.loads(selection.read_text(encoding="utf-8"))
            data["canonicalLayers"] = {
                "face": face.relative_to(root).as_posix(),
            }
            selection.write_text(json.dumps(data), encoding="utf-8")
            item = resolve_authoritative_items(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
            )[0]

            composite = compose_authoritative_item(root, item, selection)

            self.assertEqual((211, 122, 33, 255), composite.getpixel((2, 2)))

    def test_selected_unified_body_replaces_separate_base_and_face_layers(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            body = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/canonical/body/rig/unified.png"
            )
            body.parent.mkdir(parents=True)
            image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            image.putpixel((1, 1), (151, 152, 153, 255))
            image.putpixel((2, 2), (161, 162, 163, 255))
            image.save(body)
            data = json.loads(selection.read_text(encoding="utf-8"))
            data["canonicalLayers"] = {
                "body": body.relative_to(root).as_posix(),
            }
            selection.write_text(json.dumps(data), encoding="utf-8")
            item = resolve_authoritative_items(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
            )[0]

            composite = compose_authoritative_item(root, item, selection)

            self.assertEqual((151, 152, 153, 255), composite.getpixel((1, 1)))
            self.assertEqual((161, 162, 163, 255), composite.getpixel((2, 2)))

    def test_product_layer_override_can_select_a_review_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            candidate = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/top/top_00/rig/neck-v2.png"
            )
            Image.new("RGBA", CANVAS, (90, 80, 70, 255)).save(candidate)
            data = json.loads(selection.read_text(encoding="utf-8"))
            data["productLayers"] = {
                "top_00": candidate.relative_to(root).as_posix(),
            }
            selection.write_text(json.dumps(data), encoding="utf-8")

            items = resolve_authoritative_items(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
            )

            selected = next(item for item in items if item.slug == "top_00")
            self.assertEqual(candidate, selected.layer_path)

    def test_default_loadout_references_cannot_mask_a_catalog_removal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            source = catalog.read_text(encoding="utf-8").replace(
                '"avatar_v2_top_male_top_00",',
                "",
            )
            source = source.replace(
                'topId: "avatar_v2_top_male_default_only_mask"',
                'topId: "avatar_v2_top_male_top_00"',
            )
            catalog.write_text(source, encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "expected 66-item"):
                resolve_authoritative_items(
                    repository_root=root,
                    catalog_path=catalog,
                    manifest_path=manifest,
                    selection_path=selection,
                )

    def test_rejects_a_candidate_symlink_that_resolves_outside_allowed_roots(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
            first = manifest_data["items"][0]
            layer = root / first["candidateRoot"] / "rig/static.png"
            outside = root / "outside.png"
            Image.new("RGBA", CANVAS, (0, 0, 0, 0)).save(outside)
            layer.unlink()
            layer.symlink_to(outside)

            with self.assertRaisesRegex(ValueError, "resolved layer escapes"):
                resolve_authoritative_items(
                    repository_root=root,
                    catalog_path=catalog,
                    manifest_path=manifest,
                    selection_path=selection,
                )

    def test_repository_catalog_exactly_matches_the_current_66_product_contract(
        self,
    ) -> None:
        items = resolve_authoritative_items(
            repository_root=REPO_ROOT,
            catalog_path=DEFAULT_CATALOG,
            manifest_path=DEFAULT_MANIFEST,
            selection_path=DEFAULT_SELECTION,
        )
        expected = {
            "top": {
                "cream_basic_tee",
                "powder_blue_crew_tee",
                "sage_basic_tee",
                "dusty_navy_tee",
                "mist_blue_oxford_shirt",
                "soft_sage_linen_shirt",
                "cocoa_varsity_jacket",
                "dusty_navy_chore_jacket",
                "tonal_geometric_camp_collar_shirt",
                "asymmetric_utility_overshirt",
                "abstract_resort_shirt",
                "charcoal_leather_bomber_hybrid",
                "midnight_relaxed_tailoring_jacket",
                "warm_sand_deconstructed_jacket",
                "acid_washed_boxy_sweatshirt",
                "fog_blue_relaxed_hoodie",
                "indigo_denim_relaxed_workshirt",
                "oatmeal_fine_gauge_crewneck",
                "textured_knit_polo",
                "monochrome_street_tailoring_top",
                "contemporary_resort_street_top",
                "creative_utility_top",
                "striped_chunky_cardigan",
                "colorblock_rugby_polo",
                "pixel_heart_boxy_tee",
                "soft_varsity_knit_jacket",
                "soft_panel_overshirt_bomber",
            },
            "bottom": {
                "sage_cuffed_shorts",
                "navy_straight_pants",
                "mid_blue_straight_jeans",
                "charcoal_tapered_chinos",
                "warm_sand_relaxed_pants",
                "wide_pleated_technical_trousers",
                "straight_utility_tailored_trousers",
                "midnight_relaxed_tailoring_trousers",
                "warm_sand_deconstructed_trousers",
                "monochrome_street_tailoring_bottom",
                "modern_track_luxury_bottom",
                "contemporary_resort_street_bottom",
                "creative_utility_bottom",
                "relaxed_tailored_shorts",
                "refined_utility_cargo_shorts",
                "technical_sport_shorts",
                "washed_baggy_denim",
                "soft_parachute_cargo_pants",
                "colorblock_nylon_track_pants",
            },
            "shoes": {
                "milk_tea_court",
                "cloud_white_trainers",
                "cocoa_penny_loafers",
                "dusty_blue_canvas_sneakers",
                "retro_colorblock_runner",
                "chunky_skate_sneakers",
                "suede_penny_mules",
                "lightweight_trail_sneakers",
            },
            "hair": {
                "soft_textured_crop",
                "controlled_modern_mullet",
                "voluminous_wavy_quiff",
                "short_twists_textured_style",
                "copper_compact_quiff",
                "ash_blond_low_fade_crop",
                "blue_black_short_curls",
            },
            "accessory": {
                "soft_patch_beanie",
                "nylon_crossbody_bag",
                "beaded_charm_necklace",
                "tortoiseshell_smoke_sunglasses",
                "matte_black_panto_sunglasses",
            },
        }
        self.assertEqual(
            expected,
            {
                category: {
                    item.slug for item in items if item.category == category
                }
                for category in expected
            },
        )
        self.assertEqual(
            {
                "soft_patch_beanie": "headwear",
                "nylon_crossbody_bag": "bag",
                "beaded_charm_necklace": "neck",
                "tortoiseshell_smoke_sunglasses": "eyewear",
                "matte_black_panto_sunglasses": "eyewear",
            },
            {
                item.slug: item.role
                for item in items
                if item.category == "accessory"
            },
        )
        self.assertEqual(
            {
                "sage_cuffed_shorts": "short_no_contact",
                "navy_straight_pants": "bottom_over_shoe_upper",
                "mid_blue_straight_jeans": "bottom_over_shoe_upper",
                "charcoal_tapered_chinos": "shoe_over_hem",
                "warm_sand_relaxed_pants": "bottom_over_shoe_upper",
                "wide_pleated_technical_trousers": "bottom_over_shoe_upper",
                "straight_utility_tailored_trousers": "shoe_over_hem",
                "midnight_relaxed_tailoring_trousers": "bottom_over_shoe_upper",
                "warm_sand_deconstructed_trousers": "bottom_over_shoe_upper",
                "monochrome_street_tailoring_bottom": "bottom_over_shoe_upper",
                "modern_track_luxury_bottom": "bottom_over_shoe_upper",
                "contemporary_resort_street_bottom": "bottom_over_shoe_upper",
                "creative_utility_bottom": "bottom_over_shoe_upper",
                "relaxed_tailored_shorts": "short_no_contact",
                "refined_utility_cargo_shorts": "short_no_contact",
                "technical_sport_shorts": "short_no_contact",
                "washed_baggy_denim": "bottom_over_shoe_upper",
                "soft_parachute_cargo_pants": "bottom_over_shoe_upper",
                "colorblock_nylon_track_pants": "bottom_over_shoe_upper",
            },
            {
                item.slug: item.shoe_contact_role
                for item in items
                if item.category == "bottom"
            },
        )

    def test_renders_one_66_item_11_by_6_board(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            catalog, manifest, selection = self._fixture(root)
            output = root / "board-66.png"
            result = render_review_board_66(
                repository_root=root,
                catalog_path=catalog,
                manifest_path=manifest,
                selection_path=selection,
                output_path=output,
            )

            self.assertEqual(66, result.item_count)
            self.assertEqual(11, COLUMNS)
            self.assertEqual(6, ROWS)
            self.assertTrue(output.is_file())
            with Image.open(output) as board:
                self.assertEqual("RGB", board.mode)
                self.assertEqual(result.size, board.size)


if __name__ == "__main__":
    unittest.main()
