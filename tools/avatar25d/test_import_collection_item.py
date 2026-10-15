"""Behaviour tests for import_collection_item.py's pure steps (graft and the source edits), on the real sources."""
import pathlib, re, sys, unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import import_collection_item as imp  # noqa: E402


def view(items, layers=None, hybrid=None):
    return {"bones": [1], "ground": [2], "layers": layers or [{"name": "torso", "png": "a"}], "items": items,
            "hybrid": hybrid or {"sit": {"box": [0, 0, 4, 4]}, "wave": {"box": [1, 1, 5, 5]}}}


def rig(items, **kw):
    return {"front": view(dict(items), **kw), "back": view(dict(items), **kw)}


class GraftTest(unittest.TestCase):
    def test_copies_the_item_its_variant_keys_and_card_boxes_and_keeps_the_base_body(self):
        base = rig({"top_a": {"slot": "top"}})
        hybrid = {"sit": {"box": [0, 0, 9, 9]}, "wave": {"box": [2, 2, 8, 8]},
                  "torsoVariants": {"jacket_x": {"p": 1}, "jacket_x+bottom_b": {"p": 2}, "top_a": {"p": 3}}}
        src = rig({"jacket_x": {"slot": "top", "sit": [1], "wave": [1]}}, layers=[{"name": "torso", "png": "fixed"}], hybrid=hybrid)
        out, differing = imp.graft(base, src, "jacket_x")
        item = out["front"]["items"]["jacket_x"]
        self.assertEqual(item["sitBox"], [0, 0, 9, 9])
        self.assertEqual(item["waveBox"], [2, 2, 8, 8])
        self.assertEqual(sorted(out["back"]["hybrid"]["torsoVariants"]), ["jacket_x", "jacket_x+bottom_b"])
        self.assertEqual(out["front"]["layers"], [{"name": "torso", "png": "a"}])
        self.assertEqual(differing, 2)
        self.assertNotIn("jacket_x", base["front"]["items"], "the base input is not changed")

    def test_refuses_another_body_or_a_missing_item(self):
        base = rig({})
        other = rig({"jacket_x": {"slot": "top"}})
        other["back"]["bones"] = [9]
        with self.assertRaises(SystemExit):
            imp.graft(base, other, "jacket_x")
        with self.assertRaises(SystemExit):
            imp.graft(base, rig({}), "jacket_x")


class SourceEditTest(unittest.TestCase):
    def test_item_art_entry_lands_in_its_own_rig_block_only(self):
        source = imp.ITEM_ART_TS.read_text()
        edited = imp.insert_item_art(source, "female", "jacket_girl_light_denim_crop")
        female = edited[edited.index("  female: {"):edited.index("  male: {")]
        male = edited[edited.index("  male: {"):]
        self.assertIn('    jacket_girl_light_denim_crop: "jacket_girl_light_denim_crop"', female)
        self.assertNotIn("jacket_girl_light_denim_crop", male)
        self.assertNotRegex(female, r'"\n    jacket_girl', "the previous entry gets a comma")
        with self.assertRaises(SystemExit):
            imp.insert_item_art(edited, "female", "jacket_girl_light_denim_crop")

    def test_landed_set_gains_the_id_once_and_stays_sorted(self):
        source = imp.COLLECTION_TS.read_text()
        once = imp.insert_landed(imp.insert_landed(source, "hair_girl_ink_twin_braids"), "bag_girl_camel_mini")
        twice = imp.insert_landed(once, "bag_girl_camel_mini")
        landed = re.search(r"new Set<string>\(\[(.*?)\]\)", twice, re.S).group(1)
        self.assertEqual(re.findall(r'"([^"]+)"', landed), ["bag_girl_camel_mini", "hair_girl_ink_twin_braids"])

    def test_showcase_pending_gets_the_id_and_a_reason(self):
        source = imp.COVERAGE_TEST_TS.read_text()
        edited = imp.insert_showcase_pending(source, "male", "glasses_boy_black_soft_rect", "REASON LINE")
        pending = edited[edited.index("const SHOWCASE_PENDING"):]
        self.assertRegex(pending, r'male: \[[^\]]*"glasses_boy_black_soft_rect"')
        self.assertLess(edited.index("REASON LINE"), edited.index("const SHOWCASE_PENDING"))

    def test_every_declared_piece_resolves_to_its_rig(self):
        self.assertEqual(imp.declared_item("glasses_boy_gunmetal_round"), ("male", False))
        self.assertEqual(imp.declared_item("jacket_girl_black_crop_blazer")[0], "female")
        with self.assertRaises(SystemExit):
            imp.declared_item("top_sage_ribbon_knit_jacket")


if __name__ == "__main__":
    unittest.main()
