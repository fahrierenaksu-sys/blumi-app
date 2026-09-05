from __future__ import annotations

import hashlib
import importlib.util
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "apps/mobile/scripts/produce_male_shoes_v7_motion.py"
OUTPUT_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/shoes-motion-v7"
)
CANDIDATE_ROOT = (
    REPO_ROOT
    / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates/shoes"
)
RUNTIME_MOTION_ROOT = (
    REPO_ROOT / "apps/mobile/src/features/avatarV2/assets/room/motion"
)

STYLES = (
    "chunky_skate_sneakers",
    "cloud_white_trainers",
    "cocoa_penny_loafers",
    "dusty_blue_canvas_sneakers",
    "lightweight_trail_sneakers",
    "milk_tea_court",
    "retro_colorblock_runner",
    "suede_penny_mules",
)
POSES = (
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
)


def load_module():
    spec = importlib.util.spec_from_file_location("produce_male_shoes_v7_motion", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def frame_path(style: str, pose: str) -> Path:
    return OUTPUT_ROOT / style / f"room_avatar_shoes_male_{style}_v1_{pose}.png"


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        if source.mode != "RGBA":
            raise AssertionError(f"{path} must be RGBA, got {source.mode}")
        return source.copy()


def alpha_components(image: Image.Image, threshold: int = 16) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A").load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if alpha[x, y] <= threshold or (x, y) in visited:
                continue
            queue = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.pop()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < image.width and 0 <= next_y < image.height):
                        continue
                    if alpha[next_x, next_y] <= threshold or (next_x, next_y) in visited:
                        continue
                    visited.add((next_x, next_y))
                    queue.append((next_x, next_y))
            components.append(component)
    return sorted(components, key=len, reverse=True)


