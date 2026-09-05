#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name(
    "produce_monochrome_street_tailoring_motion_v2.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_monochrome_street_tailoring_motion_v2",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load monochrome motion producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MonochromeStreetTailoringMotionV2Tests(unittest.TestCase):
    def test_exact_static_user_approval_unlocks_motion(self) -> None:
        module = load_module()
        approval, receipt_sha256 = module.verify_static_approval()

        self.assertTrue(approval["explicitUserApproval"])
        self.assertEqual("onaylıyorum", approval["userApprovalMessage"])
        self.assertEqual(module.STATIC_SHA256, module.sha256(module.STATIC))
        self.assertEqual(receipt_sha256, module.sha256(module.STATIC_APPROVAL))

    def test_w1_is_pixel_identical_to_approved_static(self) -> None:
        module = load_module()
        frames = module.build_frames()
        static = np.asarray(module.load_rgba(module.STATIC))

        self.assertTrue(
            np.array_equal(static, np.asarray(frames["walking_front_f01"]))
        )

    def test_motion_keeps_waist_and_crotch_hinge_pixel_locked(self) -> None:
        module = load_module()
        frames = module.build_frames()
        static = np.asarray(module.load_rgba(module.STATIC))

        for pose, frame in frames.items():
            self.assertTrue(
                np.array_equal(
                    static[: module.HINGE_Y],
                    np.asarray(frame)[: module.HINGE_Y],
                ),
                pose,
            )

    def test_each_leg_tracks_approved_shoe_without_covering_toe(self) -> None:
        module = load_module()
        frames = module.build_frames()
        shoes, _, _ = module.load_approved_shoes()

        for pose, frame in frames.items():
            leg_boxes = module.lower_leg_boxes(frame)
            shoe_boxes = module.two_component_boxes(shoes[pose])
            self.assertEqual(2, len(leg_boxes), pose)
            self.assertEqual(2, len(shoe_boxes), pose)

            for leg_box, shoe_box in zip(leg_boxes, shoe_boxes):
                leg_center = (leg_box[0] + leg_box[2]) / 2
                shoe_center = (shoe_box[0] + shoe_box[2]) / 2
                self.assertLessEqual(abs(leg_center - shoe_center), 3.0, pose)
                overlap_depth = (
                    12
                    if pose == "walking_front_f01"
                    else module.MOTION_SHOE_OVERLAP_DEPTH
                )
                self.assertLessEqual(
                    abs(leg_box[3] - (shoe_box[1] + overlap_depth)),
                    2,
                    pose,
                )

            pant_alpha = np.asarray(frame.getchannel("A"))
            shoe_alpha = np.asarray(shoes[pose].getchannel("A"))
            overlap = (pant_alpha > 16) & (shoe_alpha > 16)
            visible_shoe = (shoe_alpha > 16) & (pant_alpha <= 16)
            overlap_pixels = int(np.count_nonzero(overlap))
            shoe_pixels = int(np.count_nonzero(shoe_alpha > 16))
            self.assertGreaterEqual(overlap_pixels, 120, pose)
            self.assertLessEqual(overlap_pixels / shoe_pixels, 0.35, pose)
            self.assertGreaterEqual(int(np.count_nonzero(visible_shoe)), 450, pose)

    def test_all_frames_keep_clean_rgba_and_two_readable_legs(self) -> None:
        module = load_module()
        frames = module.build_frames()

        for pose, frame in frames.items():
            self.assertEqual((256, 384), frame.size)
            self.assertEqual("RGBA", frame.mode)
            pixels = np.asarray(frame)
            alpha = pixels[..., 3]
            self.assertEqual(0, int(np.count_nonzero(pixels[alpha == 0, :3])), pose)
            boxes = module.lower_leg_boxes(frame)
            self.assertEqual(2, len(boxes), pose)
            self.assertGreater(boxes[1][0] - boxes[0][2], 0, pose)

    def test_sitting_spreads_legs_outward_from_static(self) -> None:
        module = load_module()
        frames = module.build_frames()
        static_boxes = module.lower_leg_boxes(frames["walking_front_f01"])
        sitting_boxes = module.lower_leg_boxes(frames["sitting_front_f01"])

        self.assertLessEqual(sitting_boxes[0][0], static_boxes[0][0] - 3)
        self.assertGreaterEqual(sitting_boxes[1][2], static_boxes[1][2] + 3)

    def test_render_is_candidate_only_and_emits_review_artifacts(self) -> None:
        module = load_module()
        runtime_before = module.tree_sha256(module.ROOM)
        outputs = module.render()
        runtime_after = module.tree_sha256(module.ROOM)

        self.assertEqual(runtime_before, runtime_after)
        self.assertTrue(all(path.is_file() for path in outputs))
        with Image.open(module.APPROVAL_CHECKER) as checker:
            self.assertEqual((2000, 1300), checker.size)
        with Image.open(module.APPROVAL_BLACK) as black:
            self.assertEqual((2000, 1300), black.size)
        with Image.open(module.WALK_GIF) as preview:
            self.assertEqual(4, preview.n_frames)
            for frame_index in range(preview.n_frames):
                preview.seek(frame_index)
                rgb = preview.convert("RGB")
                self.assertEqual(
                    (255, 249, 252),
                    rgb.getpixel((0, 100)),
                    f"walk GIF frame {frame_index} lost its evidence background",
                )

        manifest = json.loads(module.MANIFEST.read_text())
        self.assertTrue(manifest["candidateOnly"])
        self.assertFalse(manifest["runtimePromoted"])
        self.assertEqual(
            module.sha256(module.STATIC_APPROVAL),
            manifest["staticApprovalReceiptSha256"],
        )
        self.assertEqual(
            module.sha256(module.SHOE_APPROVAL),
            manifest["shoeApprovalReceiptSha256"],
        )
        self.assertEqual(
            manifest["runtimeRoomTreeSha256Before"],
            manifest["runtimeRoomTreeSha256After"],
        )
        self.assertEqual(5, len(manifest["frames"]))
        shoe_approval = json.loads(module.SHOE_APPROVAL.read_text())
        approved_shoe_hashes = shoe_approval["styles"]["milk_tea_court"]
        for pose, frame_record in manifest["frames"].items():
            self.assertEqual(
                module.sha256(module.REPO / frame_record["path"]),
                frame_record["sha256"],
                pose,
            )
            approval_key = "static" if pose == "walking_front_f01" else pose
            self.assertEqual(
                approved_shoe_hashes[approval_key],
                frame_record["approvedShoeSha256"],
                pose,
            )
        for relative_path, expected_hash in manifest["evidence"].items():
            self.assertEqual(
                expected_hash,
                module.sha256(module.REPO / relative_path),
                relative_path,
            )

        first_frame_records = manifest["frames"]
        first_evidence_records = manifest["evidence"]
        module.render()
        rerendered_manifest = json.loads(module.MANIFEST.read_text())
        self.assertEqual(first_frame_records, rerendered_manifest["frames"])
        self.assertEqual(first_evidence_records, rerendered_manifest["evidence"])


if __name__ == "__main__":
    unittest.main()
