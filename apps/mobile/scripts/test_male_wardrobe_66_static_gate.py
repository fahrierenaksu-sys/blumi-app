from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("male_wardrobe_66_static_gate.py")


def load_module():
    spec = importlib.util.spec_from_file_location(
        "male_wardrobe_66_static_gate",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MaleWardrobe66StaticGateTests(unittest.TestCase):
    def _write_record(self, record: dict, directory: str) -> Path:
        path = Path(directory) / "static-record.json"
        path.write_text(json.dumps(record), encoding="utf-8")
        return path

    def test_current_gate_is_hash_bound_and_reports_verified_runtime_promotion(
        self,
    ) -> None:
        module = load_module()
        report = module.build_static_gate_report()

        self.assertEqual(66, report["itemCount"])
        self.assertEqual(
            "RUNTIME_PROMOTED_FINAL_SIMULATOR_VERIFIED",
            report["status"],
        )
        self.assertTrue(report["motionGenerationEligible"])
        self.assertFalse(report["runtimePromotionEligible"])
        self.assertTrue(report["runtimePromotionVerified"])
        self.assertTrue(report["boardHashMatches"])
        self.assertTrue(report["selectionHashMatches"])
        self.assertEqual("PASS", report["independentStaticReview"])

        pixel_heart = next(
            item
            for item in report["items"]
            if item["slug"] == "pixel_heart_boxy_tee"
        )
        self.assertTrue(pixel_heart["runtimeMatchesApprovedDerivative"])
        self.assertEqual(0, pixel_heart["runtimeNeckCenterAlpha"])
        self.assertEqual(0, pixel_heart["selectedNeckCenterAlpha"])

    def test_any_missing_or_stale_motion_runtime_fails_promotion_evidence(
        self,
    ) -> None:
        module = load_module()
        record = json.loads(module.DEFAULT_RECORD.read_text(encoding="utf-8"))
        original_sha256 = module._sha256
        stale_suffix = (
            "room_avatar_top_male_cream_basic_tee_v1_"
            "walking_front_f04.png"
        )

        def stale_one_motion(path: Path) -> str:
            if path.as_posix().endswith(stale_suffix):
                return "0" * 64
            return original_sha256(path)

        with patch.object(module, "_sha256", side_effect=stale_one_motion):
            valid, hashes = module._runtime_promotion_hashes(record)

        self.assertFalse(valid)
        self.assertEqual({}, hashes)

    def test_explicit_static_approval_opens_motion_only_not_runtime_promotion(
        self,
    ) -> None:
        module = load_module()
        record = json.loads(module.DEFAULT_RECORD.read_text(encoding="utf-8"))
        approved = {
            **copy.deepcopy(record),
            "userApproved": True,
            "motionGenerated": False,
            "runtimePromoted": False,
        }
        approved.pop("runtimePromotionEvidence", None)

        with tempfile.TemporaryDirectory() as temporary_directory:
            approved_path = Path(temporary_directory) / "approved-record.json"
            approved_path.write_text(
                json.dumps(approved),
                encoding="utf-8",
            )
            report = module.build_static_gate_report(
                record_path=approved_path,
            )

        self.assertEqual(
            "STATIC_APPROVED_MOTION_NOT_YET_GENERATED",
            report["status"],
        )
        self.assertTrue(report["motionGenerationEligible"])
        self.assertFalse(report["runtimePromotionEligible"])
        self.assertFalse(report["runtimePromotionVerified"])

    def test_catalog_or_candidate_manifest_hash_drift_fails_closed(self) -> None:
        module = load_module()
        original = json.loads(module.DEFAULT_RECORD.read_text(encoding="utf-8"))

        for contract_name in ("catalog", "candidateManifest"):
            with self.subTest(contract_name=contract_name):
                drifted = copy.deepcopy(original)
                drifted["userApproved"] = True
                drifted["contracts"][contract_name]["sha256"] = "0" * 64
                with tempfile.TemporaryDirectory() as temporary_directory:
                    path = self._write_record(drifted, temporary_directory)
                    report = module.build_static_gate_report(record_path=path)
                self.assertEqual(
                    "BLOCKED_STATIC_EVIDENCE_DRIFT",
                    report["status"],
                )
                self.assertFalse(report["motionGenerationEligible"])

    def test_record_item_set_must_match_the_authoritative_live_66(self) -> None:
        module = load_module()
        original = json.loads(module.DEFAULT_RECORD.read_text(encoding="utf-8"))
        duplicate = copy.deepcopy(original)
        duplicate["items"][1] = copy.deepcopy(duplicate["items"][0])

        with tempfile.TemporaryDirectory() as temporary_directory:
            path = self._write_record(duplicate, temporary_directory)
            with self.assertRaisesRegex(
                ValueError,
                "authoritative live 66",
            ):
                module.build_static_gate_report(record_path=path)

    def test_all_eight_independent_review_gates_are_required(self) -> None:
        module = load_module()
        original = json.loads(module.DEFAULT_RECORD.read_text(encoding="utf-8"))
        incomplete = copy.deepcopy(original)
        incomplete["userApproved"] = True
        incomplete["independentStaticReview"]["gates"].pop("topFit")

        with tempfile.TemporaryDirectory() as temporary_directory:
            path = self._write_record(incomplete, temporary_directory)
            report = module.build_static_gate_report(record_path=path)

        self.assertEqual(
            "BLOCKED_STATIC_EVIDENCE_DRIFT",
            report["status"],
        )
        self.assertEqual("FAIL", report["independentStaticReview"])
        self.assertFalse(report["motionGenerationEligible"])


if __name__ == "__main__":
    unittest.main()
