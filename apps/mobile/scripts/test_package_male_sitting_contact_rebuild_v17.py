import importlib.util
from pathlib import Path
import unittest

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name("package_male_sitting_contact_rebuild_v17.py")
SPEC = importlib.util.spec_from_file_location("package_male_sitting_contact_rebuild_v17", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def rgba(color):
    image = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
    image.putpixel((0, 0), color)
    return image


class ComposeLayersContract(unittest.TestCase):
    def test_long_pants_keep_top_and_hands_in_front_but_cover_shoe_upper(self) -> None:
        base = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        garment = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        top = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        hands = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        shoes = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))

        garment.putpixel((120, 300), (10, 20, 30, 255))
        top.putpixel((120, 300), (210, 220, 230, 255))
        garment.putpixel((110, 330), (11, 22, 33, 255))
        shoes.putpixel((110, 330), (201, 202, 203, 255))
        garment.putpixel((40, 308), (12, 24, 36, 255))
        hands.putpixel((40, 308), (250, 180, 160, 255))

        result = MODULE.compose_layers(
            base=base,
            garment=garment,
            top=top,
            hands=hands,
            shoes=shoes,
            shoes_over_garment=False,
        )

        self.assertEqual(result.getpixel((120, 300)), (210, 220, 230, 255))
        self.assertEqual(result.getpixel((110, 330)), (11, 22, 33, 255))
        self.assertEqual(result.getpixel((40, 308)), (250, 180, 160, 255))

    def test_shorts_keep_shoes_in_front(self) -> None:
        base = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        garment = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        top = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        hands = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))
        shoes = Image.new("RGBA", MODULE.CANVAS, (0, 0, 0, 0))

        garment.putpixel((122, 333), (50, 60, 70, 255))
        shoes.putpixel((122, 333), (240, 220, 200, 255))

        result = MODULE.compose_layers(
            base=base,
            garment=garment,
            top=top,
            hands=hands,
            shoes=shoes,
            shoes_over_garment=True,
        )

        self.assertEqual(result.getpixel((122, 333)), (240, 220, 200, 255))

    def test_crop_to_alpha_bbox_discards_empty_margin_before_resize(self) -> None:
        source = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
        for y in range(10, 20):
            for x in range(12, 18):
                source.putpixel((x, y), (100, 110, 120, 255))

        placed = MODULE.fit_garment_to_box(source, (90, 280, 110, 300))
        arr = np.asarray(placed)
        ys, xs = np.where(arr[..., 3] > 8)

        self.assertEqual((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), (90, 280, 110, 300))


if __name__ == "__main__":
    unittest.main()
