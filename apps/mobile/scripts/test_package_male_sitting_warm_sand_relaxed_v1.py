#!/usr/bin/env python3
"""Contract tests for the seated Warm Sand relaxed-pants candidate."""

from __future__ import annotations

import unittest
from collections import deque

import numpy as np

import package_male_sitting_warm_sand_relaxed_v1 as subject


class WarmSandRelaxedSittingPackageTests(unittest.TestCase):
    @staticmethod
    def _component_sizes(mask: np.ndarray) -> list[int]:
        seen = np.zeros_like(mask, dtype=bool)
        sizes: list[int] = []
        for y, x in zip(*np.where(mask & ~seen)):
            if seen[y, x]:
                continue
            queue = deque([(int(y), int(x))])
            seen[y, x] = True
            size = 0
            while queue:
                row, col = queue.popleft()
                size += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    next_row, next_col = row + dy, col + dx
                    if (
                        0 <= next_row < mask.shape[0]
                        and 0 <= next_col < mask.shape[1]
                        and mask[next_row, next_col]
                        and not seen[next_row, next_col]
                    ):
                        seen[next_row, next_col] = True
                        queue.append((next_row, next_col))
            sizes.append(size)
        return sorted(sizes, reverse=True)

    def test_master_is_the_expected_full_on_base_source(self) -> None:
        self.assertTrue(subject.MASTER.is_file())
        self.assertEqual(subject.load(subject.MASTER).size, (1024, 1536))

    def test_candidate_is_a_clean_256_by_384_transparent_layer(self) -> None:
        candidate = np.asarray(subject.build_candidate())
        self.assertEqual(candidate.shape, (384, 256, 4))
        self.assertFalse(np.any(candidate[candidate[..., 3] == 0, :3]))
        self.assertEqual(len(self._component_sizes(candidate[..., 3] > 24)), 1)

    def test_candidate_keeps_waist_contact_and_limits_shoe_overlap_to_the_cuffs(self) -> None:
        candidate = np.asarray(subject.build_candidate())
        alpha = candidate[..., 3] > 24
        self.assertGreater(int(alpha[294:300].sum()), 42)
        top = np.asarray(
            subject.load(
                subject.MOTION / "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
            )
        )[..., 3] > 24
        for row in range(285, 290):
            bottom_x = np.where(alpha[row])[0]
            top_x = np.where(top[row])[0]
            self.assertGreater(len(bottom_x), 0)
            self.assertGreater(len(top_x), 0)
            self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
            self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)
        shoes = np.asarray(subject.load(subject.SHOES))[..., 3] > 24
        overlap = int((alpha & shoes).sum())
        self.assertGreater(overlap, 100)
        self.assertLess(overlap, 800)
        self.assertGreaterEqual(int(alpha[334].sum()), 38)

    def test_candidate_does_not_bake_canonical_sitting_arms_into_the_bottom_layer(self) -> None:
        candidate = np.asarray(subject.build_candidate())
        alpha = candidate[..., 3] > 24
        rows, cols = np.indices(alpha.shape)
        side_arm_zone = (rows >= 280) & (rows <= 326) & ((cols <= 91) | (cols >= 164))
        self.assertEqual(int((alpha & side_arm_zone).sum()), 0)

    def test_cuffs_overlap_only_the_shoe_sides_and_leave_the_tongues_visible(self) -> None:
        candidate = subject.build_candidate()
        candidate_pixels = np.asarray(candidate)
        composite = np.asarray(subject._compose(candidate))
        shoes = np.asarray(subject.load(subject.SHOES))

        for x in (96, 160):
            self.assertGreater(int(candidate_pixels[334, x, 3]), 220)
            self.assertTrue(np.array_equal(composite[334, x, :3], candidate_pixels[334, x, :3]))

        for x in (110, 146):
            self.assertEqual(int(candidate_pixels[334, x, 3]), 0)
            self.assertTrue(np.array_equal(composite[334, x, :3], shoes[334, x, :3]))


if __name__ == "__main__":
    unittest.main()
