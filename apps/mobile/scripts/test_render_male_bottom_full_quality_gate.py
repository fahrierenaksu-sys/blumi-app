from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = (
    REPO_ROOT / "apps/mobile/scripts/render_male_bottom_full_quality_gate.py"
)
RUNTIME_ROOT = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"


def load_module():
    spec = importlib.util.spec_from_file_location(
        "render_male_bottom_full_quality_gate",
        SCRIPT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def synthetic_bottom(
    *,
    early_split: bool = False,
    fused: bool = False,
    shorts: bool = False,
) -> Image.Image:
    image = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    hem = 318 if shorts else 338
    split_start = 290 if early_split else 303
    draw.rectangle((96, 286, 159, split_start - 1), fill=(45, 48, 58, 255))
    if fused:
        draw.rectangle((96, split_start, 159, hem - 1), fill=(45, 48, 58, 255))
    else:
        draw.polygon(
            ((96, split_start), (127, split_start), (124, hem - 1), (96, hem - 1)),
            fill=(45, 48, 58, 255),
        )
        draw.polygon(
            ((128, split_start), (159, split_start), (159, hem - 1), (131, hem - 1)),
            fill=(45, 48, 58, 255),
        )
    return image


class RenderMaleBottomFullQualityGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def test_evaluator_distinguishes_natural_split_from_early_tear_and_fused_mass(
        self,
    ) -> None:
        straight = self.module.evaluate_bottom(
            synthetic_bottom(),
            family="male_straight",
        )
        self.assertNotIn("early_crotch_split", straight.flags)
        self.assertNotIn("missing_inner_leg_gap", straight.flags)

        early = self.module.evaluate_bottom(
            synthetic_bottom(early_split=True),
            family="male_straight",
        )
        self.assertIn("early_crotch_split", early.flags)

        fused = self.module.evaluate_bottom(
            synthetic_bottom(fused=True),
            family="male_relaxed_wide",
        )
        self.assertIn("missing_inner_leg_gap", fused.flags)

    def test_shorts_use_their_own_hem_contract(self) -> None:
        shorts = self.module.evaluate_bottom(
            synthetic_bottom(shorts=True),
            family="male_shorts",
        )
        self.assertEqual(shorts.alpha_bbox[3], 318)
        self.assertNotIn("hem_outside_family_range", shorts.flags)

        long_bottom = self.module.evaluate_bottom(
            synthetic_bottom(shorts=True),
            family="male_straight",
        )
        self.assertIn("hem_outside_family_range", long_bottom.flags)

    def test_transparent_rgb_and_detached_fragments_are_reported(self) -> None:
        image = synthetic_bottom()
        image.putpixel((20, 20), (200, 40, 90, 0))
        image.putpixel((40, 40), (200, 40, 90, 255))
        result = self.module.evaluate_bottom(image, family="male_straight")
        self.assertGreater(result.transparent_rgb_residue, 0)
        self.assertIn("transparent_rgb_residue", result.flags)
        self.assertIn("detached_alpha_fragment", result.flags)

    def test_low_alpha_dust_does_not_change_geometry_anchors(self) -> None:
        image = synthetic_bottom()
        image.putpixel((120, 280), (20, 20, 20, 1))
        image.putpixel((120, 340), (20, 20, 20, 1))
        result = self.module.evaluate_bottom(image, family="male_straight")
        self.assertEqual(result.alpha_bbox, (96, 286, 160, 338))
        self.assertEqual(result.waist_top_y, 286)
        self.assertEqual(result.hem_exclusive_y, 338)
        self.assertNotIn("waist_outside_family_anchor", result.flags)
        self.assertNotIn("hem_outside_family_range", result.flags)

    def test_asymmetric_upper_crotch_tear_is_rejected(self) -> None:
        image = synthetic_bottom()
        draw = ImageDraw.Draw(image)
        draw.rectangle((128, 290, 159, 302), fill=(0, 0, 0, 0))
        result = self.module.evaluate_bottom(image, family="male_straight")
        self.assertIn("asymmetric_crotch_tear", result.flags)

    def test_cell_contains_all_three_exact_closeup_regions(self) -> None:
        composite = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
        draw = ImageDraw.Draw(composite)
        draw.rectangle((78, 278, 177, 289), fill=(240, 20, 20, 255))
        draw.rectangle((96, 309, 159, 311), fill=(20, 220, 20, 255))
        draw.rectangle((78, 350, 177, 355), fill=(20, 20, 240, 255))
        cell = self.module._render_cell(
            composite,
            item_id="fixture",
            family="male_straight",
            status="needs_redesign",
            flags=(),
            background="checkerboard",
        )
        expected = (
            ((78, 278, 178, 308), 58, (100, 280), (240, 20, 20)),
            ((96, 290, 160, 334), 214, (100, 310), (20, 220, 20)),
            ((78, 312, 178, 356), 426, (100, 350), (20, 20, 240)),
        )
        for crop, label_y, source_point, color in expected:
            zoom_width = (crop[2] - crop[0]) * 4
            paste_x = 216 + (412 - zoom_width) // 2
            sample_x = (
                paste_x
                + (source_point[0] - crop[0]) * 4
                + 1
            )
            sample_y = (
                label_y
                + 18
                + (source_point[1] - crop[1]) * 4
                + 1
            )
            self.assertEqual(cell.getpixel((sample_x, sample_y)), color)

    def test_real_gate_renders_exactly_19_items_without_runtime_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory)
            before = self.module.tree_hashes(RUNTIME_ROOT)
            shoe_before = self.module.sha256_file(self.module.SHOE_PATH)
            result = self.module.render_bottom_quality_gate(output_root)
            after = self.module.tree_hashes(RUNTIME_ROOT)

            self.assertEqual(before, after)
            self.assertEqual(
                shoe_before,
                self.module.sha256_file(self.module.SHOE_PATH),
            )
            self.assertEqual(result.item_count, 19)
            self.assertEqual(
                set(result.status_counts),
                {
                    "needs_redesign",
                    "independent_reviewed_pending_user_approval",
                    "user_approved",
                },
            )
            self.assertEqual(result.status_counts["user_approved"], 3)
            self.assertEqual(
                result.status_counts[
                    "independent_reviewed_pending_user_approval"
                ],
                1,
            )
            self.assertEqual(result.status_counts["needs_redesign"], 15)

            for path in (
                result.checkerboard_path,
                result.black_path,
                result.metrics_path,
                result.evidence_path,
            ):
                self.assertTrue(path.is_file(), path)
                self.assertGreater(path.stat().st_size, 0, path)

            metrics = json.loads(result.metrics_path.read_text(encoding="utf-8"))
            self.assertEqual(len(metrics["items"]), 19)
            self.assertEqual(
                {item["item_id"] for item in metrics["items"]},
                set(self.module.MALE_BOTTOM_PROFILES),
            )
            self.assertEqual(metrics["base_identity"], "avatar_room_base_male_light_v1")
            self.assertEqual(metrics["shoe_identity"], "milk_tea_court_v7_approved")
            self.assertEqual(
                [item["item_id"] for item in metrics["items"]],
                sorted(self.module.MALE_BOTTOM_PROFILES),
            )
            self.assertEqual(
                metrics["board_contract"]["closeup_scale"],
                4,
            )
            self.assertEqual(
                metrics["board_contract"]["crops"],
                {
                    "crotch_leg_gap": [96, 290, 160, 334],
                    "hem_shoe": [78, 312, 178, 356],
                    "waist_top": [78, 278, 178, 308],
                },
            )
            with Image.open(result.checkerboard_path) as board:
                self.assertEqual(board.mode, "RGB")
                self.assertEqual(board.size, (2560, 3330))
                checkerboard_size = board.size
            with Image.open(result.black_path) as board:
                self.assertEqual(board.mode, "RGB")
                self.assertEqual(board.size, checkerboard_size)


if __name__ == "__main__":
    unittest.main()
