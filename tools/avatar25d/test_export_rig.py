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

    def test_a_bang_hanging_over_the_eye_and_the_hair_around_it_keep_every_pixel(self):
        import numpy as np
        ex = load_exporter()
        h, w = 40, 60
        skin, iris, hair = (250, 210, 185, 255), (210, 125, 70, 255), (110, 70, 58, 255)
        head = np.zeros((h, w, 4), np.uint8); head[:] = skin
        head[12:28, 24:40] = iris
        closed = np.zeros((h, w, 4), np.uint8); closed[:] = skin
        closed[24:26, 20:44] = (30, 18, 14, 255)
        item = np.zeros((h, w, 4), np.uint8)
        item[0:9, :] = hair                                      # bangs ending 3 px above the eye
        item[0:20, 30:35] = hair                                 # one bang strand hanging 8 px into the eye
        item[12:28, 24:30] = (195, 115, 62, 255); item[12:28, 35:40] = (195, 115, 62, 255)   # the eye copy around it
        item[20:28, 30:35] = (195, 115, 62, 255)
        item[12, 24:30] = item[12, 35:40] = (70, 22, 10, 255)    # its upper lash line (vivid dark)
        item[9:12, 24:30] = hair                                 # bang tips reaching down onto the lashes, over the eye
        head[9:13, 24:30] = head[12, 35:40] = (60, 30, 20, 255)  # ... where the head draws its own upper lashes
        item[30, 45] = (40, 25, 20, 255)                         # a loose lash dot of the copy, near the eye
        cut = ex.blink_item_cut(head, [closed, closed], item)
        self.assertFalse(cut[0:12].any(), 'the bangs above the eye keep every pixel, also over its lashes (no growth into them)')
        self.assertFalse(cut[0:20, 30:35].any(), 'the strand hanging into the eye stays')
        copy = np.zeros((h, w), bool); copy[12:28, 24:30] = copy[12:28, 35:40] = copy[20:28, 30:35] = True
        strand = np.zeros((h, w), bool); strand[0:20, 30:35] = True
        self.assertTrue(cut[13:28, 25:29].all() and cut[20:28, 30:35].all(), 'the eye copy goes')
        self.assertGreater(cut[copy & ~ex._dilate(strand, 1)].mean(), 0.98, '... bar a corner px (no 1 px slivers)')
        self.assertTrue(cut[30, 45], 'a loose bit of the copy goes')


APP_RIG = HERE.parents[1] / 'apps/mobile/src/features/avatar/rigs'


def load_gate():
    sys.path.insert(0, str(HERE))
    import blink_gate
    return blink_gate


