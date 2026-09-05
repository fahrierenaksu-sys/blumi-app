from __future__ import annotations

import json
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG = REPO_ROOT / "packages/domain/src/avatar/avatarLoadoutCatalog.ts"
INVENTORY = (
    REPO_ROOT
    / "apps/mobile/src/features/avatarV2/malePremiumCapsuleInventory.ts"
)
SELECTION = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/"
    "review-composite-selection.json"
)
RUNTIME_ASSETS = (
    REPO_ROOT
    / "apps/mobile/src/features/avatarV2/room/"
    "avatarRoomMalePremiumCapsuleAssets.ts"
)
THUMBNAIL_TEST = (
    REPO_ROOT
    / "apps/mobile/src/features/avatarV2/maleRigThumbnailPresentation.test.ts"
)
REJECTED = (
    "modern_track_luxury_top",
    "slim_oval_glasses",
    "soft_rectangular_glasses",
    "translucent_wrap_glasses",
)


class MaleRejectedTopAndGlassesCancelledTests(unittest.TestCase):
    def test_rejected_items_are_absent_from_active_catalog_and_inventory(self) -> None:
        catalog = CATALOG.read_text(encoding="utf-8")
        inventory = INVENTORY.read_text(encoding="utf-8")
        runtime_assets = RUNTIME_ASSETS.read_text(encoding="utf-8")
        thumbnail_test = THUMBNAIL_TEST.read_text(encoding="utf-8")

        for slug in REJECTED:
            with self.subTest(slug=slug):
                self.assertNotIn(f"male_{slug}", catalog)
                self.assertNotIn(f'"{slug}"', inventory)
                self.assertNotIn(slug, runtime_assets)
                self.assertNotIn(slug, thumbnail_test)

    def test_rejected_items_are_absent_from_current_review_selection(self) -> None:
        selection = json.loads(SELECTION.read_text(encoding="utf-8"))
        selected = {
            *selection.get("productLayers", {}),
            *selection.get("overrides", {}),
        }

        self.assertTrue(set(REJECTED).isdisjoint(selected))


if __name__ == "__main__":
    unittest.main()
