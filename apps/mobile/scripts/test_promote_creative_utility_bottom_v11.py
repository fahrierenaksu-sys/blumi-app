from __future__ import annotations

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOM = REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room"
REDESIGN = REPO_ROOT / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
STATES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


class PromoteCreativeUtilityBottomV15Tests(unittest.TestCase):
    def test_runtime_static_is_exact_user_approved_v15_f01(self) -> None:
        candidate = REDESIGN / "creative-utility-bottom-v15-motion/walking_front_f01.png"
        runtime = ROOM / "avatar_room_bottom_male_creative_utility_bottom_v1.png"
        self.assertEqual(candidate.read_bytes(), runtime.read_bytes())

    def test_runtime_motion_is_exact_user_and_independently_approved_v15(self) -> None:
        for state in STATES:
            candidate = REDESIGN / "creative-utility-bottom-v15-motion" / f"{state}.png"
            runtime = ROOM / "motion" / f"room_avatar_bottom_male_creative_utility_bottom_v1_{state}.png"
            with self.subTest(state=state):
                self.assertEqual(candidate.read_bytes(), runtime.read_bytes())


if __name__ == "__main__":
    unittest.main()
