from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "plan_male_wardrobe_66_motion_batches.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "plan_male_wardrobe_66_motion_batches",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleWardrobe66MotionBatchPlanTests(unittest.TestCase):
    def test_plan_covers_every_live_item_exactly_once(self) -> None:
        module = load_module()
        plan = module.build_motion_batch_plan()

        self.assertEqual(66, plan["itemCount"])
        self.assertEqual(57, plan["regenerateItemCount"])
        self.assertEqual(9, plan["reviewExistingItemCount"])
        flattened = [
            item["slug"]
            for batch in plan["batches"]
            for item in batch["items"]
        ]
        self.assertEqual(66, len(flattened))
        self.assertEqual(66, len(set(flattened)))
        self.assertFalse(plan["producesAssets"])

    def test_batching_preserves_garment_specific_rig_methods(self) -> None:
        module = load_module()
        plan = module.build_motion_batch_plan()
        regenerate = {
            batch["batchId"]: batch
            for batch in plan["batches"]
            if batch["mode"] == "regenerate"
        }

        self.assertIn("top_tshirt_closed_crew", regenerate)
        self.assertIn("top_shirt_open_camp_collar", regenerate)
        self.assertIn("top_jacket_closed_high_neck", regenerate)
        self.assertIn("top_jacket_open_lapel", regenerate)
        self.assertIn("top_hoodie_or_sweat_closed_neck", regenerate)
        self.assertIn("top_polo_placket_opening", regenerate)
        self.assertIn("bottom_male_slim_tapered", regenerate)
        self.assertIn("bottom_male_straight", regenerate)
        self.assertIn("bottom_male_relaxed_baggy", regenerate)
        self.assertIn("bottom_male_cargo_parachute_track", regenerate)
        self.assertIn("bottom_male_shorts", regenerate)
        self.assertNotIn("shoes_court_trainer", regenerate)

    def test_pixel_heart_enters_the_closed_crew_regeneration_batch(self) -> None:
        module = load_module()
        plan = module.build_motion_batch_plan()
        batch = next(
            batch
            for batch in plan["batches"]
            if batch["batchId"] == "top_tshirt_closed_crew"
        )

        self.assertIn(
            "pixel_heart_boxy_tee",
            {item["slug"] for item in batch["items"]},
        )
        self.assertIn("neckline", batch["requiredCloseups"])
        self.assertIn("rear-collar-absence", batch["requiredCloseups"])

    def test_plan_stays_blocked_until_static_approval(self) -> None:
        module = load_module()
        plan = module.build_motion_batch_plan()

        self.assertEqual(
            "BLOCKED_PENDING_EXPLICIT_USER_STATIC_APPROVAL",
            plan["status"],
        )
        self.assertFalse(plan["executionEligible"])
        self.assertFalse(plan["runtimePromotionEligible"])

    def test_review_existing_batches_keep_family_specific_contact_gates(
        self,
    ) -> None:
        module = load_module()
        plan = module.build_motion_batch_plan()
        review = {
            batch["batchId"]: batch
            for batch in plan["batches"]
            if batch["mode"] == "review-existing"
        }

        self.assertEqual(
            {
                "review_bottom_male_relaxed_baggy",
                "review_shoes_court_trainer",
                "review_shoes_loafer_mule",
                "review_shoes_canvas_skate",
                "review_shoes_runner_trail",
            },
            set(review),
        )
        bottom = review["review_bottom_male_relaxed_baggy"]
        self.assertIn("waist", bottom["requiredCloseups"])
        self.assertIn("crotch", bottom["requiredCloseups"])
        self.assertIn("leg-gap", bottom["requiredCloseups"])
        self.assertIn("drape", bottom["requiredCloseups"])
        self.assertIn("hem-shoe", bottom["requiredCloseups"])
        for batch_id, batch in review.items():
            if batch_id.startswith("review_shoes_"):
                self.assertIn("shoe-contact", batch["requiredCloseups"])
                self.assertIn("toe", batch["requiredCloseups"])
                self.assertIn("sole", batch["requiredCloseups"])


if __name__ == "__main__":
    unittest.main()