@unittest.skipUnless((APP_RIG / 'girl/rig25.json').exists(), 'app rig not exported')
class BlinkGateTest(unittest.TestCase):
    """A blink changes only eye pixels: no hair or skin outside the eyes, no hole, no speck (blink_gate.py)."""

    def assert_gate(self, rigdir):
        cases = load_gate().check(rigdir)
        self.assertTrue(cases, 'the rig has a blink')
        bad = [c for c in cases if not c['ok']]
        self.assertEqual(bad, [], bad[:2])
        return cases

    def test_the_app_rigs_blink_only_in_the_eyes(self):
        cases = self.assert_gate(APP_RIG / 'girl')
        # a wardrobe rig (several items per slot) is checked with each item worn alone: every item, both frames, mirrored
        items = json.loads((APP_RIG / 'girl/rig25.json').read_text())['views']['front']['items']
        outfits = ('bare', 'dressed') if len({it['slot'] for it in items.values()}) == len(items) else \
            ('bare', *(f'dressed:{iid}' for iid in items))
        self.assertEqual({(c['outfit'], c['frame'], c['mirror']) for c in cases},
                         {(o, f, m) for o in outfits for f in ('half', 'closed') for m in (False, True)})
        self.assert_gate(APP_RIG / 'boy')

    def test_the_gate_fails_when_a_patch_erases_hair_or_leaves_a_speck(self):
        import shutil
        import numpy as np
        from PIL import Image
        rig = json.loads((APP_RIG / 'girl/rig25.json').read_text())
        v = rig['views']['front']
        it = next((i for i in v['blink']['items'] if i['item'] == 'hair_ink_pageboy_star'), v['blink']['items'][0])
        with Image.open(APP_RIG / 'girl' / v['pages'][it['page']]) as im:
            sc = im.width / v['pageSize'][0]
        (x, y, w, h), (dx, dy) = it['rect'], it['offset']
        for broken in ('hair', 'speck'):
            with tempfile.TemporaryDirectory() as tmp:
                for name in ['rig25.json'] + v['pages']:
                    shutil.copy(APP_RIG / 'girl' / name, tmp)
                page = pathlib.Path(tmp) / v['pages'][it['page']]
                a = np.asarray(Image.open(page).convert('RGBA')).copy()
                px, py, pw, ph = (int((x + dx) * sc), int((y + dy) * sc), int(w * sc), int(h * sc))
                patch, orig = a[py:py + ph, px:px + pw], a[int(y * sc):int(y * sc) + ph, int(x * sc):int(x * sc) + pw]
                if broken == 'hair':        # the patch also clears the bang texels at the top of the eye rect
                    patch[0:3][patch[0:3, ..., 3] > 200] = 0
                else:                       # a dark dot left inside the cleared eye copy
                    cut = (patch[..., 3] == 0) & (orig[..., 3] > 200)
                    inner = cut[1:-1, 1:-1] & cut[:-2, 1:-1] & cut[2:, 1:-1] & cut[1:-1, :-2] & cut[1:-1, 2:]
                    ys, xs = np.nonzero(inner)
                    k = len(ys) // 2
                    patch[ys[k] + 1, xs[k] + 1] = (40, 25, 20, 255)
                Image.fromarray(a).save(page)
                cases = load_gate().check(tmp, scales=(1.0,))
                key = 'outsideEye' if broken == 'hair' else 'specks'
                self.assertTrue(any(c[key] for c in cases if c['outfit'].startswith('dressed')), broken)


def data_uri(image):
    import io, base64
    buf = io.BytesIO()
    image.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


