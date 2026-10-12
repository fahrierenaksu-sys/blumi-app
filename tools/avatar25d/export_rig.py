"""Export a Workbench 2.5D rig for the app's GPU renderer (apps/mobile/src/features/avatar/rigs/<body>).

One command, deterministic, re-run whenever the lab art changes (e.g. when the real walk lands):
    python3 tools/avatar25d/export_rig.py [path/to/rig_hybrid.json] [--motion path/to/motion_A4.json]
        [--out path/to/output_dir] [--motion-config path/to/avatar_motion.json] [--astc]

--out: the output folder (default below, the girl's `rigs/girl/`; the boy exports with `--out .../avatar/rigs/boy`).
  Every *.png already in it is replaced, so never point it at another rig's folder.
--motion-config: a JSON with any of charScale / walkSpeed / baseWalkSpeed / rampScale, read last (overrides the lab's
  avatar_config.js / avatar_motion.json next to the source rig).
--astc: after the PNG export also write the DERIVED ASTC 4x4 blobs + manifest (with the source PNG sha256) to <out>/astc/
  (compress_pages.py; needs astc-encoder-py==0.1.12). Off by default; the PNG pages are written exactly as without it.
A view's `meta` (body, N, …) and `hybrid.shortsBottom` (boy rig, male/rig) are passed through unchanged.
A view's `breath` (life/NATIVE_PLAN.md) is passed through unchanged. A view's `blink` (front only) is packed: its
`half` and `closed` eye frames go into FREE space of page 0 (no existing part moves, so a rig without `blink` exports
byte-identically), and the view carries `blink` = the eye rect in page-0 px (`rect`; `pad` = how far around it the
frames also hold the head, so the runtime may redirect that much more), each frame's px offset from it and the timing.

A worn item part with `pngMirror` (same size as its `png`; a drawing already flipped for the mirrored directions, so the
marker sits on the right side AFTER the renderer's whole-avatar flip) gets that card packed into FREE space of the
item's page (else one extra page): the item then carries `mirrorUv` (same length as its mesh `uv`; only the vertices of
parts with a card differ) and, only when the cards overflowed, `mirrorPage`. Mesh, weights and ids are unchanged; an
item without `pngMirror` exports exactly as before.

--motion (or a `motion` already inside a rig view): the retargeted 3D walk (lab40, rig25d/walk3d/v3/a4). Each view
with one carries it as `motion` (per key pose: hips offset, near-leg-in-front flag, turn + stretch per bone in the
view's bone order) and drops its painted walk cards (body and items): the standing drawing walks instead.

Input  : ~/BlumiArtWorkbench/avatar25-v2/lab40/rig_A4_walk.json (else lab39/rig_hybrid.json; SCHEMA.md). Never modified.
Output : apps/mobile/src/features/avatar/rigs/girl/
           rig25.json                     geometry + bones + draw ranges for every view and item
           <view>_body.png                one atlas per view: skinned layers, torso variants, walk frames, sit, wave
           <view>_<item id>.png           one atlas per worn item per view
Full resolution (owner decision 2026-10-08: quality first). Vertices are in sheet px, y down.

Palette slots: 0..B-1 = bones (rig order); B = ROOT (identity, cards placed in sheet px); B+1 = WAVE (whole-arm card
about the shoulder pivot).
"""
import base64, io, json, pathlib, sys
from PIL import Image

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
ARGS = sys.argv[1:]


def _take_option(flag):
    if flag not in ARGS:
        return None
    k = ARGS.index(flag)
    value = pathlib.Path(ARGS[k + 1])
    del ARGS[k:k + 2]
    return value


MOTION_SRC = _take_option('--motion')
OUT_ARG = _take_option('--out')
MOTION_CONFIG_ARG = _take_option('--motion-config')
ASTC = '--astc' in ARGS
if ASTC:
    ARGS.remove('--astc')
# default source: lab40's fixed rig (shared by the web lab and the app: walk weights, leg variants, walking torso,
# retargeted walk inside each view), else the lab39 hybrid rig
_LAB = pathlib.Path.home() / 'BlumiArtWorkbench/avatar25-v2'
_DEFAULT_SRC = next((p for p in (_LAB / 'lab40/rig_A4_walk.json', _LAB / 'lab39/rig_hybrid.json') if p.exists()), _LAB / 'lab39/rig_hybrid.json')
SRC = pathlib.Path(ARGS[0]) if ARGS else _DEFAULT_SRC
import os
OUT = OUT_ARG.resolve() if OUT_ARG else pathlib.Path(os.environ['BAKE25_OUT']) if os.environ.get('BAKE25_OUT') else ROOT_DIR / 'apps/mobile/src/features/avatar/rigs/girl'
PAD = 6   # source px around each packed part: still 3 px at the 0.5 page scale, so mips do not bleed between parts
SLOT_ORDER = {'shoes': 0.15, 'bottom': 0.3, 'top': 0.45, 'hair': 0.6}
LOWER_Z = 2.5
LOWER_SLOTS = {'shoes', 'bottom'}


def decode(uri):
    return Image.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))).convert('RGBA')


class Atlas:
    """Shelf packer, deterministic (insertion order sorted by height)."""

    def __init__(self):
        self.items = []

    def add(self, key, img):
        self.items.append((key, img))

    def pack(self, width=2048):
        order = sorted(range(len(self.items)), key=lambda i: (-self.items[i][1].height, self.items[i][0]))
        x = y = shelf = 0
        rects = {}
        for i in order:
            key, im = self.items[i]
            w, h = im.width + PAD * 2, im.height + PAD * 2
            if x + w > width:
                x, y, shelf = 0, y + shelf, 0
            rects[key] = (x + PAD, y + PAD, im.width, im.height)
            x += w
            shelf = max(shelf, h)
        H = y + shelf
        canvas = Image.new('RGBA', (width, H), (0, 0, 0, 0))
        for key, im in self.items:
            r = rects[key]
            canvas.paste(im, (r[0], r[1]))
        return canvas, rects


