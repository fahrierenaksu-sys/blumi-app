"""Deterministic bake: exporting the same lab rig twice gives byte-identical files, and the export is coherent.
Run: python3 tools/avatar25d/test_export_rig.py   (needs ~/BlumiArtWorkbench lab39 on this Mac)"""
import hashlib, json, os, pathlib, subprocess, sys, tempfile, unittest

HERE = pathlib.Path(__file__).resolve().parent
SRC = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2/lab39/rig_hybrid.json'


def export(out, *extra):
    subprocess.run([sys.executable, str(HERE / 'export_rig.py'), str(SRC), *extra], check=True, capture_output=True,
                   env={**os.environ, 'BAKE25_OUT': str(out)})
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pathlib.Path(out).iterdir())}


@unittest.skipUnless(SRC.exists(), 'lab39 rig not on this machine')
class ExportRigTest(unittest.TestCase):
    def test_deterministic_and_coherent(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            self.assertEqual(export(a), export(b))
            rig = json.loads((pathlib.Path(a) / 'rig25.json').read_text())
            self.assertGreater(rig['motion']['charScale'], 1)
            for name, view in rig['views'].items():
                slots = len(view['bones']) + 2
                for mesh in [view['mesh']] + [it['mesh'] for it in view['items'].values()]:
                    n = len(mesh['pos']) // 2
                    self.assertTrue(all(0 <= i < n for i in mesh['index']), name)
                    self.assertTrue(all(0 <= j < slots for j in mesh['joints']), name)
                    self.assertTrue(all(-1e-6 <= u <= 1 + 1e-6 for u in mesh['uv']), name)
                    for k in range(n):
                        self.assertAlmostEqual(sum(mesh['weights'][k * 4:k * 4 + 4]), 1, places=3)
                    covered = sum(r['count'] for r in mesh['ranges'])
                    self.assertEqual(covered, len(mesh['index']), name)
                self.assertEqual(len([r for r in view['mesh']['ranges'] if r['name'].startswith('walk')]), len(view['walk']['frames']))
                for page in view['pages']:
                    self.assertTrue((pathlib.Path(a) / page).exists())
                for mesh in [view['mesh']] + [it['mesh'] for it in view['items'].values()]:
                    self.assertEqual(len(mesh['page']), len(mesh['pos']) // 2)
                    self.assertTrue(all(0 <= p < len(view['pages']) for p in mesh['page']))
                # item walk cards exist only alongside painted body walk frames (else the skinned legs walk)
                for it in view['items'].values():
                    if not view['walk']['frames']:
                        self.assertFalse(it['hasWalk'])

    def test_retargeted_walk_is_carried_and_replaces_painted_walk_cards(self):
        lab = json.loads(SRC.read_text())
        with tempfile.TemporaryDirectory() as a:
            motion = pathlib.Path(a) / 'motion.json'
            # a synthetic two-pose walk naming only some bones: the rest default to [0, 1] (no turn, no stretch)
            motion.write_text(json.dumps({view: {'stancePx': [-300.0, 110.0], 'frames': [
                {'root': [1.5, 16.0], 'nearFront': True, 'bones': {'thigh_near': [0.3, 0.9], 'hips': [-0.02, 1.0]}},
                {'root': [0.0, 0.0], 'nearFront': False, 'bones': {'shin_far': [-0.2, 1.1]}}]} for view in ('front', 'back')}))
            out = pathlib.Path(a) / 'out'
            out.mkdir()
            export(out, '--motion', str(motion))
            rig = json.loads((out / 'rig25.json').read_text())
            for name, view in rig['views'].items():
                names = [b['name'] for b in view['bones']]
                self.assertEqual([b['tail'] for b in view['bones']], [lab[name]['bones'][n]['tail'] for n in names])
                m = view['motion']
                self.assertEqual(m['stancePx'], [-300.0, 110.0])
                self.assertEqual([f['nearFront'] for f in m['frames']], [True, False])
                for f in m['frames']:
                    self.assertEqual(len(f['pose']), 2 * len(names))
                pose0 = dict(zip(names, zip(m['frames'][0]['pose'][0::2], m['frames'][0]['pose'][1::2])))
                self.assertEqual(pose0['thigh_near'], (0.3, 0.9))
                self.assertEqual(pose0['head'], (0, 1))
                self.assertEqual(view['walk']['frames'], [])
                self.assertFalse(any(r['name'].startswith('walk') for r in view['mesh']['ranges']))
                self.assertFalse(any(it['hasWalk'] for it in view['items'].values()))


A4 = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2/lab40/rig_A4_walk.json'


@unittest.skipUnless(A4.exists(), 'lab40 rig not on this machine')
class ExportFixedRigTest(unittest.TestCase):
    def test_walk_weights_leg_variants_and_walking_torso_are_carried(self):
        lab = json.loads(A4.read_text())
        with tempfile.TemporaryDirectory() as a:
            subprocess.run([sys.executable, str(HERE / 'export_rig.py'), str(A4)], check=True, capture_output=True,
                           env={**os.environ, 'BAKE25_OUT': a})
            rig = json.loads((pathlib.Path(a) / 'rig25.json').read_text())
            for name, view in rig['views'].items():
                src = lab[name]
                ranges = {r['name']: r for r in view['mesh']['ranges']}
                # the walking torso is one more drawing on the torso mesh, with the torso's baked walk weights
                self.assertIn('torsoWalk', ranges)
                self.assertTrue(ranges['torsoWalk']['walk'])
                self.assertEqual(len(view['mesh']['walkJoints']), len(view['mesh']['joints']))
                for iid, it in view['items'].items():
                    mesh = it['mesh']
                    parts = [r for r in mesh['ranges'] if r['name'].startswith('part')]
                    self.assertTrue(all(r.get('walk') for r in parts), iid)
                    self.assertEqual(len(mesh['walkWeights']), len(mesh['weights']))
                    for k in range(len(mesh['walkWeights']) // 4):
                        self.assertAlmostEqual(sum(mesh['walkWeights'][k * 4:k * 4 + 4]), 1, places=3)
                # every leg drawing exists once, with the item its key needs, on the body leg's mesh and order
                keys = {(r['legVariant'], r['layer']): (it['slot'], r) for it in view['items'].values()
                        for r in it['mesh']['ranges'] if r.get('legVariant')}
                expected = {(k, ln) for k, legs in src['hybrid']['legVariants'].items() for ln in legs}
                self.assertEqual(set(keys), expected)
                for (key, ln), (slot, r) in keys.items():
                    self.assertEqual(slot, 'bottom' if 'bottom' in key else 'shoes')
                    self.assertEqual(r['order'], ranges[ln]['order'])
                    self.assertEqual(r['count'], ranges[ln]['count'])


def load_exporter():
    """The exporter module with an empty command line (it reads sys.argv at import)."""
    import importlib.util
    argv, sys.argv = sys.argv, ['export_rig.py']
    try:
        spec = importlib.util.spec_from_file_location('export_rig_under_test', HERE / 'export_rig.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.argv = argv


class FreeSpotTest(unittest.TestCase):
    def test_spot_is_inside_the_page_clear_of_every_part_and_on_the_requested_phase(self):
        ex = load_exporter()
        taken = [(6, 6, 300, 200), (318, 6, 100, 100)]
        spot = ex.free_spot((90, 60), taken, (512, 256), (5, 7), 32)
        self.assertIsNotNone(spot)
        x, y = spot
        self.assertEqual((x % 32, y % 32), (5, 7))
        self.assertTrue(x >= ex.PAD and y >= ex.PAD and x + 90 + ex.PAD <= 512 and y + 60 + ex.PAD <= 256)
        for tx, ty, tw, th in taken:   # the packer's padding (PAD on each side of both boxes) stays free
            apart = x + 90 + 2 * ex.PAD <= tx or tx + tw + 2 * ex.PAD <= x or y + 60 + 2 * ex.PAD <= ty or ty + th + 2 * ex.PAD <= y
            self.assertTrue(apart, (spot, (tx, ty, tw, th)))

    def test_no_room_gives_none(self):
        ex = load_exporter()
        self.assertIsNone(ex.free_spot((90, 60), [(6, 6, 500, 244)], (512, 256), (0, 0), 32))


LIFE = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2/life/rig/rig_boy_life_fixed.json'
LIFE_BASE = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2/male/rig/rig_M3a_walk.json'


def export_full_resolution(src, out):
    """Export at page scale 1 (no resampling), so page pixels can be compared exactly with the rig's own drawings."""
    return subprocess.run([sys.executable, str(HERE / 'export_rig.py'), str(src), '--out', str(out)], capture_output=True,
                          env={**os.environ, 'BAKE25_PAGE_SCALE': '1'})


@unittest.skipUnless(LIFE.exists() and LIFE_BASE.exists(), 'life rigs not on this machine')
class ExportLifeTest(unittest.TestCase):
    def test_blink_frames_are_packed_into_free_space_and_breath_is_carried(self):
        import io, base64
        from PIL import Image, ImageChops
        ex = load_exporter()
        lab = json.loads(LIFE.read_text())
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            self.assertEqual(export_full_resolution(LIFE_BASE, a).returncode, 0)
            self.assertEqual(export_full_resolution(LIFE, b).returncode, 0)
            base = json.loads((pathlib.Path(a) / 'rig25.json').read_text())
            life = json.loads((pathlib.Path(b) / 'rig25.json').read_text())
            # a rig without the keys carries none; with them, nothing else in a view changes (same meshes, same pages)
            for name in ('front', 'back'):
                self.assertNotIn('blink', base['views'][name])
                self.assertNotIn('breath', base['views'][name])
                self.assertEqual(life['views'][name]['breath'], lab[name]['breath'])
                rest = {k: v for k, v in life['views'][name].items() if k not in ('blink', 'breath')}
                self.assertEqual(rest, base['views'][name])
            self.assertNotIn('blink', life['views']['back'])
            self.assertEqual((pathlib.Path(a) / 'back_page0.png').read_bytes(), (pathlib.Path(b) / 'back_page0.png').read_bytes())

            blink, src = life['views']['front']['blink'], lab['front']['blink']
            for key in ('seq', 'gapS', 'doubleP', 'doubleGapS'):
                self.assertEqual(blink[key], src[key])
            x, y, w, h = blink['rect']
            self.assertEqual([w, h], src['rect'][2:])
            old = Image.open(pathlib.Path(a) / 'front_page0.png').convert('RGBA')
            new = Image.open(pathlib.Path(b) / 'front_page0.png').convert('RGBA')
            self.assertEqual(old.size, new.size)
            head = next(L for L in lab['front']['layers'] if L['name'] == src['layer'])
            head_img = Image.open(io.BytesIO(base64.b64decode(head['png'].split(',', 1)[1]))).convert('RGBA')
            rx, ry = src['rect'][:2]
            # the open eyes are where the page says: the page rect is the head layer's rect
            self.assertEqual(new.crop((x, y, x + w, y + h)).tobytes(), head_img.crop((rx, ry, rx + w, ry + h)).tobytes())
            M, pad = ex.BLINK_MARGIN, blink['pad']
            self.assertGreaterEqual(M, 4)
            self.assertTrue(0 <= pad < M)
            tiles = []
            for frame in ('half', 'closed'):
                dx, dy = blink['frames'][frame]
                self.assertEqual((dx % ex.BLINK_ALIGN, dy % ex.BLINK_ALIGN), (0, 0))
                self.assertNotEqual((dx, dy), (0, 0))
                box = (x + dx - M, y + dy - M, x + dx + w + M, y + dy + h + M)
                tiles.append(box)
                self.assertIsNone(old.crop(box).getbbox(), 'the frame went into space that held nothing')
                art = Image.open(io.BytesIO(base64.b64decode(src['frames'][frame].split(',', 1)[1]))).convert('RGBA')
                # exact REPLACE of the rect, alpha included
                self.assertEqual(new.crop((x + dx, y + dy, x + dx + w, y + dy + h)).tobytes(), art.tobytes())
                # around it: the same pixels the head has around its own rect
                around_frame = new.crop(box)
                around_head = new.crop((x - M, y - M, x + w + M, y + h + M))
                around_frame.paste((0, 0, 0, 0), (M, M, M + w, M + h))
                around_head.paste((0, 0, 0, 0), (M, M, M + w, M + h))
                self.assertEqual(around_frame.tobytes(), around_head.tobytes())
            self.assertTrue(tiles[0][2] <= tiles[1][0] or tiles[1][2] <= tiles[0][0] or tiles[0][3] <= tiles[1][1] or tiles[1][3] <= tiles[0][1])
            # no existing part moved or changed: outside the two frame tiles the page is the old page
            for box in tiles:
                new.paste((0, 0, 0, 0), box)
            self.assertIsNone(ImageChops.difference(old, new).getbbox())

    def test_a_frame_that_does_not_match_its_rect_is_refused(self):
        lab = json.loads(LIFE.read_text())
        lab['front']['blink']['rect'][2] += 1
        with tempfile.TemporaryDirectory() as a:
            bad = pathlib.Path(a) / 'bad.json'
            bad.write_text(json.dumps(lab))
            out = pathlib.Path(a) / 'out'
            out.mkdir()
            run = export_full_resolution(bad, out)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse((out / 'rig25.json').exists())


class BlinkItemCutTest(unittest.TestCase):
    def test_an_items_copy_of_the_open_eye_is_cleared_and_hair_entering_from_the_edges_is_kept(self):
        import numpy as np
        ex = load_exporter()
        h, w = 40, 60
        skin, iris, hair = (250, 210, 185, 255), (150, 90, 40, 255), (30, 18, 14, 255)
        head = np.zeros((h, w, 4), np.uint8); head[:] = skin
        head[12:28, 24:40] = iris                                # the open eye
        closed = np.zeros((h, w, 4), np.uint8); closed[:] = skin
        closed[24:26, 20:44] = hair                              # its closed lash line
        item = np.zeros((h, w, 4), np.uint8)
        item[:, 0:8] = hair                                      # a side lock entering from the left edge
        item[0:6, :] = hair                                      # bangs entering from the top
        item[12:28, 24:40] = (120, 70, 35, 255)                  # the item's own (tinted) copy of the open eye
        cut = ex.blink_item_cut(head, [closed, closed], item)
        self.assertTrue(cut[12:28, 24:40].all(), 'the whole eye copy is cleared')
        self.assertFalse(cut[:, 0:8].any(), 'the side lock stays')
        self.assertFalse(cut[0:6, :].any(), 'the bangs stay')
        self.assertFalse(cut[item[..., 3] < 128].any(), 'only drawn item pixels are cut')
        # an item with no eye copy gives no patch
        self.assertFalse(ex.blink_item_cut(head, [closed, closed], np.zeros_like(item)).any())


if __name__ == '__main__':
    unittest.main()
