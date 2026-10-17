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

    def test_replace_takes_the_old_entry_and_its_variant_keys_out_before_the_new_graft(self):
        hybrid = {"sit": {"box": [0, 0, 9, 9]}, "wave": {"box": [2, 2, 8, 8]},
                  "torsoVariants": {"jacket_x": {"p": "old"}, "jacket_x+bottom_b": {"p": "old"}, "top_a": {"p": 3}}}
        landed = rig({"top_a": {"slot": "top"}, "jacket_x": {"slot": "top", "art": "old"}}, hybrid=hybrid)
        fixed = rig({"jacket_x": {"slot": "top", "art": "new"}},
                    hybrid={**hybrid, "torsoVariants": {"jacket_x": {"p": "new"}}})
        out, _ = imp.graft(imp.ungraft(landed, "jacket_x"), fixed, "jacket_x")
        self.assertEqual(out["front"]["items"]["jacket_x"]["art"], "new")
        self.assertEqual(out["back"]["hybrid"]["torsoVariants"], {"top_a": {"p": 3}, "jacket_x": {"p": "new"}})
        self.assertEqual(out["front"]["items"]["top_a"], {"slot": "top"}, "the other items stay")
        self.assertEqual(landed["front"]["items"]["jacket_x"]["art"], "old", "the base input is not changed")
        with self.assertRaises(SystemExit):
            imp.ungraft(landed, "not_landed")

    def test_refuses_another_body_or_a_missing_item(self):
        base = rig({})
        other = rig({"jacket_x": {"slot": "top"}})
        other["back"]["bones"] = [9]
        with self.assertRaises(SystemExit):
            imp.graft(base, other, "jacket_x")
        with self.assertRaises(SystemExit):
            imp.graft(base, rig({}), "jacket_x")


    def test_a_head_piece_hidden_from_behind_gets_an_empty_back_entry_but_a_garment_does_not(self):
        src = rig({})
        src["front"]["items"]["clip_x"] = {"slot": "accessory", "group": "hairClip", "parts": [{"layer": "head"}]}
        src["front"]["items"]["top_x"] = {"slot": "top", "parts": [{"layer": "torso"}]}
        out, _ = imp.graft(rig({}), src, "clip_x")
        self.assertEqual(out["back"]["items"]["clip_x"], {"slot": "accessory", "group": "hairClip", "parts": []})
        self.assertEqual(out["front"]["items"]["clip_x"]["parts"], [{"layer": "head"}])
        with self.assertRaises(SystemExit):
            imp.graft(rig({}), src, "top_x")


class SourceEditTest(unittest.TestCase):
    def test_item_art_entry_lands_in_its_own_rig_block_only(self):
        source = imp.ITEM_ART_TS.read_text()
        edited = imp.insert_item_art(source, "female", "piece_girl_test_only")
        female = edited[edited.index("  female: {"):edited.index("  male: {")]
        male = edited[edited.index("  male: {"):]
        self.assertIn('    piece_girl_test_only: "piece_girl_test_only"', female)
        self.assertNotIn("piece_girl_test_only", male)
        self.assertNotRegex(female, r'"\n    jacket_girl', "the previous entry gets a comma")
        with self.assertRaises(SystemExit):
            imp.insert_item_art(edited, "female", "piece_girl_test_only")

    def test_landed_set_gains_the_id_once_and_stays_sorted(self):
        source = imp.COLLECTION_TS.read_text()
        once = imp.insert_landed(imp.insert_landed(source, "zz_piece_test_only"), "bag_girl_camel_mini")
        twice = imp.insert_landed(once, "bag_girl_camel_mini")
        ids = lambda text: re.findall(r'"([^"]+)"', re.search(r"new Set<string>\(\[(.*?)\]\)", text, re.S).group(1))
        before, after = ids(source), ids(twice)
        self.assertEqual(after, sorted(set(before) | {"bag_girl_camel_mini", "zz_piece_test_only"}))

    def test_showcase_pending_gets_the_id_and_a_reason(self):
        source = imp.COVERAGE_TEST_TS.read_text()
        edited = imp.insert_showcase_pending(source, "male", "piece_boy_test_only", "REASON LINE")
        pending = edited[edited.index("const SHOWCASE_PENDING"):]
        self.assertRegex(pending, r'male: \[[^\]]*"piece_boy_test_only"')
        self.assertLess(edited.index("REASON LINE"), edited.index("const SHOWCASE_PENDING"))

    def test_every_declared_piece_resolves_to_its_rig(self):
        # The landed flag moves as pieces land, so the pieces here pin only the rig and that the flag follows the landed set.
        landed_ids = set(re.findall(r'"([^"]+)"', re.search(r"NEW_COLLECTION_LANDED_ITEM_IDS[^=]*=\s*new Set<string>\(\[(.*?)\]\)", imp.COLLECTION_TS.read_text(), re.S).group(1)))
        for item_id, rig in (("glasses_boy_gunmetal_round", "male"), ("jacket_girl_black_crop_blazer", "female")):
            self.assertEqual(imp.declared_item(item_id), (rig, item_id in landed_ids))
        self.assertEqual(imp.declared_item("jacket_girl_black_crop_blazer")[0], "female")
        with self.assertRaises(SystemExit):
            imp.declared_item("top_sage_ribbon_knit_jacket")


if __name__ == "__main__":
    unittest.main()