class Mesh:
    def __init__(self):
        self.pos, self.uv, self.joints, self.weights, self.index = [], [], [], [], []
        self.page, self.arm = [], []   # per vertex: texture-array page, folded-arm clip group (0 none, 1 near, 2 far)
        # per vertex, the weights the retargeted walk uses (lab40 fix_rig.py `walkWeights`); a copy of the drawing's
        # own weights where none are baked. Dumped only when some range has baked ones (that range gets `walk: True`).
        self.walk_joints, self.walk_weights, self.has_walk = [], [], False
        self.ranges = []

    def add_range(self, name, order, tris_fn, **extra):
        start = len(self.index)
        baked = tris_fn()
        if baked:
            extra = {**extra, 'walk': True}
        self.ranges.append({'name': name, 'order': order, 'start': start, 'count': len(self.index) - start, **extra})

    @staticmethod
    def top4(w, bone_idx):
        ws = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(x for _, x in ws) or 1
        return ([bone_idx[n] for n, _ in ws] + [0] * (4 - len(ws)),
                [round(x / tot, 5) for _, x in ws] + [0] * (4 - len(ws)))

    def skinned(self, L, rect, atlas_size, bone_idx, page=0, arm=0):
        aw, ah = atlas_size
        base = len(self.pos) // 2
        rx, ry, rw, rh = rect
        walk = L.get('walkWeights')
        if walk is not None and len(walk) != len(L['verts']):
            raise SystemExit(f"walkWeights of {L.get('name') or L.get('layer')}: {len(walk)} for {len(L['verts'])} verts")
        self.has_walk = self.has_walk or walk is not None
        for i, (v, uv, w) in enumerate(zip(L['verts'], L['uvs'], L['weights'])):
            self.pos += [round(v[0], 3), round(v[1], 3)]
            # lab uvs: three.js convention (v up) inside the layer png
            self.uv += [round((rx + uv[0] * rw) / aw, 6), round((ry + (1 - uv[1]) * rh) / ah, 6)]
            j, q = self.top4(w, bone_idx)
            self.joints += j
            self.weights += q
            wj, wq = self.top4(walk[i], bone_idx) if walk is not None else (j, q)
            self.walk_joints += wj
            self.walk_weights += wq
            self.page.append(page)
            self.arm.append(arm)
        self.index += [base + i for i in L['index']]
        return walk is not None

    def quad(self, x0, y0, w, h, rect, atlas_size, slot, uv_rect=None, page=0):
        aw, ah = atlas_size
        rx, ry, rw, rh = uv_rect or rect
        base = len(self.pos) // 2
        for (cx, cy) in [(0, 0), (1, 0), (1, 1), (0, 1)]:
            self.pos += [round(x0 + cx * w, 3), round(y0 + cy * h, 3)]
            self.uv += [round((rx + cx * rw) / aw, 6), round((ry + cy * rh) / ah, 6)]
            self.joints += [slot, 0, 0, 0]
            self.weights += [1, 0, 0, 0]
            self.walk_joints += [slot, 0, 0, 0]
            self.walk_weights += [1, 0, 0, 0]
            self.page.append(page)
            self.arm.append(0)
        self.index += [base, base + 1, base + 2, base, base + 2, base + 3]

    def dump(self):
        out = {'pos': self.pos, 'uv': self.uv, 'joints': self.joints, 'weights': self.weights, 'index': self.index,
               'page': self.page, 'arm': self.arm, 'ranges': self.ranges}
        if self.has_walk:
            out.update(walkJoints=self.walk_joints, walkWeights=self.walk_weights)
        return out


def walk_layout(v):
    """Per frame: card placement in sheet px (waist on standing waist, sole on standing ground) + timing."""
    W, st = v['hybrid']['walk'], v['hybrid']['waist']
    gx, gy = v['ground']
    F, n = W['frames'], len(W['frames'])
    valid = sorted(f['waist']['x1'] - f['waist']['x0'] for f in F if f['waist'].get('valid', True) is not False)
    sx = (st['x1'] - st['x0']) / valid[len(valid) >> 1]
    sy = (gy - st['y']) / (sum(f['ground'] - f['waist']['y'] for f in F) / n)
    cw, ch = W['cell']
    frames = []
    for f in F:
        px, py = f['rect'][0] % cw, f['rect'][1] % ch
        c0x, c0y = f['rect'][0] - px, f['rect'][1] - py
        cx, gyc = px + f['waist']['cx'], py + f['ground']
        left = st['cx'] - cx * sx
        top = gy - gyc * sy
        drop = (gy - (f['ground'] - f['waist']['y']) * sy) - st['y']
        frames.append({'cell': [c0x, c0y], 'x': left, 'y': top, 'w': cw * sx, 'h': ch * sy, 'drop': drop,
                       'advance': f.get('advance', [0, 0])})
    fwd = W.get('forward', -1)
    adv = [max(0.0, fwd * fr['advance'][0] * sx) for fr in frames]
    total = sum(adv)
    if not total > 0:
        S = W.get('stride') or [0.15 * v['height'] / sx, 0]
        adv = [abs(S[0]) * sx / n] * n
        total = sum(adv)
    acc, start = 0.0, []
    for a in adv:
        start.append(acc / total)
        acc += a
    return {'frames': frames, 'cell': [cw, ch], 'start': [round(s, 6) for s in start], 'strideLen': total,
            'forward': fwd, 'legPhase': W.get('legPhase', 0), 'sx': sx, 'sy': sy}


