from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "apps/mobile/scripts/promote_male_shoes_v7.py"


def load_module():
    spec = importlib.util.spec_from_file_location("promote_male_shoes_v7", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_rgba(path: Path, seed: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (256, 384), (seed, seed * 2 % 255, seed * 3 % 255, 255)).save(
        path
    )


class PromoteMaleShoesV7Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def fixture_plan(self, root: Path, style_count: int = 2):
        styles = tuple(f"shoe_{index}" for index in range(style_count))
        states = self.module.STATES
        plan = []
        for style_index, style in enumerate(styles):
            for state_index, state in enumerate(states):
                source = root / "source" / style / f"{state}.png"
                destination = root / "runtime" / style / f"{state}.png"
                write_rgba(source, 10 + style_index * 20 + state_index)
                write_rgba(destination, 90 + style_index * 20 + state_index)
                plan.append(
                    self.module.PromotionEntry(
                        style=style,
                        state=state,
                        source=source,
                        destination=destination,
                    )
                )
        return tuple(plan)

    def fixture_receipt(self, root: Path, plan):
        evidence_path = root / "evidence.png"
        write_rgba(evidence_path, 7)
        style_hashes = {}
        for entry in plan:
            style_hashes.setdefault(entry.style, {})[entry.state] = sha256(entry.source)
        return {
            "schemaVersion": 1,
            "verdict": "PASS",
            "approvalScope": "male_shoes_v7_static_and_4w1s",
            "explicitUserApproval": True,
            "userApprovalMessage": "onayladım",
            "approvedAt": "2026-07-28T00:00:00+03:00",
            "producer": "root",
            "independentReviewer": "shoe_visual_matrix_review_v7",
            "independentReviewVerdict": "PASS",
            "styles": style_hashes,
            "evidence": [
                {
                    "path": evidence_path.relative_to(root).as_posix(),
                    "sha256": sha256(evidence_path),
                }
            ],
        }

    def test_production_plan_is_exactly_eight_styles_by_six_states(self) -> None:
        plan = self.module.create_promotion_plan()
        self.assertEqual(len(plan), 48)
        self.assertEqual({entry.style for entry in plan}, set(self.module.STYLES))
        self.assertEqual({entry.state for entry in plan}, set(self.module.STATES))
        self.assertEqual(len({entry.destination for entry in plan}), 48)
        for style in self.module.STYLES:
            self.assertEqual(
                {entry.state for entry in plan if entry.style == style},
                set(self.module.STATES),
            )
            for entry in (item for item in plan if item.style == style):
                expected_source = (
                    self.module.resolve_roots().candidate_static_root
                    / style
                    / "rig/static-review-v7.png"
                    if entry.state == "static"
                    else self.module.resolve_roots().candidate_motion_root
                    / style
                    / f"room_avatar_shoes_male_{style}_v1_{entry.state}.png"
                )
                expected_destination = (
                    self.module.resolve_roots().room_root
                    / f"avatar_room_shoes_male_{style}_v1.png"
                    if entry.state == "static"
                    else self.module.resolve_roots().motion_root
                    / f"room_avatar_shoes_male_{style}_v1_{entry.state}.png"
                )
                self.assertEqual(entry.source, expected_source)
                self.assertEqual(entry.destination, expected_destination)

    def test_receipt_is_hash_bound_and_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            plan = self.fixture_plan(root)
            receipt = self.fixture_receipt(root, plan)
            self.assertTrue(
                self.module.validate_approval_receipt(receipt, plan, root)
            )

            wrong_decision = {**receipt, "verdict": "HOLD"}
            with self.assertRaisesRegex(ValueError, "verdict"):
                self.module.validate_approval_receipt(wrong_decision, plan, root)

            no_explicit_approval = {**receipt, "explicitUserApproval": False}
            with self.assertRaisesRegex(ValueError, "explicit user approval"):
                self.module.validate_approval_receipt(
                    no_explicit_approval,
                    plan,
                    root,
                )

            write_rgba(plan[0].source, 222)
            with self.assertRaisesRegex(ValueError, "source hash mismatch"):
                self.module.validate_approval_receipt(receipt, plan, root)

    def test_real_gate_rejects_a_handcrafted_misrouted_plan(self) -> None:
        roots = self.module.resolve_roots()
        plan = list(self.module.create_promotion_plan(roots))
        plan[0] = plan[0]._replace(
            destination=roots.room_root / "avatar_room_shoes_male_wrong_v1.png"
        )
        receipt = json.loads(roots.approval_path.read_text(encoding="utf-8"))
        report = self.module.inspect_promotion(
            plan=tuple(plan),
            receipt=receipt,
            repository_root=roots.repository_root,
        )
        self.assertFalse(report.ready)
        self.assertRegex(
            "\n".join(report.errors),
            "canonical candidate-to-runtime mapping",
        )

    def test_inspection_is_read_only_and_reports_differences(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            plan = self.fixture_plan(root)
            receipt = self.fixture_receipt(root, plan)
            before = {entry.destination: sha256(entry.destination) for entry in plan}
            report = self.module.inspect_promotion(
                plan=plan,
                receipt=receipt,
                repository_root=root,
            )
            self.assertTrue(report.ready)
            self.assertEqual(report.changed, len(plan))
            self.assertEqual(report.unchanged, 0)
            self.assertEqual(
                before,
                {entry.destination: sha256(entry.destination) for entry in plan},
            )

    def test_atomic_promotion_is_idempotent_and_rolls_back_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            plan = self.fixture_plan(root)
            receipt = self.fixture_receipt(root, plan)
            before = {entry.destination: sha256(entry.destination) for entry in plan}

            with self.assertRaisesRegex(RuntimeError, "injected install failure"):
                self.module.promote_with_rollback(
                    plan=plan,
                    receipt=receipt,
                    repository_root=root,
                    fail_after_install=3,
                    enforce_clean_targets=False,
                )
            self.assertEqual(
                before,
                {entry.destination: sha256(entry.destination) for entry in plan},
            )

            result = self.module.promote_with_rollback(
                plan=plan,
                receipt=receipt,
                repository_root=root,
                enforce_clean_targets=False,
            )
            self.assertEqual(result.promoted, len(plan))
            self.assertEqual(result.unchanged, 0)
            self.assertTrue(
                self.module.check_promoted(
                    plan=plan,
                    receipt=receipt,
                    repository_root=root,
                ).ok
            )
            second = self.module.promote_with_rollback(
                plan=plan,
                receipt=receipt,
                repository_root=root,
                enforce_clean_targets=False,
            )
            self.assertEqual(second.promoted, 0)
            self.assertEqual(second.unchanged, len(plan))

    def test_dirty_or_untracked_runtime_targets_block_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            subprocess.run(
                ("git", "init", "--quiet"),
                cwd=root,
                check=True,
            )
            plan = self.fixture_plan(root, style_count=1)
            receipt = self.fixture_receipt(root, plan)
            tracked = [entry.destination for entry in plan[:-1]]
            subprocess.run(
                ("git", "add", "--", *(str(path.relative_to(root)) for path in tracked)),
                cwd=root,
                check=True,
            )
            subprocess.run(
                (
                    "git",
                    "-c",
                    "user.name=Codex Test",
                    "-c",
                    "user.email=codex@example.invalid",
                    "commit",
                    "--quiet",
                    "-m",
                    "fixture",
                ),
                cwd=root,
                check=True,
            )
            write_rgba(tracked[0], 231)

            dirty = self.module.dirty_target_paths(root, plan)
            self.assertIn(tracked[0], dirty)
            self.assertIn(plan[-1].destination, dirty)
            before = {entry.destination: sha256(entry.destination) for entry in plan}
            with self.assertRaisesRegex(ValueError, "dirty or untracked runtime"):
                self.module.promote_with_rollback(
                    plan=plan,
                    receipt=receipt,
                    repository_root=root,
                    enforce_clean_targets=True,
                )
            self.assertEqual(
                before,
                {entry.destination: sha256(entry.destination) for entry in plan},
            )

    def test_real_approval_receipt_binds_all_approved_sources_and_evidence(self) -> None:
        roots = self.module.resolve_roots()
        receipt = json.loads(roots.approval_path.read_text(encoding="utf-8"))
        plan = self.module.create_promotion_plan(roots)
        self.assertTrue(
            self.module.validate_approval_receipt(
                receipt,
                plan,
                roots.repository_root,
            )
        )
        for entry in plan:
            with Image.open(entry.source) as image:
                self.assertEqual(image.size, (256, 384))
                self.assertEqual(image.mode, "RGBA")


if __name__ == "__main__":
    unittest.main()
