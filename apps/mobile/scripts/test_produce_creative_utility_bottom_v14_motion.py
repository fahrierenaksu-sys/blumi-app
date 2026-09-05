from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from produce_creative_utility_bottom_v13_motion import STATES, build_frame as build_v13_frame  # noqa: E402
from produce_creative_utility_bottom_v14_motion import build_frame  # noqa: E402


class ProduceCreativeUtilityBottomV14MotionTests(unittest.TestCase):
    @staticmethod
    def _component_count(mask: np.ndarray) -> int:
        remaining = mask.copy()
        count = 0
        for y, x in zip(*np.where(remaining)):
            if not remaining[y, x]:
                continue
            count += 1
            stack = [(int(y), int(x))]
            remaining[y, x] = False
            while stack:
                cy, cx = stack.pop()
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and remaining[ny, nx]:
                        remaining[ny, nx] = False
                        stack.append((ny, nx))
        return count

    def test_user_approved_f01_remains_bit_exact(self) -> None:
        self.assertEqual(
            hashlib.sha256(build_v13_frame("walking_front_f01").tobytes()).digest(),
            hashlib.sha256(build_frame("walking_front_f01").tobytes()).digest(),
        )

    def test_each_moving_frame_has_one_alpha_component(self) -> None:
        for state in STATES[1:]:
            alpha = np.asarray(build_frame(state))[..., 3]
            self.assertEqual(1, self._component_count(alpha > 0), state)

    def test_cleanup_only_removes_tiny_specks(self) -> None:
        for state in STATES[1:]:
            before = np.asarray(build_v13_frame(state))
            after = np.asarray(build_frame(state))
            changed = np.any(before != after, axis=2)
            self.assertLessEqual(int(changed.sum()), 24, state)
            self.assertTrue(np.all(after[after[..., 3] == 0, :3] == 0))


if __name__ == "__main__":
    unittest.main()