# Stored page resolution (texture memory budget, 2026-10-08). Measured on an iPhone 17 (3x) in the Simulator: in a
# MiniRoom (108 pt avatar box, the largest room size; the MiniRoom camera only zooms out) she is 311 device px tall,
# and in My Room about 280-300 px. The drawing is ~967 sheet px tall, so 0.5 keeps ~1.55 texels per device pixel
# (mip-mapped, so never soft), with headroom for a ~15% larger character. One dressed avatar, both views: about
# 17 MB of textures instead of 68 MB at 1:1. Every page of a view is one layer of one GPU texture array, so body and
# item pages share the scale. Override with BAKE25_PAGE_SCALE (1 = full source resolution).
# torso drawings on the torso layer's mesh: standing, without the shorts (hybrid lower cards), without the arms,
# seated, seated with the drawn arms, and walking (lab40 `torsoWalk`, shown while the retargeted walk plays)
TORSO_VARIANTS = ('torso', 'torsoUpper', 'torsoNoArms', 'torsoSit', 'torsoCardArms', 'torsoWalk')
PAGE_STORE_SCALE = float(os.environ.get('BAKE25_PAGE_SCALE', '0.5'))
PAGE_W = 2048   # texture-array page: page 0 = body, then two item atlases (1024 wide) per page; height fits the tallest
ARM_CODE = {'nearArm': 1, 'farArm': 2}


# Blink (life/NATIVE_PLAN.md): the runtime redirects the head's eye rect to one of these frames in the fragment shader.
BLINK_FRAMES = ('half', 'closed')
# Source px of the head layer copied around each frame. The plan asks for at least 4; 32 keeps the LANCZOS page
# downscale (6 px reach at 0.5) and mip levels 0..2 of the stored page equal to the head for BLINK_REDIRECT_PAD and more
# around the rect.
BLINK_MARGIN = 32
# The runtime redirects the eye rect grown by this many source px. The art changes a few pixels ON the rect's outermost
# ring (far-eye lashes at the face contour), so a redirect that stopped exactly at the rect would cut between the open
# head and the frame there. Grown into the copied margin, the redirect border lies where both are the same pixels.
BLINK_REDIRECT_PAD = 8
# Frame offsets are multiples of this (source px): the 0.5 page downscale, the ASTC 4x4 block grid and the mip levels
# 0..2 of the stored page then see the frame at the same phase as the head, so unchanged pixels stay unchanged.
BLINK_ALIGN = 32


def free_spot(size, taken, page_size, phase, align):
    """First position (rows, then columns) congruent to `phase` modulo `align` where a `size` box lies inside the page
    and keeps the packer's padding (PAD on each side of every part) from every rect in `taken`. None: no room."""
    w, h = size
    pw, ph = page_size
    gap = PAD * 2
    for y in range(PAD + (phase[1] - PAD) % align, ph - h - PAD + 1, align):
        for x in range(PAD + (phase[0] - PAD) % align, pw - w - PAD + 1, align):
            if all(x + w + gap <= tx or tx + tw + gap <= x or y + h + gap <= ty or ty + th + gap <= y
                   for tx, ty, tw, th in taken):
                return x, y
    return None


def pack_blink(blink, layers, rects, page):
    """Paste the blink frames into free space of `page` (page 0) and return the runtime's `blink` entry."""
    layer = blink.get('layer')
    if layer not in layers or layer not in rects:
        raise SystemExit(f'blink: unknown layer {layer!r}')
    if blink.get('mode', 'replace') != 'replace':
        raise SystemExit(f"blink: mode {blink.get('mode')!r} is not supported (replace only)")
    src = layers[layer]
    rx, ry, rw, rh = blink['rect']
    if rx < 0 or ry < 0 or rw <= 0 or rh <= 0 or rx + rw > src.width or ry + rh > src.height:
        raise SystemExit(f"blink: rect {blink['rect']} is outside the {layer} layer {src.size}")
    unknown = sorted({name for name, _ in blink['seq']} - set(BLINK_FRAMES))
    if unknown or any(not seconds > 0 for _, seconds in blink['seq']):
        raise SystemExit(f"blink: bad seq {blink['seq']}")
    hx, hy = rects[layer][0], rects[layer][1]
    M = BLINK_MARGIN
    taken = list(rects.values())
    offsets = {}
    for name in BLINK_FRAMES:
        frame = decode(blink['frames'][name])
        if frame.size != (rw, rh):
            raise SystemExit(f'blink: frame {name} is {frame.size}, the rect is {(rw, rh)}')
        # the head around the rect (transparent outside the layer), then the frame REPLACES the rect, alpha included
        tile = src.crop((rx - M, ry - M, rx + rw + M, ry + rh + M))
        tile.paste(frame, (M, M))
        spot = free_spot(tile.size, taken, page.size, ((hx + rx - M) % BLINK_ALIGN, (hy + ry - M) % BLINK_ALIGN), BLINK_ALIGN)
        if spot is None:
            raise SystemExit(f'blink: no free room in page 0 for frame {name} {tile.size}')
        box = (spot[0], spot[1], spot[0] + tile.width, spot[1] + tile.height)
        if page.crop(box).getbbox() is not None:
            raise SystemExit(f'blink: the spot for frame {name} is not empty')
        page.paste(tile, spot)
        taken.append((spot[0], spot[1], tile.width, tile.height))
        offsets[name] = [spot[0] + M - (hx + rx), spot[1] + M - (hy + ry)]
    pad = max(0, min(BLINK_REDIRECT_PAD, rx, ry, src.width - rx - rw, src.height - ry - rh))   # never leaves the layer
    return {'page': 0, 'rect': [hx + rx, hy + ry, rw, rh], 'pad': pad, 'frames': offsets,
            'seq': [[name, seconds] for name, seconds in blink['seq']], 'gapS': list(blink['gapS']),
            'doubleP': blink.get('doubleP', 0), 'doubleGapS': blink.get('doubleGapS', 0)}


