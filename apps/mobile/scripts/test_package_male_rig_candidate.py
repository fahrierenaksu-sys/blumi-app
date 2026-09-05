import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from package_male_rig_candidate import (
    apply_registration_envelope,
    compose_category_proof,
    compose_shoe_contact_proofs,
    compose_static_proof,
    fit_master_to_native_box,
    register_master,
)


class PackageMaleRigCandidateTest(unittest.TestCase):
    def test_registration_envelope_removes_distant_key_residue(self):
        master = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
        master.putpixel((5, 9), (120, 60, 30, 255))
        master.putpixel((14, 22), (20, 20, 20, 255))
        envelope = Image.new("RGBA", (4, 6), (0, 0, 0, 0))
        envelope.putpixel((1, 2), (255, 255, 255, 255))

        cleaned = apply_registration_envelope(master, envelope, scale=4, dilation_native_px=0)

        self.assertEqual(cleaned.getpixel((5, 9))[3], 255)
        self.assertEqual(cleaned.getpixel((14, 22))[3], 0)

    def test_exact_registration_preserves_valid_generated_silhouette(self):
        master = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
        master.putpixel((14, 22), (20, 20, 20, 255))
        envelope = Image.new("RGBA", (4, 6), (0, 0, 0, 0))

        registered = register_master(
            master,
            envelope,
            mode="exact",
            scale=4,
            dilation_native_px=0,
        )

        self.assertEqual(registered.getpixel((14, 22)), (20, 20, 20, 255))
        self.assertIsNot(registered, master)

    def test_registration_rejects_unknown_mode(self):
        master = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
        envelope = Image.new("RGBA", (4, 6), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "registration mode"):
            register_master(master, envelope, mode="warp", scale=4)

    def test_static_proof_uses_runtime_layer_order(self):
        def layer(color):
            return Image.new("RGBA", (2, 2), color)

        transparent = layer((0, 0, 0, 0))
        base = layer((10, 10, 10, 255))
        face = transparent.copy()
        shoes = transparent.copy()
        bottom = transparent.copy()
        candidate = transparent.copy()
        hair = transparent.copy()
        candidate.putpixel((0, 0), (120, 60, 30, 255))
        hair.putpixel((1, 1), (40, 20, 10, 255))

        proof = compose_static_proof(base, face, shoes, bottom, candidate, hair)

        self.assertEqual(proof.getpixel((0, 0)), (120, 60, 30, 255))
        self.assertEqual(proof.getpixel((1, 1)), (40, 20, 10, 255))

    def test_bottom_proof_places_pants_over_shoes_and_top_over_waist(self):
        def layer(color=(0, 0, 0, 0)):
            return Image.new("RGBA", (2, 2), color)

        base = layer((10, 10, 10, 255))
        face = layer()
        shoes = layer()
        shoes.putpixel((0, 0), (210, 30, 30, 255))
        candidate_bottom = layer()
        candidate_bottom.putpixel((0, 0), (20, 180, 60, 255))
        candidate_bottom.putpixel((1, 0), (20, 180, 60, 255))
        neutral_top = layer()
        neutral_top.putpixel((1, 0), (30, 80, 220, 255))
        hair = layer()

        proof = compose_category_proof(
            "bottom",
            base=base,
            face=face,
            neutral_shoes=shoes,
            neutral_bottom=layer(),
            neutral_top=neutral_top,
            candidate=candidate_bottom,
            hair=hair,
        )

        self.assertEqual(proof.getpixel((0, 0)), (20, 180, 60, 255))
        self.assertEqual(proof.getpixel((1, 0)), (30, 80, 220, 255))

    def test_shoe_proof_places_pant_hem_over_shoe_upper(self):
        def layer(color=(0, 0, 0, 0)):
            return Image.new("RGBA", (2, 2), color)

        candidate_shoes = layer()
        candidate_shoes.putpixel((0, 0), (210, 120, 40, 255))
        neutral_bottom = layer()
        neutral_bottom.putpixel((0, 0), (30, 50, 110, 255))

        proof = compose_category_proof(
            "shoe",
            base=layer((10, 10, 10, 255)),
            face=layer(),
            neutral_shoes=layer(),
            neutral_bottom=neutral_bottom,
            neutral_top=layer(),
            candidate=candidate_shoes,
            hair=layer(),
        )

        self.assertEqual(proof.getpixel((0, 0)), (30, 50, 110, 255))

    def test_shoe_contact_proofs_render_slim_and_relaxed_hems_independently(self):
        def layer(color=(0, 0, 0, 0)):
            return Image.new("RGBA", (2, 2), color)

        candidate_shoes = layer()
        candidate_shoes.putpixel((0, 0), (210, 120, 40, 255))
        candidate_shoes.putpixel((1, 0), (210, 120, 40, 255))
        slim_bottom = layer()
        slim_bottom.putpixel((0, 0), (30, 50, 110, 255))
        relaxed_bottom = layer()
        relaxed_bottom.putpixel((1, 0), (190, 160, 110, 255))

        slim_proof, relaxed_proof = compose_shoe_contact_proofs(
            base=layer((10, 10, 10, 255)),
            face=layer(),
            candidate_shoes=candidate_shoes,
            slim_bottom=slim_bottom,
            relaxed_bottom=relaxed_bottom,
            neutral_top=layer(),
            hair=layer(),
        )

        self.assertEqual(slim_proof.getpixel((0, 0)), (30, 50, 110, 255))
        self.assertEqual(slim_proof.getpixel((1, 0)), (210, 120, 40, 255))
        self.assertEqual(relaxed_proof.getpixel((0, 0)), (210, 120, 40, 255))
        self.assertEqual(relaxed_proof.getpixel((1, 0)), (190, 160, 110, 255))

    def test_category_proof_rejects_unknown_category(self):
        layer = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "category"):
            compose_category_proof(
                "outfit",
                base=layer,
                face=layer,
                neutral_shoes=layer,
                neutral_bottom=layer,
                neutral_top=layer,
                candidate=layer,
                hair=layer,
            )

    def test_rejects_master_not_exactly_scaled_from_envelope(self):
        master = Image.new("RGBA", (15, 24))
        envelope = Image.new("RGBA", (4, 6))
        with self.assertRaisesRegex(ValueError, "exactly 4x"):
            apply_registration_envelope(master, envelope, scale=4, dilation_native_px=0)

    def test_fits_high_resolution_master_to_an_exact_native_anchor_box(self):
        master = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
        for x in range(2, 14):
            for y in range(12, 22):
                master.putpixel((x, y), (80, 90, 120, 255))

        fitted = fit_master_to_native_box(
            master,
            native_size=(4, 6),
            box=(1, 4, 3, 6),
            scale=4,
        )

        self.assertEqual(fitted.size, (16, 24))
        self.assertEqual(
            fitted.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox(),
            (4, 16, 12, 24),
        )


if __name__ == "__main__":
    unittest.main()
