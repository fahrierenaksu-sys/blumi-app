from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT = Path(__file__).with_name(
    "produce_wide_pleated_technical_trousers_v3.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location(
        "produce_wide_pleated_technical_trousers_v3",
        SCRIPT,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load wide pleated v3 producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class WidePleatedTechnicalTrousersV3Tests(unittest.TestCase):
    def test_source_and_guide_are_hash_locked(self) -> None:
        module = load_module()
        module.verify_inputs()
        self.assertEqual(module.SOURCE_SHA256, module.sha256(module.SOURCE))
        self.assertEqual(module.GUIDE_SHA256, module.sha256(module.GUIDE))

    def test_candidate_is_registered_without_item_specific_warp(self) -> None:
        module = load_module()
        registered = module.build_registered_crop()
        self.assertEqual((1024, 1024), registered.size)
        self.assertEqual(
            module.keyed_bbox(Image.open(module.GUIDE).convert("RGBA")),
            module.keyed_bbox(registered),
        )

    def test_keyed_master_waist_is_painted_on_the_canonical_waist_line(self) -> None:
        module = load_module()
        registered = module.build_registered_crop()
        foreground = module.cleanup_alpha_components(
            module.extract_keyed_foreground(registered),
            min_pixel_count=120,
        )
        alpha = np.asarray(foreground.getchannel("A"))
        full_waist_rows = [
            y
            for y in range(alpha.shape[0])
            if np.count_nonzero(alpha[y] > 16) >= 300
        ]
        self.assertTrue(full_waist_rows)
        waist_y = min(full_waist_rows)
        self.assertGreaterEqual(
            waist_y,
            260,
            "the keyed source waistband cannot float above the canonical waist",
        )
        self.assertLessEqual(
            waist_y,
            310,
            "the keyed source waistband cannot fall below the canonical waist",
        )
        rgb = np.asarray(registered)[:, :, :3]
        central_magenta = (
            (rgb[:, :, 0] > 180)
            & (rgb[:, :, 1] < 100)
            & (rgb[:, :, 2] > 150)
        )[:, 220:804]
        self.assertTrue(
            any(
                np.count_nonzero(central_magenta[y]) == 0
                and np.count_nonzero(alpha[y] > 16) >= 450
                for y in range(waist_y, waist_y + 12)
            ),
            "the waistband must wrap the central body without exposed magenta spill",
        )

    def test_native_layer_preserves_two_legs_and_canonical_contact_band(self) -> None:
        module = load_module()
        layer = module.build_static_layer()
        alpha = np.asarray(layer.getchannel("A"))
        bbox = layer.getchannel("A").point(
            lambda value: 255 if value > 16 else 0
        ).getbbox()
        self.assertEqual((256, 384), layer.size)
        self.assertIsNotNone(bbox)
        assert bbox is not None
        self.assertGreaterEqual(bbox[0], 88)
        self.assertLessEqual(bbox[2], 168)
        self.assertGreaterEqual(bbox[1], 272)
        self.assertLessEqual(bbox[1], 286)
        self.assertGreaterEqual(bbox[3], 331)
        self.assertLessEqual(
            bbox[3],
            333,
            "relaxed-wide hem must stop at the approved shallow shoe-contact line",
        )
        self.assertEqual(1, module.visible_component_count(layer, threshold=16))
        self.assertEqual(0, int(np.count_nonzero(alpha[:270] > 16)))
        self.assertEqual(0, int(np.count_nonzero(alpha[333:] > 16)))
        self.assertTrue(
            any(
                np.count_nonzero(alpha[y, 126:130] <= 16) >= 2
                for y in range(304, 336)
            )
        )
        self.assertLessEqual(
            int(np.count_nonzero(alpha[330, 113:119] > 16)),
            2,
            "left hem must reveal the shoe tongue through a shallow fabric arc",
        )
        self.assertLessEqual(
            int(np.count_nonzero(alpha[330, 138:144] > 16)),
            2,
            "right hem must reveal the shoe tongue through a shallow fabric arc",
        )
        self.assertGreaterEqual(
            int(np.count_nonzero(alpha[328] > 16)),
            50,
            "the lower legs must retain relaxed-wide volume before the hem line",
        )
        self.assertGreaterEqual(
            int(np.count_nonzero(alpha[330, 100:107] > 16)),
            5,
            "left outer hem must keep controlled shoe contact",
        )
        self.assertGreaterEqual(
            int(np.count_nonzero(alpha[330, 149:157] > 16)),
            5,
            "right outer hem must keep controlled shoe contact",
        )

    def test_native_layer_has_no_key_color_fringe(self) -> None:
        module = load_module()
        rgba = np.asarray(module.build_static_layer())
        alpha = rgba[:, :, 3]
        faint_edge = (alpha > 0) & (alpha <= 16)
        self.assertEqual(
            0,
            int(np.count_nonzero(rgba[:, :, :3][faint_edge])),
            "near-transparent pixels must not retain magenta/green key colors",
        )

    def test_visible_waist_wraps_the_canonical_male_base(self) -> None:
        module = load_module()
        layer_alpha = np.asarray(module.build_static_layer().getchannel("A"))
        base_alpha = np.asarray(
            Image.open(module.BASE).convert("RGBA").getchannel("A")
        )
        top_alpha = np.asarray(
            Image.open(module.TOP).convert("RGBA").getchannel("A")
        )

        visible_waist_row = 294
        self.assertEqual(
            0,
            int(np.count_nonzero(top_alpha[visible_waist_row] > 16)),
            "waist gate must use the first row no longer hidden by the tee",
        )
        base_x = np.flatnonzero(base_alpha[visible_waist_row] > 16)
        layer_x = np.flatnonzero(layer_alpha[visible_waist_row] > 16)
        self.assertGreater(base_x.size, 0)
        self.assertGreater(layer_x.size, 0)
        self.assertLessEqual(abs(int(layer_x.min()) - int(base_x.min())), 3)
        self.assertLessEqual(abs(int(layer_x.max()) - int(base_x.max())), 3)
        self.assertEqual(
            0,
            int(
                np.count_nonzero(
                    (base_alpha[visible_waist_row] > 16)
                    & (layer_alpha[visible_waist_row] <= 16)
                )
            ),
            "the visible waistband must fully cover the canonical waist",
        )
        contact_row = 285
        top_x = np.flatnonzero(top_alpha[contact_row] > 16)
        contact_x = np.flatnonzero(layer_alpha[contact_row] > 16)
        self.assertLessEqual(abs(int(contact_x.min()) - int(top_x.min())), 1)
        self.assertLessEqual(abs(int(contact_x.max()) - int(top_x.max())), 1)

    def test_qa_evidence_uses_truthful_version_label(self) -> None:
        module = load_module()
        self.assertIn("V17", module.QA_TITLE)
        self.assertNotIn("V2", module.QA_TITLE)

    def test_render_is_candidate_only_and_keeps_runtime_immutable(self) -> None:
        module = load_module()
        before = module.tree_sha256(module.ROOM)
        outputs = module.render()
        after = module.tree_sha256(module.ROOM)
        self.assertEqual(before, after)
        self.assertTrue(all(path.is_file() for path in outputs))
        self.assertFalse(module.RUNTIME_ASSET.samefile(module.STATIC_LAYER))


if __name__ == "__main__":
    unittest.main()