def component_box(component: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    return (
        min(x for x, _ in component),
        min(y for _, y in component),
        max(x for x, _ in component) + 1,
        max(y for _, y in component) + 1,
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class MaleShoesV7MotionContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()
        cls.runtime_before = tree_hashes(RUNTIME_MOTION_ROOT)
        cls.module.main()
        cls.runtime_after = tree_hashes(RUNTIME_MOTION_ROOT)

    def test_candidate_only_output_never_targets_runtime(self) -> None:
        self.assertFalse(OUTPUT_ROOT.is_relative_to(RUNTIME_MOTION_ROOT))
        self.assertEqual(Path(self.module.OUTPUT_ROOT).resolve(), OUTPUT_ROOT.resolve())
        self.assertFalse(
            any(
                path.resolve().is_relative_to(RUNTIME_MOTION_ROOT.resolve())
                for path in self.module.production_outputs()
            )
        )
        self.assertEqual(
            self.runtime_after,
            self.runtime_before,
            "candidate producer must leave every runtime motion byte unchanged",
        )

    def test_fragment_guard_rejects_real_tears_instead_of_hiding_them(self) -> None:
        torn = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
        draw = ImageDraw.Draw(torn)
        draw.rectangle((100, 330, 110, 340), fill=(50, 50, 50, 255))
        draw.rectangle((130, 330, 140, 340), fill=(50, 50, 50, 255))
        draw.rectangle((150, 330, 154, 334), fill=(50, 50, 50, 255))
        with self.assertRaisesRegex(ValueError, "detached visible fragment"):
            self.module.validate_visible_components(torn)

    def test_all_eight_styles_have_canonical_4w_plus_1s_frames(self) -> None:
        for style in STYLES:
            for pose in POSES:
                path = frame_path(style, pose)
                self.assertGreater(path.stat().st_size, 0, path.name)
                image = load_rgba(path)
                self.assertEqual(image.size, (256, 384), path.name)

    def test_f01_is_the_exact_user_approved_v7_static(self) -> None:
        for style in STYLES:
            source = CANDIDATE_ROOT / style / "rig/static-review-v7.png"
            output = frame_path(style, "walking_front_f01")
            self.assertEqual(sha256(output), sha256(source), style)
            self.assertIsNone(
                ImageChops.difference(load_rgba(output), load_rgba(source)).getbbox(),
                style,
            )

    def test_every_frame_has_two_clean_shoe_components(self) -> None:
        for style in STYLES:
            for pose in POSES:
                image = load_rgba(frame_path(style, pose))
                components = alpha_components(image)
                self.assertEqual(
                    len(components),
                    2,
                    f"{style} {pose}: {[len(component) for component in components]}",
                )
                self.assertTrue(
                    all(len(component) >= 120 for component in components),
                    f"{style} {pose}",
                )

    def test_pose_centers_and_baselines_follow_canonical_feet(self) -> None:
        expected = self.module.CANONICAL_FOOT_BOXES
        for style in STYLES:
            for pose in POSES:
                image = load_rgba(frame_path(style, pose))
                boxes = sorted(
                    (component_box(component) for component in alpha_components(image)),
                    key=lambda box: box[0],
                )
                for actual, canonical in zip(boxes, expected[pose]):
                    actual_center_x = (actual[0] + actual[2]) / 2
                    canonical_center_x = (canonical[0] + canonical[2]) / 2
                    actual_center_y = (actual[1] + actual[3]) / 2
                    canonical_center_y = (canonical[1] + canonical[3]) / 2
                    self.assertLessEqual(
                        abs(actual_center_x - canonical_center_x),
                        4.0,
                        f"{style} {pose} horizontal anchor",
                    )
                    self.assertLessEqual(
                        abs(actual_center_y - canonical_center_y),
                        2.0,
                        f"{style} {pose} vertical anchor",
                    )
                    self.assertLessEqual(
                        abs(actual[3] - canonical[3]),
                        1,
                        f"{style} {pose} baseline",
                    )

    def test_each_shoe_has_real_pants_overlap_without_detached_contact(self) -> None:
        for style in STYLES:
            for pose in POSES:
                shoes = load_rgba(frame_path(style, pose))
                pants = load_rgba(
                    RUNTIME_MOTION_ROOT
                    / f"room_avatar_bottom_male_navy_straight_pants_v1_{pose}.png"
                )
                shoe_components = sorted(
                    alpha_components(shoes),
                    key=lambda component: component_box(component)[0],
                )
                pants_alpha = pants.getchannel("A")
                for index, component in enumerate(shoe_components):
                    overlap = sum(
                        1 for x, y in component if pants_alpha.getpixel((x, y)) > 16
                    )
                    visible = sum(
                        1 for x, y in component if pants_alpha.getpixel((x, y)) <= 16
                    )
                    self.assertGreaterEqual(
                        overlap,
                        35,
                        f"{style} {pose} shoe {index} pants contact",
                    )
                    self.assertGreaterEqual(
                        visible,
                        45,
                        f"{style} {pose} shoe {index} visible upper/toe",
                    )

    def test_walk_cycle_is_pose_specific_without_style_collapse(self) -> None:
        for style in STYLES:
            walking_hashes = {
                sha256(frame_path(style, pose))
                for pose in POSES
                if pose.startswith("walking")
            }
            self.assertEqual(len(walking_hashes), 4, style)

        for pose in POSES:
            silhouettes = []
            for style in STYLES:
                alpha = load_rgba(frame_path(style, pose)).getchannel("A")
                silhouettes.append(hashlib.sha256(alpha.tobytes()).hexdigest())
            self.assertGreaterEqual(
                len(set(silhouettes)),
                6,
                f"{pose}: product silhouettes collapsed",
            )

    def test_transparency_is_clean_and_has_no_chroma_fringe(self) -> None:
        for style in STYLES:
            for pose in POSES:
                image = load_rgba(frame_path(style, pose))
                source = load_rgba(CANDIDATE_ROOT / style / "rig/static-review-v7.png")
                residue = 0
                fringe = 0
                for red, green, blue, alpha in image.getdata():
                    if alpha == 0 and (red or green or blue):
                        residue += 1
                    if 10 < alpha < 240 and green > red + 12 and green > blue + 12:
                        fringe += 1
                source_residue = sum(
                    1
                    for red, green, blue, alpha in source.getdata()
                    if alpha == 0 and (red or green or blue)
                )
                source_fringe = sum(
                    1
                    for red, green, blue, alpha in source.getdata()
                    if 10 < alpha < 240 and green > red + 12 and green > blue + 12
                )
                expected_residue = source_residue if pose == "walking_front_f01" else 0
                self.assertEqual(residue, expected_residue, f"{style} {pose} RGB residue")
                expected_fringe = source_fringe if pose == "walking_front_f01" else 0
                self.assertEqual(fringe, expected_fringe, f"{style} {pose} chroma fringe")

    def test_review_artifacts_and_manifest_cover_exactly_40_frames(self) -> None:
        expected = {
            frame_path(style, pose).relative_to(OUTPUT_ROOT).as_posix()
            for style in STYLES
            for pose in POSES
        }
        manifest = OUTPUT_ROOT / "shoes-motion-v7-manifest.sha256"
        entries = manifest.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(entries), 40)
        for entry in entries:
            expected_hash, relative_path = entry.split("  ", 1)
            self.assertIn(relative_path, expected)
            self.assertEqual(
                sha256(OUTPUT_ROOT / relative_path),
                expected_hash,
                relative_path,
            )
            expected.remove(relative_path)
        self.assertFalse(expected)

        for name in (
            "shoes-motion-v7-4w1s-approval.png",
            "shoes-motion-v7-walk-preview.gif",
            "shoes-motion-v7-hem-closeups-checkerboard.png",
            "shoes-motion-v7-hem-closeups-black.png",
            "shoes-motion-v7-qa-evidence.md",
        ):
            self.assertGreater((OUTPUT_ROOT / name).stat().st_size, 0, name)

        with Image.open(OUTPUT_ROOT / "shoes-motion-v7-walk-preview.gif") as preview:
            self.assertEqual(preview.n_frames, 4)
            self.assertEqual(preview.info.get("duration"), 120)


if __name__ == "__main__":
    unittest.main()
