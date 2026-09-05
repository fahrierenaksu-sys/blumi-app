import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from promote_male_wardrobe_66_runtime import (
    MOTION_STATES,
    _refresh_records,
    build_promotion_plan,
    normalize_transparent_rgb,
    runtime_destination,
    validate_delete_plan,
    validate_promotion_plan,
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PromoteMaleWardrobe66RuntimeTest(unittest.TestCase):
    def test_runtime_png_zeroes_hidden_rgb_without_touching_visible_art(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "candidate.png"
            runtime = root / "runtime.png"
            image = Image.new("RGBA", (2, 1))
            image.putdata(((12, 34, 56, 0), (90, 80, 70, 255)))
            image.save(source)
            source_hash = digest(source)

            result = normalize_transparent_rgb(source, runtime)

            self.assertEqual(digest(source), source_hash)
            self.assertEqual(result["clearedPixelCount"], 1)
            with Image.open(runtime) as promoted:
                self.assertEqual(
                    list(promoted.convert("RGBA").getdata()),
                    [(0, 0, 0, 0), (90, 80, 70, 255)],
                )

    def test_runtime_destinations_are_exact_and_category_aware(self):
        root = Path("/repo")
        self.assertEqual(
            runtime_destination(root, "hair", "soft_crop", "static"),
            root
            / "apps/mobile/src/features/avatarV2/assets/room/"
            "avatar_room_hair_front_male_soft_crop_v1.png",
        )
        self.assertEqual(
            runtime_destination(
                root, "accessory", "soft_beanie", "walking_front_f02"
            ),
            root
            / "apps/mobile/src/features/avatarV2/assets/room/motion/"
            "room_avatar_accessory_male_soft_beanie_v1_walking_front_f02.png",
        )

    def test_plan_is_hash_bound_and_rejects_missing_motion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            static = root / "candidate-static.png"
            static.write_bytes(b"static")
            states = {
                "static": {
                    "path": static.relative_to(root).as_posix(),
                    "actualSha256": digest(static),
                    "status": "CANDIDATE_VERIFIED",
                }
            }
            record = {
                "itemCount": 1,
                "items": [
                    {
                        "category": "top",
                        "slug": "cream_tee",
                        "layerPath": static.relative_to(root).as_posix(),
                        "layerSha256": digest(static),
                    }
                ],
            }
            plan = build_promotion_plan(root, record, {"cream_tee": states})
            errors = validate_promotion_plan(plan, expected_item_count=1)
            for state in MOTION_STATES:
                self.assertTrue(
                    any(f"cream_tee/{state}" in error for error in errors)
                )

    def test_plan_rejects_path_traversal_even_with_matching_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root.parent / "outside-candidate.png"
            outside.write_bytes(b"outside")
            try:
                states = {
                    state: {
                        "path": outside.as_posix(),
                        "actualSha256": digest(outside),
                        "status": "CANDIDATE_VERIFIED",
                    }
                    for state in ("static", *MOTION_STATES)
                }
                record = {
                    "itemCount": 1,
                    "items": [
                        {
                            "category": "top",
                            "slug": "cream_tee",
                            "layerPath": outside.as_posix(),
                            "layerSha256": digest(outside),
                        }
                    ],
                }
                plan = build_promotion_plan(root, record, {"cream_tee": states})
                errors = validate_promotion_plan(plan, expected_item_count=1)
                self.assertTrue(any("outside repository" in e for e in errors))
            finally:
                outside.unlink(missing_ok=True)

    def test_delete_plan_rejects_any_promoted_destination_overlap(self):
        destination = Path("/repo/runtime/item.png")
        with self.assertRaisesRegex(ValueError, "delete overlaps promotion"):
            validate_delete_plan(
                [
                    type(
                        "EntryStub",
                        (),
                        {"destination": destination},
                    )()
                ],
                [destination],
                Path("/repo"),
            )

    def test_refresh_summary_rejects_absolute_and_parent_manifest_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            summary = root / "summary.json"
            for manifest_path in ("/tmp/outside.json", "../outside.json"):
                with self.subTest(manifest_path=manifest_path):
                    summary.write_text(
                        json.dumps({"manifests": [manifest_path]}),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(
                        ValueError,
                        "repository-relative",
                    ):
                        _refresh_records(root, summary_path=summary)


if __name__ == "__main__":
    unittest.main()
