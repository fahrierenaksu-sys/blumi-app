import tempfile
import unittest
from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_male_rig_chroma_guide import build_chroma_guide


class PrepareMaleRigChromaGuideTest(unittest.TestCase):
    def test_builds_four_x_registered_two_key_guide(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_path = root / "base.png"
            garment_path = root / "garment.png"
            output_path = root / "guide.png"

            base = Image.new("RGBA", (4, 6), (0, 0, 0, 0))
            base.putpixel((1, 2), (240, 180, 140, 255))
            base.putpixel((2, 2), (240, 180, 140, 255))
            base.save(base_path)

            garment = Image.new("RGBA", (4, 6), (0, 0, 0, 0))
            garment.putpixel((1, 2), (120, 60, 30, 255))
            garment.save(garment_path)

            build_chroma_guide(base_path, garment_path, output_path, scale=4)

            guide = Image.open(output_path).convert("RGB")
            self.assertEqual(guide.size, (16, 24))
            self.assertEqual(guide.getpixel((0, 0)), (0, 255, 0))
            self.assertEqual(guide.getpixel((9, 9)), (255, 0, 255))
            self.assertEqual(guide.getpixel((5, 9)), (120, 60, 30))

    def test_rejects_mismatched_canvas(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_path = root / "base.png"
            garment_path = root / "garment.png"
            output_path = root / "guide.png"
            Image.new("RGBA", (4, 6)).save(base_path)
            Image.new("RGBA", (5, 6)).save(garment_path)

            with self.assertRaisesRegex(ValueError, "same canvas"):
                build_chroma_guide(base_path, garment_path, output_path, scale=4)


if __name__ == "__main__":
    unittest.main()
