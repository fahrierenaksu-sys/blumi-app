from __future__ import annotations

import hashlib
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"

ITEMS = {
    "tortoiseshell_smoke_sunglasses": (
        "accessory",
        REDESIGN / "candidates/accessory/tortoiseshell_smoke_sunglasses/rig/static-review-natural-fit-v3.png",
    ),
    "matte_black_panto_sunglasses": (
        "accessory",
        REDESIGN / "candidates/accessory/matte_black_panto_sunglasses/rig/static-review-natural-fit-v3.png",
    ),
    "copper_compact_quiff": (
        "hair_front",
        REDESIGN / "candidates/hair/copper_compact_quiff/rig/hair-front-review-natural-v3.png",
    ),
    "ash_blond_low_fade_crop": (
        "hair_front",
        REDESIGN / "candidates/hair/ash_blond_low_fade_crop/rig/hair-front-review-natural-v3.png",
    ),
    "blue_black_short_curls": (
        "hair_front",
        REDESIGN / "candidates/hair/blue_black_short_curls/rig/hair-front-review-natural-v3.png",
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class MaleV3HairSunglassesPromotionTests(unittest.TestCase):
    def test_runtime_assets_are_exact_copies_of_user_approved_v3_candidates(self) -> None:
        for slug, (kind, candidate) in ITEMS.items():
            runtime = ROOM / f"avatar_room_{kind}_male_{slug}_v1.png"
            with self.subTest(slug=slug):
                self.assertTrue(runtime.is_file())
                self.assertEqual(sha256(candidate), sha256(runtime))

    def test_catalog_inventory_and_fixed_head_motion_register_all_five_items(self) -> None:
        catalog = (REPO_ROOT / "packages/domain/src/avatar/avatarLoadoutCatalog.ts").read_text()
        inventory = (REPO_ROOT / "apps/mobile/src/features/avatarV2/malePremiumCapsuleInventory.ts").read_text()
        assets = (REPO_ROOT / "apps/mobile/src/features/avatarV2/room/avatarRoomMalePremiumCapsuleAssets.ts").read_text()
        motion_qa = (REPO_ROOT / "apps/mobile/scripts/produce_male_premium_capsule_feature_motion_qa.py").read_text()

        for slug, (kind, _) in ITEMS.items():
            category = "hair" if kind == "hair_front" else "accessory"
            with self.subTest(slug=slug):
                self.assertIn(f'"avatar_v2_{category}_male_{slug}"', catalog)
                self.assertIn(f'"{slug}"', inventory)
                self.assertIn(f"{slug}: asset(", assets)
                self.assertIn(f"{slug}: fixedHead(", assets)
                self.assertIn(f'("{kind}", "{slug}")', motion_qa)


if __name__ == "__main__":
    unittest.main()
