from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from render_male_wardrobe_54_progress_board import (
    CANVAS,
    COLUMNS,
    ROWS,
    compose_canonical_outfit,
    resolve_review_composites,
    render_review_board,
)


class RenderMaleWardrobe54ProgressBoardTests(unittest.TestCase):
    def _fixture(self, root: Path) -> tuple[Path, Path]:
        items = []
        for index in range(54):
            category = "top" if index < 27 else "bottom" if index < 46 else "shoes"
            slug = f"item_{index:02d}"
            candidate_root = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates"
                / category
                / slug
            )
            rig_root = candidate_root / "rig"
            rig_root.mkdir(parents=True)
            source_name = "composite-review-v7.png" if category == "shoes" else "composite.png"
            layer_name = "static-review-v7.png" if category == "shoes" else "static.png"
            Image.new(
                "RGBA",
                CANVAS,
                (index, 120, 220 - index, 255),
            ).save(rig_root / source_name)
            Image.new(
                "RGBA",
                CANVAS,
                (0, 0, 0, 0),
            ).save(rig_root / layer_name)
            items.append(
                {
                    "category": category,
                    "slug": slug,
                    "family": f"{category}_family",
                    "candidateRoot": candidate_root.relative_to(root).as_posix(),
                }
            )

        manifest_path = root / "asset-manifest.json"
        manifest_path.write_text(json.dumps({"items": items}), encoding="utf-8")
        selection_path = root / "review-selection.json"
        selection_path.write_text(
            json.dumps(
                {
                    "defaultCompositeByCategory": {
                        "top": "rig/composite.png",
                        "bottom": "rig/composite.png",
                        "shoes": "rig/composite-review-v7.png",
                    },
                    "overrides": {},
                }
            ),
            encoding="utf-8",
        )
        self._canonical_room_fixture(root)
        return manifest_path, selection_path

    def _canonical_room_fixture(self, root: Path) -> None:
        room = root / "apps/mobile/src/features/avatarV2/assets/room"
        room.mkdir(parents=True)
        files = {
            "avatar_room_base_male_light_v1.png": ((1, 1), (11, 12, 13, 255)),
            "avatar_room_face_male_warm_friendly_v1.png": ((2, 2), (21, 22, 23, 255)),
            "avatar_room_hair_front_male_espresso_crop_v1.png": ((3, 3), (31, 32, 33, 255)),
            "avatar_room_top_male_cream_basic_tee_v1.png": ((4, 4), (41, 42, 43, 255)),
            "avatar_room_bottom_male_navy_straight_pants_v1.png": ((5, 5), (51, 52, 53, 255)),
            "avatar_room_shoes_male_milk_tea_court_v1.png": ((6, 6), (61, 62, 63, 255)),
        }
        for filename, (point, color) in files.items():
            image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            image.putpixel(point, color)
            image.save(room / filename)

    def test_resolves_exactly_54_candidate_composites_in_manifest_order(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            resolved = resolve_review_composites(
                repository_root=root,
                manifest_path=manifest_path,
                selection_path=selection_path,
            )

            self.assertEqual(len(resolved), 54)
            self.assertEqual(resolved[0].slug, "item_00")
            self.assertEqual(resolved[-1].slug, "item_53")
            self.assertEqual(
                {item.category for item in resolved},
                {"top", "bottom", "shoes"},
            )

    def test_rejects_missing_or_noncanonical_candidate_composite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            broken = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/top/item_00/rig/composite.png"
            )
            broken.unlink()
            with self.assertRaisesRegex(FileNotFoundError, "item_00"):
                resolve_review_composites(
                    repository_root=root,
                    manifest_path=manifest_path,
                    selection_path=selection_path,
                )

            Image.new("RGBA", (128, 192), (0, 0, 0, 0)).save(broken)
            with self.assertRaisesRegex(ValueError, "256x384"):
                resolve_review_composites(
                    repository_root=root,
                    manifest_path=manifest_path,
                    selection_path=selection_path,
                )

    def test_renders_one_labeled_9_by_6_board(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            output_path = root / "board.png"
            result = render_review_board(
                repository_root=root,
                manifest_path=manifest_path,
                selection_path=selection_path,
                output_path=output_path,
            )

            self.assertEqual(result.item_count, 54)
            self.assertEqual(result.columns, COLUMNS)
            self.assertEqual(result.rows, ROWS)
            self.assertTrue(output_path.is_file())
            with Image.open(output_path) as board:
                self.assertEqual(board.mode, "RGB")
                self.assertEqual(board.size, result.size)

    def test_recomposes_shoes_on_the_same_canonical_neutral_character(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            shoes = resolve_review_composites(
                repository_root=root,
                manifest_path=manifest_path,
                selection_path=selection_path,
            )[-1]
            selected_layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            selected_layer.putpixel((7, 7), (71, 72, 73, 255))
            selected_layer.save(shoes.layer_path)

            outfit = compose_canonical_outfit(root, shoes)

            self.assertEqual(outfit.getpixel((3, 3)), (31, 32, 33, 255))
            self.assertEqual(outfit.getpixel((4, 4)), (41, 42, 43, 255))
            self.assertEqual(outfit.getpixel((5, 5)), (51, 52, 53, 255))
            self.assertEqual(outfit.getpixel((7, 7)), (71, 72, 73, 255))

    def test_selection_can_pin_a_candidate_only_canonical_hair_front(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            candidate_hair = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/hair/espresso_crop/rig/hair-front-review-natural-v2.png"
            )
            candidate_hair.parent.mkdir(parents=True)
            hair_image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            hair_image.putpixel((8, 8), (81, 82, 83, 255))
            hair_image.save(candidate_hair)

            selection = json.loads(selection_path.read_text(encoding="utf-8"))
            selection["canonicalLayers"] = {
                "hairFront": candidate_hair.relative_to(root).as_posix(),
            }
            selection_path.write_text(json.dumps(selection), encoding="utf-8")

            shoes = resolve_review_composites(
                repository_root=root,
                manifest_path=manifest_path,
                selection_path=selection_path,
            )[-1]
            outfit = compose_canonical_outfit(
                root,
                shoes,
                selection_path=selection_path,
            )

            self.assertEqual(outfit.getpixel((8, 8)), (81, 82, 83, 255))
            self.assertEqual(outfit.getpixel((3, 3)), (0, 0, 0, 0))

    def test_selection_can_pin_the_repaired_neutral_bottom_for_all_top_cells(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path, selection_path = self._fixture(root)
            candidate_bottom = (
                root
                / "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
                / "candidates/bottom/navy_straight_pants/rig/static-review-natural-v4.png"
            )
            candidate_bottom.parent.mkdir(parents=True)
            bottom_image = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            bottom_image.putpixel((6, 6), (90, 90, 90, 255))
            bottom_image.putpixel((9, 9), (91, 92, 93, 255))
            bottom_image.save(candidate_bottom)

            selection = json.loads(selection_path.read_text(encoding="utf-8"))
            selection["canonicalLayers"] = {
                "bottom": candidate_bottom.relative_to(root).as_posix(),
            }
            selection_path.write_text(json.dumps(selection), encoding="utf-8")

            top = resolve_review_composites(
                repository_root=root,
                manifest_path=manifest_path,
                selection_path=selection_path,
            )[0]
            outfit = compose_canonical_outfit(
                root,
                top,
                selection_path=selection_path,
            )

            self.assertEqual(outfit.getpixel((9, 9)), (91, 92, 93, 255))
            self.assertEqual(outfit.getpixel((5, 5)), (0, 0, 0, 0))
            self.assertEqual(outfit.getpixel((6, 6)), (61, 62, 63, 255))


if __name__ == "__main__":
    unittest.main()