# Blink over worn items: a head-layer item (hair) may hold its own copy of the open eyes (baked into its drawing
# under the bangs; the girl's pageboy hair has the far eye). Drawn after the head, that copy would stay open while the
# head's eye rect shows a closed frame. So each such item gets ONE patch, used by every blink frame: the item around
# the eye rect with its eye pixels made transparent (the head's frame shows through them), packed into free space of
# the item's page; the runtime redirects the item's rect there while a frame shows. Open eyes read nothing new.
BLINK_ITEMS_MAX = 2          # the shader's item redirects (avatar25Life.ts AVATAR25_BLINK_ITEMS)
BLINK_EYE_SKIN_DIST = 60     # an open-head pixel at least this far (RGB) from the face's skin is the eye drawing
BLINK_EYE_CHANGE = 10        # ... and a frame changes it by more than this (any RGBA channel)
BLINK_ITEM_SKIN_DIST = 60    # an item pixel this close to the skin colour is face showing between strands, not hair
BLINK_HAIR_DARK = 45         # mean RGB at most this: a dark hair strand
BLINK_EDGE_TRANSITION = 3    # light pixels a hair strand's run may cross after its dark body (its soft inner edge)
BLINK_EDGE_EYE_CAP = 6       # px a strand's run may reach into the eye drawing (side locks overlap the outer lashes)
BLINK_HAIR_MISMATCH = 90     # an item pixel this far (RGB) from the head's open pixel it covers is hair, not the eye copy
BLINK_LASH_SAT = 0.65        # an eye copy's lash line: HSV saturation above this (hair brown is ~0.45-0.5) ...
BLINK_LASH_VALUE = 90        # ... and its brightest channel below this (dark)
BLINK_COPY_REACH = 4         # px around the eye drawing that still hold the copy's fringe (its outer rim, lash dots)


def _dilate(mask, n):
    import numpy as np
    out = mask.copy()
    for _ in range(n):
        grown = out.copy()
        grown[1:] |= out[:-1]; grown[:-1] |= out[1:]; grown[:, 1:] |= out[:, :-1]; grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def _flood(seed, through):
    """Pixels of `through` 4-connected to `seed` (seed included)."""
    out = seed.copy()
    while True:
        grown = _dilate(out, 1) & (through | seed)
        if (grown == out).all():
            return out
        out = grown


def blink_item_cut(head_open, frames, item):
    """Item pixels (same size crops of the eye rect, RGBA uint8) that copy the open eye: True = cleared in the patch.
    Only the eye copy goes: item pixels at the head's eye drawing (iris, sclera, lashes, its rim and loose dots) that
    are not hair. Hair keeps every pixel: strands that enter the rect from its sides or top (runs from the edge) and
    item pixels joined by a thick path to the item outside the eye (bang tips, side locks hanging into it)."""
    import numpy as np
    O = head_open.astype(float); P = item.astype(float); F = [f.astype(float) for f in frames]
    h, w = O.shape[:2]
    unchanged = np.all([np.abs(O - f).max(-1) <= 6 for f in F], 0) & (O[..., 3] > 250)
    if not unchanged.any():
        return np.zeros((h, w), bool)
    skin = np.median(O[unchanged][:, :3], 0)
    eye = ((np.sqrt(((O[..., :3] - skin) ** 2).sum(-1)) > BLINK_EYE_SKIN_DIST)
           & np.any([np.abs(O - f).max(-1) > BLINK_EYE_CHANGE for f in F], 0) & (O[..., 3] >= 128))
    opaque = np.all([f[..., 3] >= 128 for f in F], 0)   # where every frame covers the face (never cut to a hole)
    drawn = P[..., 3] >= 128
    lum = P[..., :3].mean(-1)
    skinlike = np.sqrt(((P[..., :3] - skin) ** 2).sum(-1)) <= BLINK_ITEM_SKIN_DIST
    protect = np.zeros((h, w), bool)
    lines = ([[(y, x) for x in range(w)] for y in range(h)] + [[(y, x) for x in range(w - 1, -1, -1)] for y in range(h)]
             + [[(y, x) for y in range(h)] for x in range(w)])
    for line in lines:
        light, in_eye = None, 0
        for y, x in line:
            if not drawn[y, x] or skinlike[y, x]:
                break
            in_eye += 1 if eye[y, x] else 0
            if in_eye > BLINK_EDGE_EYE_CAP:
                break
            if light is None and lum[y, x] > BLINK_HAIR_DARK:
                light = 0
            if light is not None:
                light += 1
                if light > BLINK_EDGE_TRANSITION:
                    break
            protect[y, x] = True
    # hair = item pixels joined to the item outside the eye zone by a path at least 3 px thick (thinner threads vanish
    # on the half-size page); inside the eye drawing only pixels above the copy's upper lash line or ones that do not
    # look like the head's eye there count as a path (the copy's lashes touch the dark side lock). The rest of the zone is the copy: iris, lashes, rim, dots.
    zone = _dilate(eye, BLINK_COPY_REACH)
    mismatch = np.sqrt(((P[..., :3] - O[..., :3]) ** 2).sum(-1)) > BLINK_HAIR_MISMATCH
    rgb = P[..., :3]; mx = rgb.max(-1)
    lash = drawn & eye & ((mx - rgb.min(-1)) > BLINK_LASH_SAT * np.maximum(mx, 1)) & (mx < BLINK_LASH_VALUE)
    has = lash.any(0)
    top = np.where(has, lash.argmax(0), 0)                 # per column: the copy's upper lash line (vivid dark brown)
    above = np.arange(h)[:, None] < top[None, :]          # item px above it are the bangs over the eye, never the eye
    path = drawn & (~eye | mismatch | above)
    thick = path & _dilate(~_dilate(~path, 1), 1)
    border = np.zeros((h, w), bool); border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    outside = _flood(border & drawn & ~zone, drawn & ~zone)
    hair = _flood(outside, thick & zone)
    hair |= path & zone & _dilate(hair, 1) | protect    # the strand's own edge px (the thickness test rounds them off)
    cut = zone & drawn & opaque & ~hair
    cut &= _dilate(~_dilate(~cut, 1), 1)              # no 1-2 px slivers cut into a strand (they blur into its edge)
    kept = drawn & ~cut
    loose = kept & ~_flood(outside, kept) & opaque    # bits left with no tie to the item outside: specks
    return cut | loose


