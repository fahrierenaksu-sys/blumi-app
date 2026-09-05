import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from render_male_shoe_bottom_compatibility_qa import (
    CANVAS_SIZE,
    CONTACT_CROP,
    CONTACT_ZOOM,
    LABEL_HEIGHT,
    CONTACT_SIZE,
    _compose_combination,
    _render_cell,
    render_compatibility_matrix,
)


class RenderMaleShoeBottomCompatibilityQaTests(unittest.TestCase):
    def _save_layer(
        self,
        path: Path,
        *,
        size: Tuple[int, int] = CANVAS_SIZE,
        mode: str = "RGBA",
        color: Optional[Tuple[int, ...]] = None,
    ) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        if color is None:
            color = (0, 0, 0, 0) if mode == "RGBA" else (0, 0, 0)
        Image.new(mode, size, color).save(path)
        return path

    def _canonical_layers(self, root: Path) -> dict[str, Path]:
        return {
            name: self._save_layer(root / "canonical" / f"{name}.png")
            for name in ("base", "face", "top", "hair")
        }

    def test_renders_every_sorted_bottom_shoe_combination(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            canonical = self._canonical_layers(root)
            bottom_colors = {
                "zeta_bottom": (220, 30, 40, 255),
                "alpha_bottom": (30, 190, 70, 255),
            }
            shoe_colors = {
                "zeta_shoe": (30, 70, 220, 255),
                "alpha_shoe": (230, 180, 20, 255),
            }
            bottom_marker = (80, 310)
            shoe_marker = (96, 340)
            for slug, color in bottom_colors.items():
                path = root / "bottoms" / slug / "rig" / "static.png"
                image = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
                image.putpixel(bottom_marker, color)
                self._save_layer(path, color=(0, 0, 0, 0))
                image.save(path)
            for slug, color in shoe_colors.items():
                path = root / "shoes" / slug / "rig" / "candidate-layer.png"
                image = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
                image.putpixel(shoe_marker, color)
                self._save_layer(path, color=(0, 0, 0, 0))
                image.save(path)

            output = root / "qa" / "matrix.png"
            result = render_compatibility_matrix(
                root / "bottoms",
                root / "shoes",
                canonical_base_path=canonical["base"],
                canonical_face_path=canonical["face"],
                canonical_top_path=canonical["top"],
                canonical_hair_path=canonical["hair"],
                output_path=output,
                shoe_layer_filename="candidate-layer.png",
                background="checkerboard",
            )

            self.assertEqual(result.bottom_count, 2)
            self.assertEqual(result.shoe_count, 2)
            self.assertEqual(result.combination_count, 4)
            self.assertEqual(result.bottom_slugs, ("alpha_bottom", "zeta_bottom"))
            self.assertEqual(result.shoe_slugs, ("alpha_shoe", "zeta_shoe"))
            self.assertTrue(output.is_file())
            with Image.open(output).convert("RGBA") as rendered:
                self.assertEqual(
                    rendered.size,
                    (result.cell_size[0] * 2, result.cell_size[1] * 2),
                )
                contact_x = (result.cell_size[0] - CONTACT_SIZE[0]) // 2
                for row, bottom_slug in enumerate(result.bottom_slugs):
                    for column, shoe_slug in enumerate(result.shoe_slugs):
                        cell_x = column * result.cell_size[0] + contact_x
                        cell_y = row * result.cell_size[1] + LABEL_HEIGHT
                        bottom_sample = (
                            cell_x
                            + (bottom_marker[0] - CONTACT_CROP[0]) * CONTACT_ZOOM,
                            cell_y
                            + (bottom_marker[1] - CONTACT_CROP[1]) * CONTACT_ZOOM,
                        )
                        shoe_sample = (
                            cell_x
                            + (shoe_marker[0] - CONTACT_CROP[0]) * CONTACT_ZOOM,
                            cell_y
                            + (shoe_marker[1] - CONTACT_CROP[1]) * CONTACT_ZOOM,
                        )
                        self.assertEqual(
                            rendered.getpixel(bottom_sample), bottom_colors[bottom_slug]
                        )
                        self.assertEqual(
                            rendered.getpixel(shoe_sample), shoe_colors[shoe_slug]
                        )

    def test_composes_base_face_shoe_bottom_top_hair_in_that_order(self) -> None:
        order = ("base", "face", "shoe", "bottom", "top", "hair")
        layers = {
            name: Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
            for name in order
        }
        colors = {
            "base": (10, 20, 30, 255),
            "face": (40, 50, 60, 255),
            "shoe": (210, 20, 20, 255),
            "bottom": (20, 40, 210, 255),
            "top": (20, 180, 70, 255),
            "hair": (130, 60, 20, 255),
        }
        pair_points = []
        for index, (earlier, later) in enumerate(zip(order, order[1:])):
            point = (90 + index, 330)
            layers[earlier].putpixel(point, colors[earlier])
            layers[later].putpixel(point, colors[later])
            pair_points.append((point, later))

        composite = _compose_combination(
            layers["base"],
            layers["face"],
            layers["shoe"],
            layers["bottom"],
            layers["top"],
            layers["hair"],
        )

        for point, expected_layer in pair_points:
            self.assertEqual(composite.getpixel(point), colors[expected_layer])

    def test_cells_use_checkerboard_or_black_and_magnify_contact_crop(self) -> None:
        composite = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        marker = (CONTACT_CROP[0] + 4, CONTACT_CROP[1] + 4)
        composite.putpixel(marker, (230, 30, 40, 255))

        checker = _render_cell(
            composite,
            bottom_slug="bottom",
            shoe_slug="shoe",
            background="checkerboard",
        )
        black = _render_cell(
            composite,
            bottom_slug="bottom",
            shoe_slug="shoe",
            background="black",
        )

        crop_width = CONTACT_CROP[2] - CONTACT_CROP[0]
        zoom_x = (checker.width - crop_width * CONTACT_ZOOM) // 2
        zoom_y = LABEL_HEIGHT
        self.assertNotEqual(checker.getpixel((zoom_x, zoom_y))[:3], (0, 0, 0))
        self.assertEqual(black.getpixel((zoom_x, zoom_y))[:3], (0, 0, 0))

        red_pixels = sum(
            1
            for red, green, blue, _alpha in black.getdata()
            if red > 200 and green < 80 and blue < 80
        )
        self.assertGreaterEqual(red_pixels, CONTACT_ZOOM * CONTACT_ZOOM)

    def test_rejects_invalid_dimensions_non_rgba_and_missing_layers(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            canonical = self._canonical_layers(root)
            self._save_layer(root / "bottoms" / "bottom" / "rig" / "static.png")
            self._save_layer(
                root / "shoes" / "shoe" / "rig" / "static.png",
                size=(128, 192),
            )

            common = {
                "canonical_base_path": canonical["base"],
                "canonical_face_path": canonical["face"],
                "canonical_top_path": canonical["top"],
                "canonical_hair_path": canonical["hair"],
                "output_path": root / "matrix.png",
            }
            with self.assertRaisesRegex(ValueError, "256x384"):
                render_compatibility_matrix(
                    root / "bottoms", root / "shoes", **common
                )

            self._save_layer(
                root / "shoes" / "shoe" / "rig" / "static.png",
                mode="RGB",
            )
            with self.assertRaisesRegex(ValueError, "RGBA"):
                render_compatibility_matrix(
                    root / "bottoms", root / "shoes", **common
                )

            canonical["hair"].unlink()
            with self.assertRaises(FileNotFoundError):
                render_compatibility_matrix(
                    root / "bottoms", root / "shoes", **common
                )

    def test_rejects_unsafe_shoe_layer_filename_and_missing_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            canonical = self._canonical_layers(root)
            common = {
                "canonical_base_path": canonical["base"],
                "canonical_face_path": canonical["face"],
                "canonical_top_path": canonical["top"],
                "canonical_hair_path": canonical["hair"],
                "output_path": root / "matrix.png",
            }

            with self.assertRaisesRegex(ValueError, "safe PNG filename"):
                render_compatibility_matrix(
                    root / "bottoms",
                    root / "shoes",
                    shoe_layer_filename="../static.png",
                    **common,
                )

            with self.assertRaisesRegex(ValueError, "no bottom layers"):
                render_compatibility_matrix(
                    root / "bottoms", root / "shoes", **common
                )

    def test_cli_renders_and_reports_json_counts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            canonical = self._canonical_layers(root)
            self._save_layer(root / "bottoms" / "bottom" / "rig" / "static.png")
            self._save_layer(root / "shoes" / "shoe" / "rig" / "proof.png")
            output = root / "cli-matrix.png"

            completed = subprocess.run(
                [
                    sys.executable,
                    str(
                        Path(__file__).resolve().parent
                        / "render_male_shoe_bottom_compatibility_qa.py"
                    ),
                    "--candidate-bottom-root",
                    str(root / "bottoms"),
                    "--shoe-root",
                    str(root / "shoes"),
                    "--shoe-layer-filename",
                    "proof.png",
                    "--canonical-base",
                    str(canonical["base"]),
                    "--canonical-face",
                    str(canonical["face"]),
                    "--canonical-top",
                    str(canonical["top"]),
                    "--canonical-hair",
                    str(canonical["hair"]),
                    "--output",
                    str(output),
                    "--background",
                    "black",
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            report = json.loads(completed.stdout)
            self.assertEqual(
                report,
                {
                    "bottom_count": 1,
                    "combination_count": 1,
                    "output_path": str(output),
                    "shoe_count": 1,
                },
            )
            self.assertTrue(output.is_file())


if __name__ == "__main__":
    unittest.main()
