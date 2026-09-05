#!/usr/bin/env python3
"""TDD gates for the final ten male bottom sitting candidates."""

from collections import deque
import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).with_name("package_male_sitting_remaining_wave_v1.py")
SPEC = importlib.util.spec_from_file_location("remaining_sitting_wave", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageRemainingSittingWaveTests(unittest.TestCase):
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
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = current_row + dr, current_col + dc
                    if 0 <= nr < mask.shape[0] and 0 <= nc < mask.shape[1] and remaining[nr, nc]:
                        remaining[nr, nc] = False
                        queue.append((nr, nc))
        return count

    def test_each_candidate_is_atomic_clean_and_on_canonical_canvas(self) -> None:
        for profile in MODULE.PROFILES:
            with self.subTest(profile=profile.slug):
                layer = MODULE.build_candidate(profile)
                pixels = np.asarray(layer)
                alpha = pixels[..., 3] > 24
                self.assertEqual(layer.size, (256, 384))
                self.assertEqual(self._component_count(alpha), 1)
                self.assertFalse(np.any(pixels[pixels[..., 3] == 0, :3]))

    def test_each_waist_is_continuous_and_inside_the_neutral_top_contact(self) -> None:
        top = np.asarray(MODULE.load(MODULE.TOP))[..., 3] > 24
        for profile in MODULE.PROFILES:
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            with self.subTest(profile=profile.slug):
                for row in range(283, 288):
                    bottom_x = np.where(alpha[row])[0]
                    top_x = np.where(top[row])[0]
                    self.assertGreater(len(bottom_x), 35)
                    self.assertGreaterEqual(int(bottom_x.min()), int(top_x.min()) - 1)
                    self.assertLessEqual(int(bottom_x.max()), int(top_x.max()) + 1)

    def test_full_length_profiles_have_two_legs_opaque_pelvis_and_natural_shoe_contact(self) -> None:
        shoes = np.asarray(MODULE.load(MODULE.SHOES))[..., 3] > 24
        base = np.asarray(MODULE.load(MODULE.BASE))
        base_skin = (
            (base[..., 0] > 180)
            & (base[..., 0] > base[..., 1] + 20)
            & (base[..., 1] > base[..., 2] - 5)
        )
        rows, cols = np.indices(base_skin.shape)
        pelvis_window = (rows >= 294) & (rows <= 328) & (cols >= 122) & (cols <= 134)
        for profile in MODULE.PROFILES:
            if profile.is_short:
                continue
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            overlap = alpha & shoes
            with self.subTest(profile=profile.slug):
                self.assertGreaterEqual(int(alpha[316, 86:127].sum()), profile.min_thigh_pixels)
                self.assertGreaterEqual(int(alpha[316, 130:171].sum()), profile.min_thigh_pixels)
                self.assertTrue(alpha[306:329, 126:131].all())
                self.assertEqual(int(((~alpha) & base_skin & pelvis_window).sum()), 0)
                total = int(overlap.sum())
                self.assertGreater(total, profile.min_shoe_overlap)
                self.assertLess(total, profile.max_shoe_overlap)
                contacts = [int(overlap[row].sum()) for row in range(329, 334)]
                self.assertTrue(all(left > right for left, right in zip(contacts, contacts[1:])))
                self.assertGreater(contacts[-1], 0)
                self.assertEqual(int(overlap[334:].sum()), 0)
                self.assertFalse(alpha[329:338, 127:130].any())

    def test_short_profiles_end_above_lower_legs_and_keep_two_openings(self) -> None:
        for profile in MODULE.PROFILES:
            if not profile.is_short:
                continue
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            with self.subTest(profile=profile.slug):
                self.assertEqual(int(alpha[profile.short_clear_row :].sum()), 0)
                self.assertGreater(int(alpha[profile.short_probe_row, 90:127].sum()), 12)
                self.assertGreater(int(alpha[profile.short_probe_row, 130:167].sum()), 12)
                self.assertTrue(alpha[profile.short_probe_row : profile.short_gap_start, 127:130].all())
                self.assertFalse(alpha[profile.short_gap_start : profile.short_clear_row, 127:130].any())

    def test_short_profiles_keep_real_seated_front_volume_instead_of_brief_collapse(self) -> None:
        expected_minimum_end = {
            "sage_cuffed_shorts": 314,
            "relaxed_tailored_shorts": 313,
            "refined_utility_cargo_shorts": 314,
            "technical_sport_shorts": 311,
            "contemporary_resort_street_bottom": 314,
        }
        for profile in MODULE.PROFILES:
            if not profile.is_short:
                continue
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            end_row = expected_minimum_end[profile.slug]
            with self.subTest(profile=profile.slug):
                self.assertGreaterEqual(profile.short_clear_row, end_row)
                self.assertGreater(int(alpha[end_row - 2, 88:126].sum()), 8)
                self.assertGreater(int(alpha[end_row - 2, 131:169].sum()), 8)
                self.assertGreater(int(alpha[299:end_row, 86:126].sum()), 220)
                self.assertGreater(int(alpha[299:end_row, 131:171].sum()), 220)

    def test_high_cut_resort_and_technical_shorts_keep_seated_front_panels(self) -> None:
        for slug, end_row in (("contemporary_resort_street_bottom", 320), ("technical_sport_shorts", 318)):
            profile = next(item for item in MODULE.PROFILES if item.slug == slug)
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            with self.subTest(profile=slug):
                self.assertGreater(int(alpha[314:end_row, 91:126].sum()), 80)
                self.assertGreater(int(alpha[314:end_row, 130:165].sum()), 80)
                self.assertFalse(alpha[profile.short_gap_start:profile.short_clear_row, 127:130].any())

    def test_no_profile_contains_arm_or_sole_residue(self) -> None:
        rows, cols = np.indices((384, 256))
        for profile in MODULE.PROFILES:
            alpha = np.asarray(MODULE.build_candidate(profile))[..., 3] > 24
            side_arm = (rows >= 280) & (rows <= 326) & ((cols <= profile.arm_left) | (cols >= profile.arm_right))
            with self.subTest(profile=profile.slug):
                self.assertEqual(int((alpha & side_arm).sum()), 0)
                self.assertEqual(int(alpha[340:].sum()), 0)


if __name__ == "__main__":
    unittest.main()