def pack_blink_items(src_blink, head_layer, head_box, items_src, item_rects, pages, page_taken):
    """The item patches (see above) for the view's `blink.items`; pastes each into free space of its item's page."""
    import numpy as np
    rx, ry, rw, rh = src_blink['rect']
    sx, sy = head_box[0] + rx, head_box[1] + ry          # the eye rect in sheet px
    head_open = np.asarray(head_layer.crop((rx, ry, rx + rw, ry + rh)))
    frames = [np.asarray(decode(src_blink['frames'][n])) for n in BLINK_FRAMES]
    M = BLINK_MARGIN
    out = []
    for iid, it, page in items_src:
        for k, part in enumerate(it.get('parts', [])):
            if part['layer'] != src_blink.get('layer'):
                continue
            img = decode(part['png'])
            px, py = part['box'][0], part['box'][1]
            ox, oy = sx - px, sy - py                           # the eye rect in the part's own px
            if ox + rw <= 0 or oy + rh <= 0 or ox >= img.width or oy >= img.height:
                continue
            crop = np.asarray(img.crop((ox, oy, ox + rw, oy + rh)))   # transparent where the part is not
            cut = blink_item_cut(head_open, frames, crop)
            if not cut.any():
                continue
            if len(out) >= BLINK_ITEMS_MAX:
                raise SystemExit(f'blink: more than {BLINK_ITEMS_MAX} items hold an eye copy ({iid})')
            tile = np.asarray(img.crop((ox - M, oy - M, ox + rw + M, oy + rh + M))).copy()
            tile[M:M + rh, M:M + rw][cut] = 0
            tile = Image.fromarray(tile, 'RGBA')
            ix, iy = item_rects[iid][f'part{k}'][0], item_rects[iid][f'part{k}'][1]
            spot = free_spot(tile.size, page_taken[page], pages[page].size, ((ix + ox - M) % BLINK_ALIGN, (iy + oy - M) % BLINK_ALIGN), BLINK_ALIGN)
            if spot is None:
                raise SystemExit(f'blink: no free room in page {page} for the {iid} eye patch {tile.size}')
            box = (spot[0], spot[1], spot[0] + tile.width, spot[1] + tile.height)
            if pages[page].crop(box).getbbox() is not None:
                raise SystemExit(f'blink: the spot for the {iid} eye patch is not empty')
            pages[page].paste(tile, spot)
            page_taken[page].append((spot[0], spot[1], tile.width, tile.height))
            pad = max(0, min(BLINK_REDIRECT_PAD, ox, oy, img.width - ox - rw, img.height - oy - rh))   # never leaves the part
            full_cut = np.zeros((tile.height, tile.width), bool); full_cut[M:M + rh, M:M + rw] = cut
            out.append({'item': iid, 'page': page, 'rect': [ix + ox, iy + oy, rw, rh], 'pad': pad,
                        'offset': [spot[0] + M - (ix + ox), spot[1] + M - (iy + oy)], 'cutPx': int(cut.sum()),
                        '_keep': (page, (ix + ox - M, iy + oy - M), spot, full_cut)})
    return out


def pack_mirror_cards(iid, it, ir, mesh, page, pages, page_taken, blink_layer=None, holds_blink_patch=False):
    """Mirror cards (see the docstring): returns {'mirrorUv': [...], 'mirrorPage': n?} for an item whose parts carry
    `pngMirror`, else None. Each card is pasted at the same phase modulo BLINK_ALIGN as its part (so both resample
    alike), in free space of the item's page, else together on one new page appended to `pages`."""
    cards = [(k, decode(p['pngMirror'])) for k, p in enumerate(it.get('parts', [])) if p.get('pngMirror')]
    if not cards:
        return None
    for k, card in cards:
        part = it['parts'][k]
        if card.size != decode(part['png']).size:
            raise SystemExit(f"mirror: {iid} part{k} card is {card.size}, its drawing is {decode(part['png']).size}")
        if holds_blink_patch and part['layer'] == blink_layer:
            raise SystemExit(f'mirror: {iid} part{k} is the blink layer and the item holds an eye patch; cut the patch from the card first')
    page_size = pages[page].size

    def place(taken):
        spots, taken = [], list(taken)
        if target != page:
            # on a new page a card must not land on its drawing's own position: the runtime tells cards apart by uv
            taken += [(ir[f'part{k}'][0], ir[f'part{k}'][1], 1, 1) for k, _ in cards]
        for k, card in cards:
            r = ir[f'part{k}']
            spot = free_spot(card.size, taken, page_size, (r[0] % BLINK_ALIGN, r[1] % BLINK_ALIGN), BLINK_ALIGN)
            if spot is None:
                return None
            taken.append((spot[0], spot[1], card.width, card.height))
            spots.append(spot)
        return spots

    target = page
    spots = place(page_taken[page])
    if spots is None:
        target = len(pages)
        pages.append(Image.new('RGBA', page_size, (0, 0, 0, 0)))
        page_taken[target] = []
        spots = place([])
        if spots is None:
            raise SystemExit(f'mirror: the cards of {iid} do not fit one page')
    uv = list(mesh['uv'])
    ranges = {r['name']: r for r in mesh['ranges']}
    for (k, card), spot in zip(cards, spots):
        box = (spot[0], spot[1], spot[0] + card.width, spot[1] + card.height)
        if pages[target].crop(box).getbbox() is not None:
            raise SystemExit(f'mirror: the spot for the {iid} part{k} card is not empty')
        pages[target].paste(card, spot)
        page_taken[target].append((spot[0], spot[1], card.width, card.height))
        r, rng = ir[f'part{k}'], ranges[f'part{k}']
        du, dv = (spot[0] - r[0]) / page_size[0], (spot[1] - r[1]) / page_size[1]
        for vtx in sorted(set(mesh['index'][rng['start']:rng['start'] + rng['count']])):
            uv[vtx * 2], uv[vtx * 2 + 1] = round(mesh['uv'][vtx * 2] + du, 6), round(mesh['uv'][vtx * 2 + 1] + dv, 6)
            if target != page and (uv[vtx * 2], uv[vtx * 2 + 1]) == (mesh['uv'][vtx * 2], mesh['uv'][vtx * 2 + 1]):
                raise SystemExit(f'mirror: {iid} part{k} card sits at its own drawing\'s uv on another page (the runtime tells the cards apart by uv)')
    out = {'mirrorUv': uv}
    if target != page:
        out['mirrorPage'] = target
    return out


