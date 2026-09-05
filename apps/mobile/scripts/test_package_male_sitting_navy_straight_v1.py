"""TDD gate for the navy straight-pants canonical sitting candidate."""

from collections import deque
import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_navy_straight_v1.py")
SPEC = importlib.util.spec_from_file_location("package_navy_sitting", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageNavyStraightSittingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.layer = MODULE.extract_bottom(MODULE.load(MODULE.MASTER))

    def test_packages_at_the_canonical_sitting_canvas_size(self) -> None:
        self.assertEqual(self.layer.size, (256, 384))
        self.assertIsNotNone(self.layer.getbbox())
        pixels = np.asarray(self.layer)
        self.assertFalse(np.any(pixels[pixels[..., 3] == 0, :3]))
        self.assertEqual(self._component_count(pixels[..., 3] > 24), 1)

    @staticmethod
    def _component_count(mask: np.ndarray) -> int:
        remaining = mask.copy()
        count = 0
        for row, col in zip(*np.where(remaining)):
            if not remaining[row, col]:
                continue
            count += 1
            queue = deque([(int(row), int(col))])
            remaining[row, col] = False
            while queue:
                current_row, current_col = queue.popleft()
                for row_delta, col_delta in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    next_row = current_row + row_delta
                    next_col = current_col + col_delta
                    if (
                        0 <= next_row < mask.shape[0]
                        and 0 <= next_col < mask.shape[1]
                        and remaining[next_row, next_col]
                    ):
                        remaining[next_row, next_col] = False
                        queue.append((next_row, next_col))
        return count

    def test_waist_contact_stays_within_the_straight_fit_envelope(self) -> None:
        alpha = np.asarray(self.layer)[..., 3] > 24
        top = np.asarray(
            MODULE.load(
                MODULE.MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
            )
        )[..., 3] > 24
        for row in range(283, 288):
            bottom_x = np.where(alpha[row])[0]
            top_x = np.where(top[row])[0]
            self.assertGreater(len(bottom_x), 0)
            self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
            self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)

    def test_hem_uses_narrow_side_contacts_and_keeps_shoe_tongues_visible(self) -> None:
        alpha = np.asarray(self.layer)[..., 3]
        shoe_image = MODULE.load(
            MODULE.MOTION / "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
        )
        shoes = np.asarray(shoe_image)[..., 3]
        overlap = int(((alpha > 24) & (shoes > 24)).sum())
        self.assertGreater(overlap, 80)
        self.assertLess(overlap, 260)
        self.assertFalse((alpha[329:338, 127:130] > 24).any())
        overlap_mask = (alpha > 24) & (shoes > 24)
        row_contacts = [int(overlap_mask[row].sum()) for row in range(329, 333)]
        self.assertTrue(all(left > right for left, right in zip(row_contacts, row_contacts[1:])))
        self.assertGreater(row_contacts[-1], 0)
        self.assertEqual(int(overlap_mask[333:335].sum()), 0)

        composite = np.asarray(MODULE.canonical_composite(self.layer))
        candidate = np.asarray(self.layer)
        shoe_pixels = np.asarray(shoe_image)
        for x in (96, 124, 132, 160):
            self.assertGreater(int(candidate[330, x, 3]), 220)
            color_delta = np.abs(
                composite[330, x, :3].astype(np.int16) - candidate[330, x, :3].astype(np.int16)
            )
            self.assertLessEqual(int(color_delta.max()), 1)
        for x in (110, 146):
            self.assertEqual(int(candidate[330, x, 3]), 0)
            color_delta = np.abs(
                composite[330, x, :3].astype(np.int16) - shoe_pixels[330, x, :3].astype(np.int16)
            )
            self.assertLessEqual(int(color_delta.max()), 1)

    def test_keeps_a_narrow_intentional_lower_inner_leg_gap(self) -> None:
        alpha = np.asarray(self.layer)[..., 3]
        self.assertFalse((alpha[329:338, 127:130] > 24).all())


if __name__ == "__main__":
    unittest.main()