@unittest.skipUnless(A4.exists(), 'lab40 rig not on this machine')
class ExportMirrorCardsTest(unittest.TestCase):
    """Mirror cards: a part with `pngMirror` gets its card in free page space and the item a `mirrorUv`; nothing else moves."""

    def test_a_card_is_packed_beside_its_part_and_everything_else_is_unchanged(self):
        import io, base64
        from PIL import Image, ImageOps
        lab = json.loads(A4.read_text())
        iid = 'hair_ink_pageboy_star'
        for view in ('front', 'back'):
            part = lab[view]['items'][iid]['parts'][0]
            card = ImageOps.mirror(Image.open(io.BytesIO(base64.b64decode(part['png'].split(',', 1)[1]))).convert('RGBA'))
            part['pngMirror'] = data_uri(card)
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b, tempfile.TemporaryDirectory() as tmp:
            withCards = pathlib.Path(tmp) / 'cards.json'
            withCards.write_text(json.dumps(lab))
            self.assertEqual(export_full_resolution(A4, a).returncode, 0)
            self.assertEqual(export_full_resolution(withCards, b).returncode, 0)
            base = json.loads((pathlib.Path(a) / 'rig25.json').read_text())
            cards = json.loads((pathlib.Path(b) / 'rig25.json').read_text())
            for view in ('front', 'back'):
                old, new = base['views'][view], cards['views'][view]
                for other, item in old['items'].items():
                    self.assertNotIn('mirrorUv', item)
                    self.assertNotIn('mirrorPage', item)
                    if other != iid:
                        self.assertEqual(new['items'][other], item, other)   # untouched items: identical entries
                item, oldItem = new['items'][iid], old['items'][iid]
                self.assertEqual({k: v for k, v in item.items() if k != 'mirrorUv'}, oldItem)   # same mesh, weights, page
                uv = item['mirrorUv']
                self.assertEqual(len(uv), len(item['mesh']['uv']))
                self.assertNotEqual(uv, item['mesh']['uv'])
                # the page texels under the card's uv are the card, and the drawing under the old uv is untouched
                page = Image.open(pathlib.Path(b) / new['pages'][item['page']]).convert('RGBA')
                oldPage = Image.open(pathlib.Path(a) / old['pages'][oldItem['page']]).convert('RGBA')
                self.assertEqual(page.size, oldPage.size)
                W, H = page.size
                part = lab[view]['items'][iid]['parts'][0]
                cardImage = Image.open(io.BytesIO(base64.b64decode(part['pngMirror'].split(',', 1)[1]))).convert('RGBA')
                rect = next(r for r in item['mesh']['ranges'] if r['name'] == 'part0')
                vertices = sorted(set(item['mesh']['index'][rect['start']:rect['start'] + rect['count']]))
                ux = [uv[i * 2] - item['mesh']['uv'][i * 2] for i in vertices]
                uy = [uv[i * 2 + 1] - item['mesh']['uv'][i * 2 + 1] for i in vertices]
                self.assertTrue(max(ux) - min(ux) < 1e-5 and max(uy) - min(uy) < 1e-5)   # one rigid shift: same layout
                dx, dy = round(ux[0] * W), round(uy[0] * H)
                # only the marked part moves: the sit and wave quads keep their uv
                others = set(range(len(uv) // 2)) - set(vertices)
                self.assertTrue(others and all(uv[i * 2:i * 2 + 2] == item['mesh']['uv'][i * 2:i * 2 + 2] for i in others))
                xs = [item['mesh']['uv'][i * 2] * W for i in vertices]
                ys = [item['mesh']['uv'][i * 2 + 1] * H for i in vertices]
                x0, y0 = round(min(xs)), round(min(ys))
                self.assertEqual(page.crop((x0 + dx, y0 + dy, x0 + dx + cardImage.width, y0 + dy + cardImage.height)).tobytes(), cardImage.tobytes())
                self.assertEqual(page.crop((x0, y0, x0 + cardImage.width, y0 + cardImage.height)).tobytes(),
                                 oldPage.crop((x0, y0, x0 + cardImage.width, y0 + cardImage.height)).tobytes())
                self.assertNotIn('mirrorPage', item)   # it fits in the item's own page

    def test_cards_that_do_not_fit_the_page_go_to_one_new_page_and_a_wrong_size_is_refused(self):
        from PIL import Image
        ex = load_exporter()
        img = Image.new('RGBA', (200, 100), (200, 30, 30, 255))
        it = {'parts': [{'layer': 'head', 'png': data_uri(img), 'pngMirror': data_uri(img)}]}
        mesh = {'uv': [0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5], 'index': [0, 1, 2, 0, 2, 3],
                'ranges': [{'name': 'part0', 'start': 0, 'count': 6}]}
        # the page is full: the only part fills it, so the card needs a page of its own
        pages = [Image.new('RGBA', (256, 128), (0, 0, 0, 0))]
        pages[0].paste(img, (ex.PAD, ex.PAD))
        taken = {0: [(ex.PAD, ex.PAD, 200, 100)]}
        out = ex.pack_mirror_cards('x', it, {'part0': (ex.PAD, ex.PAD, 200, 100)}, mesh, 0, pages, taken)
        self.assertEqual(out['mirrorPage'], 1)
        self.assertEqual(len(pages), 2)
        self.assertEqual(len(out['mirrorUv']), len(mesh['uv']))
        # an item without cards is left alone (no fields, no page)
        plain = {'parts': [{'layer': 'head', 'png': data_uri(img)}]}
        self.assertIsNone(ex.pack_mirror_cards('y', plain, {'part0': (ex.PAD, ex.PAD, 200, 100)}, mesh, 0, pages, taken))
        self.assertEqual(len(pages), 2)
        bad = {'parts': [{'layer': 'head', 'png': data_uri(img), 'pngMirror': data_uri(img.crop((0, 0, 100, 100)))}]}
        with self.assertRaises(SystemExit):
            ex.pack_mirror_cards('z', bad, {'part0': (ex.PAD, ex.PAD, 200, 100)}, mesh, 0, pages, taken)

    def test_a_card_on_the_blink_layer_is_allowed_only_when_it_carries_no_copy_of_the_open_eye(self):
        import numpy as np
        from PIL import Image
        ex = load_exporter()
        h, w = 40, 60
        skin, iris, hair = (250, 210, 185, 255), (150, 90, 40, 255), (30, 18, 14, 255)
        head = np.zeros((h, w, 4), np.uint8); head[:] = skin
        head[12:28, 24:40] = iris                                # the open eye
        closed = head.copy(); closed[12:28, 24:40] = skin
        closed[24:26, 20:44] = hair                              # its closed lash line
        # the eye rect sits at (10, 5) in sheet px; the part's box is the sheet origin, so the window is (10, 5, 60, 40) of it
        eye = {'layer': 'head', 'window': (10, 5, w, h), 'head_open': head, 'frames': [closed, closed]}

        def card_with(copy):
            card = np.zeros((70, 100, 4), np.uint8)
            card[:, 0:8] = hair                                  # a side lock away from the eye
            if copy:
                card[5 + 12:5 + 28, 10 + 24:10 + 40] = (120, 70, 35, 255)   # the card's own copy of the open eye
            return Image.fromarray(card, 'RGBA')

        def pack(card, layer='head', eye_context=eye):
            part = {'layer': layer, 'box': (0, 0), 'png': data_uri(card), 'pngMirror': data_uri(card)}
            mesh = {'uv': [0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.0, 0.5], 'index': [0, 1, 2, 0, 2, 3],
                    'ranges': [{'name': 'part0', 'start': 0, 'count': 6}]}
            pages = [Image.new('RGBA', (512, 256), (0, 0, 0, 0))]
            taken = {0: [(ex.PAD, ex.PAD, 100, 70)]}
            return ex.pack_mirror_cards('hair', {'parts': [part]}, {'part0': (ex.PAD, ex.PAD, 100, 70)}, mesh, 0, pages, taken, eye_context)

        self.assertIn('mirrorUv', pack(card_with(False)))        # no eye copy: the head's own blink shows through it
        with self.assertRaises(SystemExit):
            pack(card_with(True))                                # an eye copy would stay open while the head blinks
        # only cards on the blink layer are checked, and a rig without a blink has nothing to check
        self.assertIn('mirrorUv', pack(card_with(True), layer='back'))
        self.assertIn('mirrorUv', pack(card_with(True), eye_context=None))
        # a card whose window falls outside the part carries nothing at the eye
        far = {**eye, 'window': (500, 500, w, h)}
        self.assertIn('mirrorUv', pack(card_with(True), eye_context=far))


BOY_ITEMS = {'bottom_a': {'slot': 'bottom'}, 'bottom_b': {'slot': 'bottom'}, 'shoes_a': {'slot': 'shoes'},
             'shoes_b': {'slot': 'shoes'}, 'top_a': {'slot': 'top'}}


class LegVariantOwnersTest(unittest.TestCase):
    """Leg drawings are owned per item and exported under their role, so any bottom mixes with any shoes."""

    def setUp(self):
        self.ex = load_exporter()

    def test_item_keyed_drawings_go_to_their_own_item_and_item_pairs_are_composed_not_exported(self):
        keys = ['bottom_a', 'bottom_a+shoes_b', 'bottom_b', 'shoes_a', 'shoes_b']
        owners = self.ex.leg_variant_owners(dict.fromkeys(keys, {}), BOY_ITEMS)
        self.assertEqual(owners, {'bottom_a': [('bottom_a', 'bottom')], 'bottom_b': [('bottom_b', 'bottom')],
                                  'shoes_a': [('shoes_a', 'shoes')], 'shoes_b': [('shoes_b', 'shoes')]})

    def test_slot_keys_of_a_one_item_per_slot_rig_keep_their_pair_on_the_bottom(self):
        items = {'pants': {'slot': 'bottom'}, 'sneakers': {'slot': 'shoes'}, 'polo': {'slot': 'top'}}
        owners = self.ex.leg_variant_owners(dict.fromkeys(['bottom', 'bottom+shoes', 'shoes'], {}), items)
        self.assertEqual(owners, {'pants': [('bottom', 'bottom'), ('bottom+shoes', 'bottom+shoes')],
                                  'sneakers': [('shoes', 'shoes')]})

    def test_slot_keys_belong_to_the_one_item_of_that_slot_without_its_own_key_as_in_the_lab(self):
        # the girl's wardrobe: her QA'd slot drawings stay with her first shoes when a second pair brings its own key
        items = {'pants': {'slot': 'bottom'}, 'mint': {'slot': 'shoes'}, 'white': {'slot': 'shoes'}}
        owners = self.ex.leg_variant_owners(dict.fromkeys(['bottom', 'bottom+shoes', 'shoes', 'white'], {}), items)
        self.assertEqual(owners, {'pants': [('bottom', 'bottom'), ('bottom+shoes', 'bottom+shoes')],
                                  'mint': [('shoes', 'shoes')], 'white': [('white', 'shoes')]})
        with self.assertRaises(SystemExit):   # two shoes without their own key: the slot key names nobody
            self.ex.leg_variant_owners(dict.fromkeys(['shoes'], {}), items)

    def test_bad_keys_stop_the_export(self):
        for key in ('top_a', 'nobody', 'bottom_a+bottom_b', 'bottom_a+shoes_a+shoes_b', 'bottom'):
            with self.assertRaises(SystemExit, msg=key):
                self.ex.leg_variant_owners({key: {}}, BOY_ITEMS)   # 'bottom': two items share the slot


class ItemCardBoxTest(unittest.TestCase):
    """Seated / waving item cards sit at their own sheet box, so cards cut from different fits mix."""

    def setUp(self):
        from PIL import Image
        self.ex = load_exporter()
        self.body = Image.new('RGBA', (40, 30), (0, 0, 0, 0))
        self.card = Image.new('RGBA', (40, 30), (0, 0, 0, 0))
        self.card.paste((200, 10, 10, 255), (12, 20, 18, 26))     # drawn px: x 12..17, y 20..25

    def test_a_card_without_its_own_box_keeps_the_body_box_untrimmed(self):
        cards = self.ex.item_cards('shoes_a', {'sit': data_uri(self.card)}, {'sit': (self.body, [100, 200])})
        self.assertEqual(cards['sit'][1], (100, 200))
        self.assertEqual(cards['sit'][0].size, (40, 30))

    def test_a_card_with_its_own_box_is_trimmed_and_placed_at_its_drawn_pixels(self):
        cards = self.ex.item_cards('shoes_a', {'sit': data_uri(self.card), 'sitBox': [90, 210]},
                                   {'sit': (self.body, [100, 200])})
        image, box = cards['sit']
        self.assertEqual(box, (90 + 12, 210 + 20))
        self.assertEqual(image.size, (6, 6))
        self.assertEqual(image.getpixel((0, 0)), (200, 10, 10, 255))

    def test_a_card_of_another_size_without_a_box_stops_the_export(self):
        from PIL import Image
        with self.assertRaises(SystemExit):
            self.ex.item_cards('shoes_a', {'sit': data_uri(Image.new('RGBA', (41, 30)))}, {'sit': (self.body, [0, 0])})


class PoseOnlyTest(unittest.TestCase):
    def test_a_part_drawn_in_some_poses_only_keeps_that_list_and_a_bad_list_stops_the_export(self):
        ex = load_exporter()
        self.assertEqual(ex.pose_only('top_a', 5, {'poseOnly': 'wave'}), ['wave'])
        self.assertEqual(ex.pose_only('top_a', 3, {'poseOnly': ['walk', 'stand', 'walk']}), ['stand', 'walk'])
        for bad in ([], ['run'], 'jump', 3):
            with self.assertRaises(SystemExit):
                ex.pose_only('top_a', 1, {'poseOnly': bad})


MIXED_BOY = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2/factory/work/boy_pipeline_v8/smoke/basic_a/post/rig.json'


@unittest.skipUnless(MIXED_BOY.exists(), 'factory boy rig not on this machine')
class ExportItemKeyedBoyTest(unittest.TestCase):
    def test_a_factory_fit_exports_one_leg_drawing_per_item_on_the_body_leg_mesh(self):
        with tempfile.TemporaryDirectory() as a:
            subprocess.run([sys.executable, str(HERE / 'export_rig.py'), str(MIXED_BOY), '--out', a], check=True, capture_output=True)
            rig = json.loads((pathlib.Path(a) / 'rig25.json').read_text())
        for name, view in rig['views'].items():
            body = {r['name']: r for r in view['mesh']['ranges']}
            for iid, it in view['items'].items():
                legs = {r['name']: r for r in it['mesh']['ranges'] if r.get('legVariant')}
                role = it['slot'] if it['slot'] in ('bottom', 'shoes') else None
                self.assertEqual(sorted(legs), sorted(f'{ln}@{role}' for ln in ('farLeg', 'nearLeg')) if role else [], f'{name} {iid}')
                for r in legs.values():
                    self.assertEqual(r['legVariant'], role)
                    self.assertEqual(r['count'], body[r['layer']]['count'])   # the body leg's own triangles


if __name__ == '__main__':
    unittest.main()