def restore_blink_item_hair(stored, scale, keeps):
    """The page is resized as a whole (LANCZOS spreads a cleared pixel ~3 stored px), so a patch's hair would drift
    a few levels next to the cut. Give every stored patch texel that no cut source px falls in the item's own stored
    texel instead: during a blink only the cut's texels read differently."""
    import numpy as np
    a = np.asarray(stored).copy()
    for (sx, sy), (tx, ty), cut in keeps:
        h, w = cut.shape
        x0, y0 = int(sx * scale), int(sy * scale); X0, Y0 = int(tx * scale), int(ty * scale)
        sw, sh = int(np.ceil(w * scale)), int(np.ceil(h * scale))
        foot = np.zeros((sh, sw), bool)
        ys, xs = np.nonzero(cut)
        foot[(ys * scale).astype(int), (xs * scale).astype(int)] = True
        a[Y0:Y0 + sh, X0:X0 + sw][~foot] = a[y0:y0 + sh, x0:x0 + sw][~foot]
    return Image.fromarray(a, stored.mode)


def export_motion(M, bone_names):
    """The retargeted walk in the view's bone order: [turn, stretch] per bone, flattened (doll25 A[n] ?? [0, 1])."""
    frames = []
    for f in M['frames']:
        pose = []
        for n in bone_names:
            th, rho = f['bones'].get(n, [0, 1])
            pose += [round(th, 5), round(rho, 5)]
        frames.append({'root': [round(f['root'][0], 3), round(f['root'][1], 3)], 'nearFront': bool(f['nearFront']), 'pose': pose})
    unknown = sorted({n for f in M['frames'] for n in f['bones']} - set(bone_names))
    if unknown:
        raise SystemExit(f'motion bones not in the rig: {unknown}')
    return {'stancePx': [round(x, 3) for x in M['stancePx']], 'frames': frames}


