from __future__ import annotations

import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("produce_male_live_replacement_top_motion_v1.py")


def load_module():
    sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("live_replacement_motion", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load live replacement producer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class LiveReplacementTopMotionTests(unittest.TestCase):
    def test_exact_three_live_replacements_are_in_scope(self):
        module = load_module()
        items = module.load_live_replacement_items()
        self.assertEqual(
            {
                "dusty_blue_weekend_crew_sweatshirt",
                "modern_track_luxury_top",
                "cocoa_sage_canvas_shacket",
            },
            {item["slug"] for item in items},
        )

    def test_each_replacement_has_clean_hash_distinct_five_frames(self):
        module = load_module()
        for item in module.load_live_replacement_items():
            hashes = set()
            for state in module.STATES:
                frame = module.build_top_frame(item, state)
                self.assertEqual((256, 384), frame.size)
                pixels = np.asarray(frame)
                self.assertIsNotNone(frame.getchannel("A").getbbox())
                self.assertTrue(np.all(pixels[pixels[..., 3] == 0, :3] == 0))
                hashes.add(hashlib.sha256(frame.tobytes()).hexdigest())
            self.assertGreaterEqual(len(hashes), 2)


if __name__ == "__main__":
    unittest.main()
