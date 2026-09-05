from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "male_wardrobe_66_motion_readiness.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "male_wardrobe_66_motion_readiness",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleWardrobe66MotionReadinessTests(unittest.TestCase):
    def test_live_66_is_audited_without_counting_legacy_runtime_as_current(
        self,
    ) -> None:
        module = load_module()
        report = module.build_motion_readiness_report()

        self.assertEqual(66, report["itemCount"])
        self.assertEqual(66, report["currentHashBound4W1SItemCount"])
        self.assertEqual(0, report["requiresNewMotionItemCount"])
        self.assertEqual(66, report["legacyRuntimeFiveFrameItemCount"])
        self.assertEqual(3, report["legacyFixedLayerReuseItemCount"])
        self.assertFalse(report["motionProductionEligible"])
        self.assertFalse(report["runtimePromotionEligible"])
        self.assertTrue(report["runtimePromotionVerified"])
        self.assertEqual(
            "RUNTIME_PROMOTED_FINAL_SIMULATOR_VERIFIED",
            report["status"],
        )

    def test_targeted_pixel_heart_motion_is_current_after_static_repair(
        self,
    ) -> None:
        module = load_module()
        report = module.build_motion_readiness_report()
        pixel_heart = next(
            item
            for item in report["items"]
            if item["slug"] == "pixel_heart_boxy_tee"
        )

        self.assertEqual(5, pixel_heart["legacyRuntimeFrameCount"])
        self.assertTrue(pixel_heart["currentHashBound4W1S"])
        self.assertEqual(
            "RUNTIME_PROMOTED_VERIFIED",
            pixel_heart["nextAction"],
        )

    def test_only_current_selected_motion_candidates_count_as_ready(self) -> None:
        module = load_module()
        report = module.build_motion_readiness_report()
        ready = {
            item["slug"]
            for item in report["items"]
            if item["currentHashBound4W1S"]
        }

        self.assertIn("monochrome_street_tailoring_bottom", ready)
        self.assertEqual(66, len(ready))

    def test_superseded_products_never_enter_the_authoritative_live_motion_set(
        self,
    ) -> None:
        module = load_module()
        report = module.build_motion_readiness_report()
        slugs = {item["slug"] for item in report["items"]}

        self.assertIn("dusty_blue_weekend_crew_sweatshirt", slugs)
        self.assertIn("cocoa_sage_canvas_shacket", slugs)
        self.assertIn("modern_track_luxury_top", slugs)
        self.assertNotIn("cropped_cocoa_moto_jacket", slugs)
        self.assertNotIn("diagonal_seam_zip_mock_neck", slugs)
        self.assertNotIn("fog_blue_relaxed_hoodie", slugs)
        self.assertNotIn("indigo_denim_relaxed_workshirt", slugs)
        self.assertNotIn("oatmeal_fine_gauge_crewneck", slugs)

    def test_harder_static_gate_blocker_is_propagated_verbatim(self) -> None:
        module = load_module()
        self.assertEqual(
            "BLOCKED_STATIC_EVIDENCE_DRIFT",
            module.motion_readiness_status(
                {
                    "status": "BLOCKED_STATIC_EVIDENCE_DRIFT",
                    "motionGenerationEligible": False,
                }
            ),
        )

    def test_stale_static_gate_report_file_is_rejected(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory() as temporary_directory:
            stale = Path(temporary_directory) / "stale-static-gate.json"
            stale.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "status": "STALE",
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                ValueError,
                "static gate report file differs",
            ):
                module.build_motion_readiness_report(
                    static_gate_report_path=stale,
                )

    def test_refresh_summary_rejects_manifest_path_traversal(self) -> None:
        module = load_module()
        original_summary = module.MOTION_REFRESH_SUMMARY
        with tempfile.TemporaryDirectory() as temporary_directory:
            summary = Path(temporary_directory) / "summary.json"
            summary.write_text(
                json.dumps({"manifests": ["../outside.json"]}),
                encoding="utf-8",
            )
            module.MOTION_REFRESH_SUMMARY = summary
            try:
                with self.assertRaisesRegex(
                    ValueError,
                    "repository-relative",
                ):
                    module._load_refresh_records()
            finally:
                module.MOTION_REFRESH_SUMMARY = original_summary


if __name__ == "__main__":
    unittest.main()