def export_view(name, v, motion=None):
    hy = v['hybrid']
    motion = motion or v.get('motion')
    bone_names = list(v['bones'].keys())
    bone_idx = {n: i for i, n in enumerate(bone_names)}
    B = len(bone_names)
    ROOT, WAVE = B, B + 1
    atlas = Atlas()
    layer_images = {L['name']: decode(L['png']) for L in v['layers']}
    for L in v['layers']:
        atlas.add(L['name'], layer_images[L['name']])
    for k in TORSO_VARIANTS[1:]:
        if hy.get(k):
            atlas.add(k, decode(hy[k]))
    # bare legs drawn for what is worn (lab40 fix_rig.py `legVariants`, key 'bottom', 'shoes' or 'bottom+shoes'):
    # a range `<leg>@<key>` with the body leg layer's mesh and that drawing, stored with the item that key needs
    # (trousers for 'bottom…', else shoes), so its texels load only while that item is worn
    leg_variants = {k: m for k, m in sorted((hy.get('legVariants') or {}).items())}
    slot_item = {it['slot']: iid for iid, it in v.get('items', {}).items()}
    variant_owner = {}
    for key in leg_variants:
        owner = slot_item.get('bottom' if 'bottom' in key.split('+') else 'shoes')
        if owner is None:
            raise SystemExit(f'leg variant {key}: no item in that slot')
        variant_owner.setdefault(owner, []).append(key)
    # no painted walk yet (lab39 2026-10-08): the runtime steps the standing drawing's own skinned legs
    # a retargeted walk replaces the painted walk cards (body and items): they are not bundled
    walk_img = decode(hy['walk']['atlas']) if hy.get('walk') and not motion else None
    if walk_img is not None:
        atlas.add('walk', walk_img)
    sit_img, wave_img = decode(hy['sit']['card']), decode(hy['wave']['card'])
    atlas.add('sit', sit_img)
    atlas.add('wave', wave_img)
    img, rects = atlas.pack(PAGE_W)
    # every item atlas is packed first so the page height (shared by all layers of the array) is known
    item_atlases = {}
    for iid, it in sorted(v.get('items', {}).items()):
        walk_card = decode(it['walk']) if it.get('walk') and walk_img is not None else None
        ia = Atlas()
        for k, p in enumerate(it.get('parts', [])):
            ia.add(f'part{k}', decode(p['png']))
        for pose in ('sit', 'wave'):
            if it.get(pose):
                ia.add(pose, decode(it[pose]))
        if walk_card is not None:
            ia.add('walk', walk_card)
        for key in variant_owner.get(iid, []):
            for ln, png in sorted(leg_variants[key].items()):
                ia.add(f'{ln}@{key}', decode(png))
        item_atlases[iid] = (*ia.pack(PAGE_W // 2), walk_card is not None)
    page_h = max([img.height] + [a[0].height for a in item_atlases.values()])
    page_h = (page_h + 15) // 16 * 16
    PAGE = (PAGE_W, page_h)
    pages = [Image.new('RGBA', PAGE, (0, 0, 0, 0))]
    pages[0].paste(img, (0, 0))
    blink = pack_blink(v['blink'], layer_images, rects, pages[0]) if v.get('blink') else None

    mesh = Mesh()
    layer_order = {L['name']: i for i, L in enumerate(v['layers'])}
    for L in v['layers']:
        arm = ARM_CODE.get(L['name'], 0)
        if L['name'] == 'torso':
            for variant in TORSO_VARIANTS:
                if variant in rects:
                    mesh.add_range(variant, layer_order['torso'], lambda vv=variant: mesh.skinned(L, rects[vv], PAGE, bone_idx))
        else:
            mesh.add_range(L['name'], layer_order[L['name']], lambda LL=L, arm=arm: mesh.skinned(LL, rects[LL['name']], PAGE, bone_idx, 0, arm))

    wl = walk_layout(v) if walk_img is not None else None
    if wl:
        wr = rects['walk']
        cw, ch = wl['cell']
        for i, fr in enumerate(wl['frames']):
            uvr = (wr[0] + fr['cell'][0], wr[1] + fr['cell'][1], cw, ch)
            mesh.add_range(f'walk{i}', LOWER_Z, lambda fr=fr, uvr=uvr: mesh.quad(fr['x'], fr['y'], fr['w'], fr['h'], None, PAGE, ROOT, uvr))
    S = hy['sit']
    mesh.add_range('sit', 4.5 if S.get('front') else LOWER_Z,
                   lambda: mesh.quad(S['box'][0], S['box'][1], sit_img.width, sit_img.height, rects['sit'], PAGE, ROOT))
    Wv = hy['wave']
    mesh.add_range('wave', layer_order['nearArm'],
                   lambda: mesh.quad(Wv['box'][0], Wv['box'][1], wave_img.width, wave_img.height, rects['wave'], PAGE, WAVE))

    items = {}
    item_rects, page_taken, items_src = {}, {}, []
    for k_item, (iid, it) in enumerate(sorted(v.get('items', {}).items())):
        page = 1 + k_item // 2
        xoff = (k_item % 2) * (PAGE[0] // 2)
        iimg, ir, has_walk = item_atlases[iid]
        while len(pages) <= page:
            pages.append(Image.new('RGBA', PAGE, (0, 0, 0, 0)))
        pages[page].paste(iimg, (xoff, 0))
        ir = {k: (r[0] + xoff, r[1], r[2], r[3]) for k, r in ir.items()}
        item_rects[iid] = ir
        page_taken.setdefault(page, []).extend(ir.values())
        items_src.append((iid, it, page))
        im = Mesh()
        f = SLOT_ORDER.get(it['slot'], 0.5)
        lower = it['slot'] in LOWER_SLOTS
        for k, p in enumerate(it.get('parts', [])):
            stand_only = lower and p['layer'] in ('torso', 'farLeg', 'nearLeg')
            im.add_range(f'part{k}', layer_order.get(p['layer'], 3) + f,
                         lambda p=p, k=k: im.skinned(p, ir[f'part{k}'], PAGE, bone_idx, page, ARM_CODE.get(p['layer'], 0)),
                         layer=p['layer'], standOnly=stand_only)
        body_layers = {L['name']: L for L in v['layers']}
        for key in variant_owner.get(iid, []):
            for ln in sorted(leg_variants[key]):
                # drawn exactly where (and as) the body leg is: its order, its mesh, its own weights
                im.add_range(f'{ln}@{key}', layer_order[ln],
                             lambda ln=ln, key=key: im.skinned({**body_layers[ln], 'walkWeights': None}, ir[f'{ln}@{key}'], PAGE, bone_idx, page, 0),
                             layer=ln, legVariant=key)
        if it.get('sit'):
            im.add_range('sit', (4.5 if S.get('front') else LOWER_Z) + f,
                         lambda: im.quad(S['box'][0], S['box'][1], sit_img.width, sit_img.height, ir['sit'], PAGE, ROOT, None, page))
        if it.get('wave'):
            im.add_range('wave', layer_order['nearArm'] + f,
                         lambda: im.quad(Wv['box'][0], Wv['box'][1], wave_img.width, wave_img.height, ir['wave'], PAGE, WAVE, None, page))
        if has_walk:
            iw = ir['walk']
            for i, fr in enumerate(wl['frames']):
                uvr = (iw[0] + fr['cell'][0], iw[1] + fr['cell'][1], cw, ch)
                im.add_range(f'walk{i}', LOWER_Z + f, lambda fr=fr, uvr=uvr: im.quad(fr['x'], fr['y'], fr['w'], fr['h'], None, PAGE, ROOT, uvr, page))
        items[iid] = {'slot': it['slot'], 'lift': it.get('lift', 0), 'page': page,
                      'hasWalk': has_walk, 'mesh': im.dump()}

    blink_keeps = {}   # stored page -> the item patches whose untouched texels are copied back after resizing
    if blink is not None:
        head = v['blink'].get('layer')
        head_box = next((L['box'] for L in v['layers'] if L['name'] == head), None)   # the head layer in sheet px
        patches = pack_blink_items(v['blink'], layer_images[head], head_box, items_src,
                                   item_rects, pages, page_taken) if head_box is not None else []
        # no item copies an eye: the entry stays exactly as before (rigs without one export byte-identically)
        for pt in patches:
            blink_keeps.setdefault(pt['_keep'][0], []).append(pt.pop('_keep')[1:])
        if patches:
            blink['items'] = patches

    # mirror cards: after the blink patches, so they take only space that is still free
    blink_layer = v['blink'].get('layer') if blink is not None else None
    patched = {pt['item'] for pt in blink.get('items', [])} if blink is not None else set()
    for iid, it in sorted(v.get('items', {}).items()):
        mirror = pack_mirror_cards(iid, it, item_rects[iid], items[iid]['mesh'], items[iid]['page'], pages, page_taken,
                                   blink_layer, iid in patched)
        if mirror:
            items[iid].update(mirror)

    page_names = []
    for k, pg in enumerate(pages):
        page_names.append(f'{name}_page{k}.png')
        # UVs are normalised, so only the stored resolution changes. Pillow resizes RGBA premultiplied.
        stored = pg if PAGE_STORE_SCALE == 1 else pg.resize(
            (round(pg.width * PAGE_STORE_SCALE), round(pg.height * PAGE_STORE_SCALE)), Image.LANCZOS)
        if k in blink_keeps:
            stored = restore_blink_item_hair(stored, PAGE_STORE_SCALE, blink_keeps[k])
        stored.save(OUT / page_names[-1], optimize=True)

    if wl:
        sx_w = wl.pop('sx'); sy_w = wl.pop('sy')
        for fr in wl['frames']:
            fr.pop('cell'); fr.pop('advance')
            for k in ('x', 'y', 'w', 'h', 'drop'):
                fr[k] = round(fr[k], 3)
        wl['strideLen'] = round(wl['strideLen'], 3)
        wl['scale'] = [round(sx_w, 5), round(sy_w, 5)]
    else:   # skinned standing legs: doll25 strideLen fallback (0.3 × height per cycle)
        wl = {'frames': [], 'cell': [0, 0], 'start': [], 'strideLen': round(0.3 * v['height'], 3),
              'forward': -1 if name == 'front' else 1, 'legPhase': 0, 'scale': [1, 1]}
    out = {
        'ground': v['ground'], 'height': v['height'],
        'bones': [{'name': n, 'head': v['bones'][n]['head'], 'tail': v['bones'][n]['tail'],
                   'parent': bone_idx.get(v['bones'][n].get('parent') or '', -1)}
                  for n in bone_names],
        'slots': {'root': ROOT, 'wave': WAVE},
        'waist': hy['waist'],
        'walk': wl,
        'sit': {'seat': S['seat'], 'feet': S['feet'], 'fold': S.get('foldForearms') or [], 'armTurn': S.get('armTurn') or {},
                'cardArms': S.get('cardArms') or [], 'hideArms': bool(S.get('hideArms'))},
        'wave': {'pivot': Wv['pivot'], 'out': Wv.get('out', 1)},
        'pages': page_names, 'pageSize': list(PAGE),
        'mesh': mesh.dump(), 'items': items,
    }
    if motion:
        out['motion'] = export_motion(motion, bone_names)
    # boy rig extras, passed through as they are: per-view body meta and the shorts' bottom line
    if v.get('meta') is not None:
        out['meta'] = v['meta']
    if hy.get('shortsBottom') is not None:
        out['shortsBottom'] = hy['shortsBottom']
    # life details (life/NATIVE_PLAN.md); a rig without them exports exactly as before
    if v.get('breath') is not None:
        out['breath'] = v['breath']
    if blink is not None:
        out['blink'] = blink
    return out


# Size and walk speed shared with the lab (lab39 writes it; the owner set 1.35 / 0.75 on 2026-10-08).
MOTION_CONFIG = SRC.parent / 'avatar_motion.json'
MOTION_DEFAULTS = {'charScale': 1.35, 'walkSpeed': 0.75, 'baseWalkSpeed': 1.15, 'rampScale': 2.0}


LAB_CONFIG_JS = SRC.parent / 'avatar_config.js'   # lab40: the shared AVATAR_CONFIG (charScale, maxSpeed)


def read_motion_config():
    cfg = dict(MOTION_DEFAULTS)
    if LAB_CONFIG_JS.exists():
        import re
        js = LAB_CONFIG_JS.read_text()
        for key, name in (('charScale', 'charScale'), ('walkSpeed', 'maxSpeed')):
            m = re.search(rf'\b{name}\s*:\s*([0-9.]+)', js)
            if m:
                cfg[key] = float(m.group(1))
    for path in (MOTION_CONFIG, MOTION_CONFIG_ARG):
        if path is not None and path.exists():
            cfg.update({k: v for k, v in json.loads(path.read_text()).items() if k in MOTION_DEFAULTS})
    if MOTION_CONFIG_ARG is not None and not MOTION_CONFIG_ARG.exists():
        raise SystemExit(f'--motion-config not found: {MOTION_CONFIG_ARG}')
    return cfg


def main():
    rig = json.loads(SRC.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.png'):   # generated output only: the previous export's textures
        old.unlink()
    walk = json.loads(MOTION_SRC.read_text()) if MOTION_SRC else {}
    source = f'{SRC.parent.name}/{SRC.name}' + (f' + {MOTION_SRC.parent.name}/{MOTION_SRC.name}' if MOTION_SRC else '')
    out = {'version': 1, 'source': source, 'motion': read_motion_config(),
           'views': {n: export_view(n, v, walk.get(n)) for n, v in sorted(rig.items()) if n in ('front', 'back')}}
    (OUT / 'rig25.json').write_text(json.dumps(out, separators=(',', ':'), sort_keys=True))
    pngs = sorted(p.name for p in OUT.iterdir() if p.suffix == '.png')
    # header kept from the exporter's old home so re-exports stay byte-identical to the approved files
    lines = ['/* Generated by tools/room-avatar-lab/bake25/export_rig.py. Do not edit. */',
             'export const ROOM_AVATAR_25D_TEXTURES: Record<string, number> = {']
    lines += [f'  "{n}": require("./{n}"),' for n in pngs]
    lines += ['}', '']
    (OUT / 'rigAssets.ts').write_text('\n'.join(lines))
    if ASTC:
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from compress_pages import compress_rig
        compress_rig(OUT)
    files = sorted(p.name for p in OUT.iterdir())
    print('wrote', OUT, files)


if __name__ == '__main__':
    main()
