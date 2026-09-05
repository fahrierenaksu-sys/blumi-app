"""RED tests for construction-aware male top fitting.

These tests intentionally describe the new fitting contract before the
implementation is introduced.  They do not touch production assets.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name("refit_male_wardrobe_static.py")
SPEC = importlib.util.spec_from_file_location("refit_male_wardrobe_static", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ConstructionAwareProfileTests(unittest.TestCase):
    def test_every_male_top_has_an_explicit_construction_profile(self) -> None:
        profiles = MODULE.TOP_FIT_PROFILES
        expected = {
            path.stem.removeprefix("avatar_room_top_male_").removesuffix("_v1")
            for path in MODULE.ROOM.glob("avatar_room_top_male_*.png")
        }
        self.assertEqual(expected, set(profiles))

    def test_profile_families_cover_the_product_constructions(self) -> None:
        families = {profile.family for profile in MODULE.TOP_FIT_PROFILES.values()}
        self.assertTrue({"shirt", "tshirt", "jacket", "hoodie", "polo"} <= families)
        for profile in MODULE.TOP_FIT_PROFILES.values():
            self.assertIn(profile.neckline.strategy, MODULE.STRATEGIES_BY_FAMILY[profile.family])

    def test_every_top_profile_has_a_neck_passage_inside_its_collar_ring(self) -> None:
        failures = [
            name
            for name, profile in MODULE.TOP_FIT_PROFILES.items()
            if profile.neckline.rear_occlusion_area == 0
        ]
        self.assertEqual([], failures)

    def test_hoodie_and_polo_strategy_catalogues_are_explicit(self) -> None:
        self.assertEqual(4, len(MODULE.HOODIE_STRATEGIES))
        self.assertEqual(5, len(MODULE.POLO_STRATEGIES))
        self.assertEqual(set(MODULE.HOODIE_STRATEGIES), set(MODULE.HOODIE_NECKLINES))
        self.assertEqual(set(MODULE.POLO_STRATEGIES), set(MODULE.POLO_NECKLINES))

    def test_profile_application_is_immutable_and_uses_a_contour_mask(self) -> None:
        profile = MODULE.TOP_FIT_PROFILES["tonal_geometric_camp_collar_shirt"]
        source = Image.open(MODULE.PREMIUM_CANDIDATE_ROOT / "tonal_geometric_camp_collar_shirt.png").convert("RGBA")
        before = source.tobytes()

        fitted = MODULE.apply_top_fit_profile(source, profile)

        self.assertEqual(before, source.tobytes())
        self.assertNotEqual(source.tobytes(), fitted.tobytes())
        self.assertGreater(profile.neckline.opening_area, 0)
        self.assertNotEqual(profile.neckline.opening_points[0][1], profile.neckline.opening_points[-1][1])
        self.assertGreater(profile.neckline.rear_occlusion_area, 0)

    def test_closed_tshirt_does_not_receive_an_open_collar_cut(self) -> None:
        profile = MODULE.TOP_FIT_PROFILES["cream_basic_tee"]
        self.assertEqual("closed_crew", profile.neckline.strategy)
        self.assertEqual(0, profile.neckline.opening_area)

    def test_real_life_closed_tops_do_not_receive_artificial_skin_openings(self) -> None:
        closed = {
            "acid_washed_boxy_sweatshirt",
            "asymmetric_utility_overshirt",
            "charcoal_leather_bomber_hybrid",
            "cocoa_varsity_jacket",
            "cropped_cocoa_moto_jacket",
            "diagonal_seam_zip_mock_neck",
            "modern_track_luxury_top",
            "monochrome_street_tailoring_top",
            "soft_panel_overshirt_bomber",
            "soft_varsity_knit_jacket",
        }
        for name in closed:
            with self.subTest(name=name):
                neckline = MODULE.TOP_FIT_PROFILES[name].neckline
                self.assertEqual(0, neckline.opening_area)
                self.assertGreater(neckline.rear_occlusion_area, 0)

    def test_open_jackets_and_polos_keep_a_controlled_front_neck_view(self) -> None:
        open_tops = {
            "creative_utility_top",
            "dusty_navy_chore_jacket",
            "midnight_relaxed_tailoring_jacket",
            "warm_sand_deconstructed_jacket",
            "colorblock_rugby_polo",
            "textured_knit_polo",
        }
        for name in open_tops:
            with self.subTest(name=name):
                self.assertGreater(MODULE.TOP_FIT_PROFILES[name].neckline.opening_area, 0)

    def test_neckline_masks_are_antialiased_and_never_cut_outside_the_base_body(self) -> None:
        profile = MODULE.TOP_FIT_PROFILES["tonal_geometric_camp_collar_shirt"]
        mask = MODULE.build_neckline_mask(MODULE.CANVAS, profile.neckline)
        self.assertTrue(any(0 < value < 255 for value in mask.getdata()))

        source = Image.open(MODULE.PREMIUM_CANDIDATE_ROOT / "tonal_geometric_camp_collar_shirt.png").convert("RGBA")
        fitted_source = MODULE.fit_to_box(source, profile.box)
        fitted = MODULE.apply_top_fit_profile(fitted_source, profile)
        base_alpha = Image.open(MODULE.BASE).convert("RGBA").getchannel("A")
        source_alpha = fitted_source.getchannel("A")
        fitted_alpha = fitted.getchannel("A")

        for y in range(210, 242):
            for x in range(100, 157):
                if fitted_alpha.getpixel((x, y)) < source_alpha.getpixel((x, y)):
                    self.assertGreater(base_alpha.getpixel((x, y)), 0, (x, y))

    def test_top_refits_resolve_clean_candidate_masters_instead_of_dirty_runtime_outputs(self) -> None:
        premium_runtime = MODULE.ROOM / "avatar_room_top_male_tonal_geometric_camp_collar_shirt_v1.png"
        young_runtime = MODULE.ROOM / "avatar_room_top_male_soft_panel_overshirt_bomber_v1.png"
        starter_runtime = MODULE.ROOM / "avatar_room_top_male_cream_basic_tee_v1.png"

        self.assertEqual(
            MODULE.PREMIUM_CANDIDATE_ROOT / "tonal_geometric_camp_collar_shirt.png",
            MODULE.source_path_for(premium_runtime),
        )
        self.assertEqual(
            MODULE.YOUNG_DROP_CANDIDATE_ROOT / "soft_panel_overshirt_bomber.png",
            MODULE.source_path_for(young_runtime),
        )
        self.assertEqual(starter_runtime, MODULE.source_path_for(starter_runtime))

    def test_deep_collar_rings_remove_the_full_rear_panel_not_only_a_center_slit(self) -> None:
        ringed = {
            "cropped_cocoa_moto_jacket",
            "cocoa_varsity_jacket",
            "soft_panel_overshirt_bomber",
            "soft_varsity_knit_jacket",
            "colorblock_rugby_polo",
            "textured_knit_polo",
            "striped_chunky_cardigan",
        }
        for name in ringed:
            with self.subTest(name=name):
                self.assertGreaterEqual(MODULE.TOP_FIT_PROFILES[name].neckline.rear_occlusion_area, 100)

    def test_closed_neck_portals_follow_the_base_neck_instead_of_forming_a_flat_slot(self) -> None:
        closed = {
            "acid_washed_boxy_sweatshirt",
            "cream_basic_tee",
            "dusty_navy_tee",
            "pixel_heart_boxy_tee",
            "powder_blue_crew_tee",
            "sage_basic_tee",
        }
        for name in closed:
            with self.subTest(name=name):
                points = MODULE.TOP_FIT_PROFILES[name].neckline.rear_occlusion_points
                xs = [point[0] for point in points]
                ys = [point[1] for point in points]
                self.assertGreaterEqual(max(ys) - min(ys), 8)
                self.assertGreater(max(xs) - min(xs), 14)

    def test_ring_portals_preserve_front_collar_shoulders(self) -> None:
        ringed = {
            "cropped_cocoa_moto_jacket",
            "cocoa_varsity_jacket",
            "soft_panel_overshirt_bomber",
            "soft_varsity_knit_jacket",
            "colorblock_rugby_polo",
            "textured_knit_polo",
            "striped_chunky_cardigan",
        }
        for name in ringed:
            with self.subTest(name=name):
                points = MODULE.TOP_FIT_PROFILES[name].neckline.rear_occlusion_points
                xs = [point[0] for point in points]
                ys = [point[1] for point in points]
                self.assertLessEqual(max(xs) - min(xs), 20)
                self.assertGreaterEqual(max(ys) - min(ys), 10)

    def test_ringed_products_do_not_share_one_generic_portal_geometry(self) -> None:
        ringed = {
            "cropped_cocoa_moto_jacket",
            "cocoa_varsity_jacket",
            "soft_panel_overshirt_bomber",
            "soft_varsity_knit_jacket",
            "colorblock_rugby_polo",
            "textured_knit_polo",
            "striped_chunky_cardigan",
        }
        geometries = {
            MODULE.TOP_FIT_PROFILES[name].neckline.rear_occlusion_points
            for name in ringed
        }
        self.assertGreaterEqual(len(geometries), 5)

    def test_every_bottom_and_shoe_has_an_immutable_item_profile(self) -> None:
        expected_bottoms = {
            path.stem.removeprefix("avatar_room_bottom_male_").removesuffix("_v1")
            for path in MODULE.ROOM.glob("avatar_room_bottom_male_*.png")
        }
        expected_shoes = {
            path.stem.removeprefix("avatar_room_shoes_male_").removesuffix("_v1")
            for path in MODULE.ROOM.glob("avatar_room_shoes_male_*.png")
        }
        self.assertEqual(expected_bottoms, set(MODULE.BOTTOM_FIT_PROFILES))
        self.assertEqual(expected_shoes, set(MODULE.SHOE_FIT_PROFILES))
        self.assertTrue(all(profile.__dataclass_params__.frozen for profile in MODULE.BOTTOM_FIT_PROFILES.values()))
        self.assertTrue(all(profile.__dataclass_params__.frozen for profile in MODULE.SHOE_FIT_PROFILES.values()))

    def test_every_bottom_has_a_direct_master_construction_contract(self) -> None:
        expected = {
            path.stem.removeprefix("avatar_room_bottom_male_").removesuffix("_v1")
            for path in MODULE.ROOM.glob("avatar_room_bottom_male_*.png")
        }
        profiles = MODULE.BOTTOM_CONSTRUCTION_PROFILES
        self.assertEqual(expected, set(profiles))
        self.assertTrue(all(profile.__dataclass_params__.frozen for profile in profiles.values()))
        self.assertTrue(all(profile.requires_direct_master for profile in profiles.values()))
        self.assertEqual(
            {"tailored_trouser", "denim", "track_trouser", "utility_trouser", "resort_trouser", "short"},
            {profile.family for profile in profiles.values()},
        )
        for name, profile in profiles.items():
            with self.subTest(name=name):
                self.assertLess(profile.waist_y, profile.crotch_y)
                self.assertLess(profile.crotch_y, profile.hem_y)
                self.assertLess(profile.left_leg[0], profile.left_leg[1])
                self.assertLessEqual(profile.left_leg[1], 127)
                self.assertGreater(profile.right_leg[0], 128)
                self.assertLess(profile.right_leg[0], profile.right_leg[1])
                self.assertLessEqual(profile.hem_y, 326)
                if profile.family != "short":
                    self.assertLessEqual(profile.waist_y, 266)
                    self.assertGreaterEqual(profile.hem_y - profile.waist_y, 60)

    def test_direct_bottom_master_validation_rejects_resized_source_art(self) -> None:
        profile = MODULE.BOTTOM_CONSTRUCTION_PROFILES["charcoal_tapered_chinos"]
        legacy_source = Image.new("RGBA", (64, 40), (24, 24, 28, 255))
        with self.assertRaisesRegex(ValueError, "256"):
            MODULE.build_bottom_candidate_from_master("charcoal_tapered_chinos", legacy_source)
        overlong = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        overlong.paste((30, 34, 40, 255), (97, 220, 159, 326))
        for y in range(318, 326):
            overlong.putpixel((127, y), (0, 0, 0, 0))
            overlong.putpixel((128, y), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "above the waist"):
            MODULE.build_bottom_candidate_from_master("charcoal_tapered_chinos", overlong)
        self.assertEqual(
            MODULE.BOTTOM_REILLUSTRATED_MASTER_ROOT / "charcoal_tapered_chinos.png",
            MODULE.reillustrated_bottom_master_path("charcoal_tapered_chinos"),
        )
        self.assertEqual("tailored_trouser", profile.family)

    def test_generated_bottom_projection_preserves_aspect_ratio_and_anchors_the_hem(self) -> None:
        source = Image.new("RGBA", (100, 120), (0, 0, 0, 0))
        for y in range(10, 110):
            for x in range(10, 90):
                source.putpixel((x, y), (30, 34, 40, 255))

        projected = MODULE.project_generated_bottom_to_rig("charcoal_tapered_chinos", source)
        bounds = MODULE.alpha_bounds(projected)

        self.assertEqual(62, bounds[2] - bounds[0])
        self.assertEqual(78, bounds[3] - bounds[1])
        self.assertEqual(326, bounds[3])
        self.assertEqual(128, (bounds[0] + bounds[2]) // 2)
        for y in range(318, 326):
            self.assertEqual(0, projected.getpixel((127, y))[3])
            self.assertEqual(0, projected.getpixel((128, y))[3])
            self.assertGreater(projected.getpixel((126, y))[3], 16)
            self.assertGreater(projected.getpixel((129, y))[3], 16)

    def test_candidate_producers_use_direct_bottom_masters_not_the_legacy_resizer(self) -> None:
        for producer in (
            SCRIPT.with_name("produce_male_premium_capsule.py"),
            SCRIPT.with_name("produce_male_young_drop_static.py"),
        ):
            with self.subTest(producer=producer.name):
                source = producer.read_text()
                self.assertIn("load_reillustrated_bottom_master", source)
                self.assertNotIn("fit_bottom_source as canonical_fit_bottom_source", source)

    def test_shorts_keep_a_real_short_hem_and_long_trousers_keep_a_shoe_lane(self) -> None:
        for name, profile in MODULE.BOTTOM_FIT_PROFILES.items():
            with self.subTest(name=name):
                if profile.kind.endswith("shorts"):
                    self.assertLessEqual(profile.box[3], 326)
                    self.assertFalse(profile.expose_shoe_vamp)
                else:
                    self.assertGreaterEqual(profile.box[3], 324)
                    self.assertLessEqual(profile.box[3], 326)
                    self.assertTrue(profile.expose_shoe_vamp)

        resort = MODULE.BOTTOM_FIT_PROFILES["contemporary_resort_street_bottom"]
        self.assertEqual("trousers", resort.kind)
        self.assertEqual(326, resort.box[3])
        track = MODULE.BOTTOM_FIT_PROFILES["colorblock_nylon_track_pants"]
        self.assertEqual("trousers", track.kind)
        self.assertEqual(326, track.box[3])

    def test_lower_profiles_stay_inside_the_male_base_width_and_shoe_clearance_limits(self) -> None:
        for name, profile in MODULE.BOTTOM_FIT_PROFILES.items():
            with self.subTest(name=name):
                width = profile.box[2] - profile.box[0]
                self.assertLessEqual(width, 64)
                if profile.kind.endswith("shorts"):
                    self.assertLessEqual(profile.box[3], 324)
                else:
                    self.assertGreaterEqual(profile.box[0], 96)
                    self.assertLessEqual(profile.box[2], 160)

    def test_long_trousers_keep_a_closed_crotch_and_only_a_short_inner_hem_gap(self) -> None:
        for name, profile in MODULE.BOTTOM_FIT_PROFILES.items():
            if profile.kind != "trousers":
                continue
            with self.subTest(name=name):
                fitted = MODULE.fit_bottom(MODULE.ROOM / f"avatar_room_bottom_male_{name}_v1.png")
                for y in range(profile.box[3] - 12, profile.box[3] - 4):
                    self.assertGreater(fitted.getpixel((127, y))[3], 16, (name, 127, y))
                    self.assertGreater(fitted.getpixel((128, y))[3], 16, (name, 128, y))
                for y in range(profile.box[3] - 4, profile.box[3]):
                    self.assertLessEqual(fitted.getpixel((127, y))[3], 16, (name, 127, y))
                    self.assertLessEqual(fitted.getpixel((128, y))[3], 16, (name, 128, y))
                    for x in (126, 129):
                        self.assertGreater(fitted.getpixel((x, y))[3], 16, (name, x, y))

    def test_charcoal_runtime_has_no_orphan_pixels_below_the_hem(self) -> None:
        runtime = Image.open(
            MODULE.ROOM / "avatar_room_bottom_male_charcoal_tapered_chinos_v1.png"
        ).convert("RGBA")
        for y in range(314, 322):
            self.assertGreater(runtime.getpixel((127, y))[3], 16, y)
            self.assertGreater(runtime.getpixel((128, y))[3], 16, y)
        for y in range(322, 326):
            self.assertLessEqual(runtime.getpixel((127, y))[3], 16, y)
            self.assertLessEqual(runtime.getpixel((128, y))[3], 16, y)
            self.assertGreater(runtime.getpixel((126, y))[3], 16, y)
            self.assertGreater(runtime.getpixel((129, y))[3], 16, y)
        self.assertIsNone(runtime.getchannel("A").crop((0, 326, 256, 384)).getbbox())

    def test_each_shoe_has_a_clean_master_and_item_specific_anchor(self) -> None:
        for name, profile in MODULE.SHOE_FIT_PROFILES.items():
            with self.subTest(name=name):
                runtime = MODULE.ROOM / f"avatar_room_shoes_male_{name}_v1.png"
                self.assertNotEqual(runtime, MODULE.source_path_for(runtime))
                left, top, right, bottom = profile.box
                self.assertTrue(0 <= left < right <= MODULE.CANVAS[0])
                self.assertTrue(0 <= top < bottom <= MODULE.CANVAS[1])

    def test_runtime_fitters_delegate_to_the_shared_clean_source_pipeline(self) -> None:
        for category, name, shared, runtime_fit in (
            ("bottom", "navy_straight_pants", MODULE.fit_bottom_source, MODULE.fit_bottom),
            ("bottom", "refined_utility_cargo_shorts", MODULE.fit_bottom_source, MODULE.fit_bottom),
            ("shoes", "chunky_skate_sneakers", MODULE.fit_shoe_source, MODULE.fit_shoes),
        ):
            with self.subTest(category=category, name=name):
                path = MODULE.ROOM / f"avatar_room_{category}_male_{name}_v1.png"
                source = MODULE.load_source(path)
                self.assertEqual(shared(name, source).tobytes(), runtime_fit(path).tobytes())


if __name__ == "__main__":
    unittest.main()
