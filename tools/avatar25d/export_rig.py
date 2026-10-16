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

Leg drawings (`hybrid.legVariants`) are exported per item: each bottom owns a 'bottom' range and each pair of shoes a
'shoes' range per leg (keys may name slots or rig item ids); the runtime composes any worn pair as the AND of the two
(leg_variant_owners). Item sit / wave cards may carry their own sheet box (`sitBox` / `waveBox`, item_cards).
An item part with `poseOnly` (e.g. ['wave']) exports its range with that list; the runtime draws it in those poses only.

Body replacement drawings (factory/lab `hybrid.torsoVariants` / `armVariants` / `sitVariants`, keyed by a rig item id or
an `<item>+<item>` pair; and the shared `hybrid.torsoMidriff` set, carried by every item with `torso: "midriff"`) are
exported per owning item (body_replacements): a range `<body range>@body` (`@with:<id>` for a pair) with the body
range's own mesh, weights and order, `bodyPart` = that body range and, for a pair, `bodyWith` = the other item. The
runtime draws it instead of the body range while the item (and the pair partner) is worn (avatar25BodySwap). A rig
without them exports byte-identically.

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
import base64, io, json, math, pathlib, sys
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))   # page_store.py beside this file, however it is loaded
from page_store import page_scope, published_rig_items, store_page

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
# Draw order of an item part = its body layer's order + its slot's offset (WB integration/slots_2140 DESIGN §5): on the
# head (4) the eyes < glasses 4.5 < the fringe 4.6 < a hat or clip 4.7; on the torso (3) a bottom 3.3 < a top or dress
# 3.45 < a necklace or bag 3.7. A dress is never worn with a top or a bottom, so it shares the top's offset.
SLOT_ORDER = {'shoes': 0.15, 'bottom': 0.3, 'top': 0.45, 'dress': 0.45, 'glasses': 0.5, 'hair': 0.6, 'accessory': 0.7}
LOWER_Z = 2.5
LOWER_SLOTS = {'shoes', 'bottom'}
NEW_KIND_SLOTS = ('dress', 'glasses', 'accessory')
# An accessory may name its catalog group (`group`, the domain `accessoryGroup`); a group listed here takes its own offset
# instead of .70: earrings 4.55 sit under the fringe 4.6 (review slots_1330 LOW-1). Eyewear is the `glasses` slot.
ACCESSORY_GROUPS = ('headwear', 'earrings', 'neck', 'bag', 'hairClip')
ACCESSORY_GROUP_ORDER = {'earrings': 0.55}
GLASSES_LAYERS = ('head',)
LEG_LAYERS = ('farLeg', 'nearLeg')


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


def blink_frame_in_head(frame, head_open):
    """A blink frame drawn only where the open head draws (alpha = min(frame, open)): a frame that carries skin where
    the open head is transparent would hide a hair part under the head there for the length of the blink
    (hairfix_0945 SWAP #7: girl front, a skin column beside the eye)."""
    import numpy as np   # local, like the other numpy helpers here (the exporter imports it lazily)
    f = np.asarray(frame.convert('RGBA')).copy()
    f[..., 3] = np.minimum(f[..., 3], np.asarray(head_open.convert('RGBA'))[..., 3])
    return Image.fromarray(f, 'RGBA')


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
        tile.paste(blink_frame_in_head(frame, src.crop((rx, ry, rx + rw, ry + rh))), (M, M))
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
# The rig may hold patches for any number of items; the runtime loads only the worn items' patches
# (avatar25Pose.ts compileAvatar), and one outfit wears one item per slot.
BLINK_ITEMS_MAX = 2          # the shader's item redirects per worn outfit (avatar25Life.ts AVATAR25_BLINK_ITEMS)
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


def blink_item_cut(head_open, frames, item, light_edge=False, tied=None):
    """Item pixels (same size crops of the eye rect, RGBA uint8) that copy the open eye: True = cleared in the patch.
    Only the eye copy goes: item pixels at the head's eye drawing (iris, sclera, lashes, its rim and loose dots) that
    are not hair. Hair keeps every pixel: strands that enter the rect from its sides or top (runs from the edge) and
    item pixels joined by a thick path to the item outside the eye (bang tips, side locks hanging into it).
    `light_edge` (a part's `blinkLightEdge`, set by the factory for a LIGHT side lock lying over an eye corner, whose
    soft inner edge matches the lid colour): the one-pixel rim of the cut next to kept hair that differs from the head
    is kept too, unless it is the copy's vivid dark lash line.
    `tied` (crop-size bool mask, optional): item pixels on the crop's border that continue in the part OUTSIDE the
    rect. They are the item outside the eye even inside the eye zone: a side lock that only clips the rect's corner
    over the face contour (which the blink frames repaint, so it reads as eye drawing) is hair, not a loose copy."""
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
    seeds = border & drawn & ~zone
    if tied is not None:
        seeds |= tied & drawn & border
    outside = _flood(seeds, drawn & ~zone)
    hair = _flood(outside, thick & zone)
    hair |= path & zone & _dilate(hair, 1) | protect    # the strand's own edge px (the thickness test rounds them off)
    cut = zone & drawn & opaque & ~hair
    cut &= _dilate(~_dilate(~cut, 1), 1)              # no 1-2 px slivers cut into a strand (they blur into its edge)
    if light_edge:
        lashlike = ((mx - rgb.min(-1)) > BLINK_LASH_SAT * np.maximum(mx, 1)) & (mx < BLINK_LASH_VALUE)
        cut &= ~(_dilate(drawn & ~cut & mismatch, 1) & ~lashlike)
    kept = drawn & ~cut
    loose = kept & ~_flood(outside, kept) & opaque    # bits left with no tie to the item outside: specks
    return cut | loose


def part_uv_box(mesh, name, page_size):
    """[x0, y0, x1, y1] in page px of the vertices of one mesh range (the drawn area of a part: its png can be larger)."""
    import numpy as np
    rg = next(r for r in mesh['ranges'] if r['name'] == name)
    ids = sorted(set(mesh['index'][rg['start']:rg['start'] + rg['count']]))
    uv = np.asarray(mesh['uv'], float).reshape(-1, 2)[ids] * np.asarray(page_size, float)
    return [float(uv[:, 0].min()), float(uv[:, 1].min()), float(uv[:, 0].max()), float(uv[:, 1].max())]


def blink_patches_one_outfit(patches, items_src):
    """The most eye patches one outfit can wear at once: per slot, the item with the most patches (one item per slot)."""
    slot_of = {iid: it['slot'] for iid, it, _ in items_src}
    per_item = {}
    for pt in patches:
        per_item[pt['item']] = per_item.get(pt['item'], 0) + 1
    per_slot = {}
    for iid, n in per_item.items():
        per_slot[slot_of[iid]] = max(per_slot.get(slot_of[iid], 0), n)
    return sum(per_slot.values())


def blink_crop_ties(img, ox, oy, rw, rh):
    """Pixels on the border of the eye-rect crop (ox, oy, rw, rh) of a part image that the part continues from outside
    the crop (a drawn 4-neighbour just past that border): the strand is tied to the item outside the rect."""
    import numpy as np
    a = np.asarray(img.convert('RGBA'))[..., 3] >= 128
    big = np.zeros((rh + 2, rw + 2), bool)                        # the crop plus a one-pixel ring, False off the part
    x0, y0 = max(ox - 1, 0), max(oy - 1, 0); x1, y1 = min(ox + rw + 1, img.width), min(oy + rh + 1, img.height)
    if x1 > x0 and y1 > y0:
        big[y0 - (oy - 1):y1 - (oy - 1), x0 - (ox - 1):x1 - (ox - 1)] = a[y0:y1, x0:x1]
    ties = np.zeros((rh, rw), bool)
    ties[0] |= big[0, 1:-1]; ties[-1] |= big[-1, 1:-1]; ties[:, 0] |= big[1:-1, 0]; ties[:, -1] |= big[1:-1, -1]
    return ties


def pack_blink_items(src_blink, head_layer, head_box, items_src, item_rects, pages, page_taken, meshes=None):
    """The item patches (see above) for the view's `blink.items`; pastes each into free space of its item's page.
    `meshes` ({item id: mesh}) clips each redirect rect to the drawn area of its part: a hair that ends above the
    eye rect's lower edge never samples past its mesh, and the redirect must not reach the next part on the page."""
    import numpy as np
    rx, ry, rw, rh = src_blink['rect']
    sx, sy = head_box[0] + rx, head_box[1] + ry          # the eye rect in sheet px
    head_open = np.asarray(head_layer.crop((rx, ry, rx + rw, ry + rh)))
    frames = [np.asarray(decode(src_blink['frames'][n])) for n in BLINK_FRAMES]
    M = BLINK_MARGIN
    out = []
    for iid, it, page in items_src:
        if it.get('slot') == 'glasses':   # their own layer over the eyes, never a baked eye copy: rims must not blink away
            continue
        for k, part in enumerate(it.get('parts', [])):
            if part['layer'] != src_blink.get('layer'):
                continue
            img = decode(part['png'])
            px, py = part['box'][0], part['box'][1]
            ox, oy = sx - px, sy - py                           # the eye rect in the part's own px
            if ox + rw <= 0 or oy + rh <= 0 or ox >= img.width or oy >= img.height:
                continue
            crop = np.asarray(img.crop((ox, oy, ox + rw, oy + rh)))   # transparent where the part is not
            cut = blink_item_cut(head_open, frames, crop, bool(part.get('blinkLightEdge')), blink_crop_ties(img, ox, oy, rw, rh))
            if not cut.any():
                continue
            worn_most = blink_patches_one_outfit([*out, {'item': iid}], items_src)
            if worn_most > BLINK_ITEMS_MAX:
                raise SystemExit(f'blink: one outfit could wear {worn_most} > {BLINK_ITEMS_MAX} eye patches ({iid})')
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
            rect = [ix + ox, iy + oy, rw, rh]
            if meshes is not None:
                bx0, by0, bx1, by1 = part_uv_box(meshes[iid], f'part{k}', pages[page].size)
                x0, y0 = max(rect[0], int(np.ceil(bx0))), max(rect[1], int(np.ceil(by0)))
                x1, y1 = min(rect[0] + rw, int(np.floor(bx1))), min(rect[1] + rh, int(np.floor(by1)))
                if x1 <= x0 or y1 <= y0:
                    continue
                rect = [x0, y0, x1 - x0, y1 - y0]
                pad = max(0, min(pad, x0 - int(np.ceil(bx0)), y0 - int(np.ceil(by0)), int(np.floor(bx1)) - x1, int(np.floor(by1)) - y1))
            out.append({'item': iid, 'page': page, 'rect': rect, 'pad': pad,
                        'offset': [spot[0] + M - (ix + ox), spot[1] + M - (iy + oy)], 'cutPx': int(cut.sum()),
                        '_keep': (page, (ix + ox - M, iy + oy - M), spot, full_cut)})
    return out


def mirror_eye_context(src_blink, head_layer, head_box):
    """What the mirror-card eye check needs: the head layer's blink layer name, the eye rect in sheet px, the open head
    there and the half/closed frames (the same inputs pack_blink_items cuts the item patches with)."""
    import numpy as np
    rx, ry, rw, rh = src_blink['rect']
    return {'layer': src_blink.get('layer'), 'window': (head_box[0] + rx, head_box[1] + ry, rw, rh),
            'head_open': np.asarray(head_layer.crop((rx, ry, rx + rw, ry + rh))),
            'frames': [np.asarray(decode(src_blink['frames'][n])) for n in BLINK_FRAMES]}


def card_carries_eye_copy(card, part, eye):
    """True when the card has a copy of the open eye where the head's eye lies on screen. The mesh is not flipped (the
    renderer flips the whole avatar), so that is the eye rect in sheet px, i.e. the same window of the part's own px
    that pack_blink_items cuts the original from; a card carrying a copy would stay open while the head blinks."""
    import numpy as np
    sx, sy, rw, rh = eye['window']
    ox, oy = sx - part['box'][0], sy - part['box'][1]
    if ox + rw <= 0 or oy + rh <= 0 or ox >= card.width or oy >= card.height:
        return False
    crop = np.asarray(card.crop((ox, oy, ox + rw, oy + rh)))   # transparent where the card is not
    return bool(blink_item_cut(eye['head_open'], eye['frames'], crop, bool(part.get('blinkLightEdge'))).any())


def pack_mirror_cards(iid, it, ir, mesh, page, pages, page_taken, eye=None):
    """Mirror cards (see the docstring): returns {'mirrorUv': [...], 'mirrorPage': n?} for an item whose parts carry
    `pngMirror`, else None. Each card is pasted at the same phase modulo BLINK_ALIGN as its part (so both resample
    alike), in free space of the item's page, else together on one new page appended to `pages`. `eye`
    (mirror_eye_context) makes a card on the blink layer prove it carries no eye copy: the head's own blink then
    shows through it (the item's eye patch is keyed to the original uv rect and is inert under a card)."""
    cards = [(k, decode(p['pngMirror'])) for k, p in enumerate(it.get('parts', [])) if p.get('pngMirror')]
    if not cards:
        return None
    for k, card in cards:
        part = it['parts'][k]
        if card.size != decode(part['png']).size:
            raise SystemExit(f"mirror: {iid} part{k} card is {card.size}, its drawing is {decode(part['png']).size}")
        if eye is not None and part['layer'] == eye['layer'] and card_carries_eye_copy(card, part, eye):
            raise SystemExit(f'mirror: {iid} part{k} card carries a copy of the open eye; cut it from the card like the item patch')
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
        # texel of source px X is floor(X * scale): a tile whose origin is odd (or negative) at scale 0.5 starts in the
        # middle of a texel, so both the copied block and the cut's footprint are counted from that texel (int() would
        # shift them by one texel and copy cut eye-copy px back into the patch)
        x0, y0 = int(np.floor(sx * scale)), int(np.floor(sy * scale))
        X0, Y0 = int(np.floor(tx * scale)), int(np.floor(ty * scale))
        sw = int(np.floor((sx + w - 1) * scale)) - x0 + 1
        sh = int(np.floor((sy + h - 1) * scale)) - y0 + 1
        foot = np.zeros((sh, sw), bool)
        ys, xs = np.nonzero(cut)
        foot[np.floor((sy + ys) * scale).astype(int) - y0, np.floor((sx + xs) * scale).astype(int) - x0] = True
        # a patch whose margin reaches past the page edge (a part packed at the edge): copy only the texels on the page
        H, W = a.shape[:2]
        lx, ly = max(0, -x0, -X0), max(0, -y0, -Y0)
        hx, hy = min(sw, W - x0, W - X0), min(sh, H - y0, H - Y0)
        if hx <= lx or hy <= ly:
            continue
        keep = ~foot[ly:hy, lx:hx]
        a[Y0 + ly:Y0 + hy, X0 + lx:X0 + hx][keep] = a[y0 + ly:y0 + hy, x0 + lx:x0 + hx][keep]
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


LEG_ROLES = ('bottom', 'shoes')
# the leg role of an item's slot: a one-piece dress is the bottom for the legs (the bare legs under its skirt)
LEG_ROLE_OF_SLOT = {'bottom': 'bottom', 'dress': 'bottom', 'shoes': 'shoes'}


def slot_order(iid, slot, group=None):
    """The draw-order offset of an item's slot (or its accessory group); an unknown slot or group stops the export."""
    if slot not in SLOT_ORDER:
        raise SystemExit(f'{iid}: unknown slot {slot!r} (one of {sorted(SLOT_ORDER)})')
    if group is not None and (slot != 'accessory' or group not in ACCESSORY_GROUPS):
        raise SystemExit(f'{iid}: group {group!r} is for accessories only, one of {list(ACCESSORY_GROUPS)} '
                         '(glasses use the glasses slot)')
    return ACCESSORY_GROUP_ORDER.get(group, SLOT_ORDER[slot])


def part_stand_only(slot, layer):
    """A part hidden while seated (the item's seated card draws it): a bottom's or shoes' torso and leg parts, and a
    dress's leg parts (its torso fabric draws seated like a top's)."""
    if slot in LOWER_SLOTS:
        return layer in ('torso',) + LEG_LAYERS
    return slot == 'dress' and layer in LEG_LAYERS


def check_item_slots(rig):
    """Export gates for the item kinds (DESIGN slots_2140 §10): every item's slot (and accessory group) is known; glasses
    draw only on the head; a dress, glasses or accessory exists in both views (glasses and accessories may have no parts
    in the back); a dress has torso fabric in every view and walk cards in both views or neither (review slots_1330
    MEDIUM-1: a drawn dress hides the top and bottom, so a bare view would show the body). Stops on the first problem.
    Pure."""
    views = {n: v for n, v in rig.items() if n in ('front', 'back')}
    for name, v in sorted(views.items()):
        for iid, it in sorted(v.get('items', {}).items()):
            slot_order(iid, it.get('slot'), it.get('group'))
            if it['slot'] == 'dress' and 'torso' not in {p['layer'] for p in it.get('parts', [])}:
                raise SystemExit(f'{iid} ({name}): a dress needs torso parts in every view')
            if it['slot'] == 'glasses':
                bad = sorted({p['layer'] for p in it.get('parts', [])} - set(GLASSES_LAYERS))
                if bad:
                    raise SystemExit(f'{iid} ({name}): glasses draw on the head only, not on {bad}')
            if it['slot'] in NEW_KIND_SLOTS and len(views) == 2:
                other = next(n for n in views if n != name)
                if iid not in views[other].get('items', {}):
                    raise SystemExit(f'{iid}: a {it["slot"]} needs the {other} view too (it may have no parts)')
                if it['slot'] == 'dress' and bool(it.get('walk')) != bool(views[other]['items'][iid].get('walk')):
                    raise SystemExit(f'{iid}: a dress has walk cards in both views or in neither')


# factory / lab body-variant map names -> the body range each one replaces (lab doll25 `torsoMaps`)
TORSO_VARIANT_RANGES = {'full': 'torso', 'walk': 'torsoWalk', 'upper': 'torsoUpper', 'noArms': 'torsoNoArms',
                        'sit': 'torsoSit', 'cardArms': 'torsoCardArms'}
ARM_LAYERS = ('farArm', 'nearArm')
MIDRIFF = 'midriff'


def _replacement_key(key, items, family):
    """A body-variant key -> (owner item id, partner item id or None). Keys name rig item ids: `<id>` or `<id>+<id>`
    (the lab's `<bottom>+<top>` pair, drawn only while both are worn; stored with the first)."""
    parts = key.split('+')
    if len(parts) > 2 or len(set(parts)) != len(parts):
        raise SystemExit(f'{family} {key}: a key is one item id or a pair of two')
    unknown = [p for p in parts if p not in items]
    if unknown:
        raise SystemExit(f'{family} {key}: {unknown} not items of this view')
    return parts[0], (parts[1] if len(parts) == 2 else None)


def add_shared_drawings(atlas, drawings):
    """Add an item's body drawings [(range name, png data uri)] to its atlas; drawings with the same pixels (one pair
    drawing made for several partners) are packed once. -> {range name: the packed range name with its pixels}"""
    first, same_as = {}, {}
    for rname, png in drawings:
        im = decode(png)
        pixels = (im.size, im.tobytes())
        if pixels in first:
            same_as[rname] = first[pixels]
            continue
        first[pixels] = rname
        atlas.add(rname, im)
    return same_as


def with_shared_rects(rects, same_as):
    """The packed rects plus one entry per drawing packed once for several ranges (each takes its first range's rect)."""
    return {**rects, **{rname: rects[packed] for rname, packed in same_as.items()}}


def body_replacements(hy, items, body_sizes):
    """{owner item id: [(body range, png data uri, partner id or None), ...]} for the view's body variants.

    `body_sizes` = {body range: (w, h)} of the ranges this view exports; a replacement must have the same size (it is
    drawn with that range's mesh and uvs, exactly where and as the body drawing is)."""
    out = {}

    def add(owner, partner, body, png, family):
        if body not in body_sizes:
            raise SystemExit(f'{family} of {owner}: the body has no {body} drawing to replace')
        size = decode(png).size
        if size != body_sizes[body]:
            raise SystemExit(f'{family} of {owner}: {body} is {size}, the body drawing {body_sizes[body]}')
        if any(b == body and w == partner for b, _, w in out.get(owner, [])):
            raise SystemExit(f'{family} of {owner}: two drawings replace {body}' + (f' with {partner}' if partner else ''))
        out.setdefault(owner, []).append((body, png, partner))

    midriff_items = sorted(iid for iid, it in items.items() if it.get('torso') is not None)
    for iid in midriff_items:
        if items[iid]['torso'] != MIDRIFF:
            raise SystemExit(f"{iid}: torso {items[iid]['torso']!r} is not supported ({MIDRIFF!r} only)")
        if not hy.get('torsoMidriff'):
            raise SystemExit(f'{iid}: torso {MIDRIFF!r} but the view has no hybrid.torsoMidriff')
        if iid in (hy.get('torsoVariants') or {}):
            raise SystemExit(f'{iid}: both torso {MIDRIFF!r} and its own torsoVariants')
    torso_sets = [(k, m) for k, m in sorted((hy.get('torsoVariants') or {}).items())]
    torso_sets += [(iid, hy['torsoMidriff']) for iid in midriff_items]
    for key, maps in torso_sets:
        owner, partner = _replacement_key(key, items, 'torsoVariants')
        for name, png in sorted(maps.items()):
            if name not in TORSO_VARIANT_RANGES:
                raise SystemExit(f'torsoVariants {key}: unknown map {name!r}')
            add(owner, partner, TORSO_VARIANT_RANGES[name], png, 'torsoVariants')
    for key, maps in sorted((hy.get('armVariants') or {}).items()):
        owner, partner = _replacement_key(key, items, 'armVariants')
        for name, png in sorted(maps.items()):
            if name not in ARM_LAYERS:
                raise SystemExit(f'armVariants {key}: unknown arm {name!r}')
            add(owner, partner, name, png, 'armVariants')
    for key, png in sorted((hy.get('sitVariants') or {}).items()):
        owner, partner = _replacement_key(key, items, 'sitVariants')
        add(owner, partner, 'sit', png, 'sitVariants')
    return out


def replacement_range(body, partner):
    return f'{body}@with:{partner}' if partner else f'{body}@body'


def _leg_part(part, items, slot_item, keyed=frozenset()):
    """One part of a legVariants key -> (owner item id, role). A part is a slot name (the girl's rig) or a rig item id
    (the factory's keys, one per worn item). A slot name is the lab's fallback (doll25.js: the item-id key first, then
    the slot key), so it belongs to the one item of that slot without a drawing keyed by its own id (`keyed`)."""
    if part in LEG_ROLES:
        owners = [o for o in slot_item.get(part, []) if o not in keyed]
        if len(owners) != 1:
            raise SystemExit(f'leg variant {part}: {len(owners)} items in that slot without their own key '
                             '(a slot key needs exactly one)')
        return owners[0], part
    if part not in items:
        raise SystemExit(f'leg variant {part}: not a slot and not an item of this view')
    role = LEG_ROLE_OF_SLOT.get(items[part]['slot'])
    if role not in LEG_ROLES:
        raise SystemExit(f'leg variant {part}: a {items[part]["slot"]} item cannot own a leg drawing')
    return part, role


def leg_variant_owners(leg_variants, items):
    """{owner item id: [(source key, exported key), ...]} for the view's legVariants.

    Each bottom owns its 'bottom' drawing and each pair of shoes its 'shoes' drawing (role keys, whatever the source
    named them). The runtime draws the leg for any worn bottom + shoes as the AND of those two drawings' coverage
    (avatar25Pose: the bottom's drawing masked by the shoes'), so a pair keyed by two item ids is not exported: it is
    exactly that AND up to a hidden heel rim (integration/combo_proof_0750/PROOF.md). A pair keyed by slots
    ('bottom+shoes', the girl's QA'd drawing) is kept on the bottom and drawn instead of the AND (byte-identical
    girl export)."""
    slot_item = {}
    for iid, it in sorted(items.items()):
        slot_item.setdefault(it['slot'], []).append(iid)
    owners, seen = {}, set()
    # an item's own drawing is a single-part key; an item-id pair (a dress with each pair of shoes) is composed at
    # runtime and does not take a slot key from its shoes
    keyed = frozenset(key for key in leg_variants if '+' not in key and key not in LEG_ROLES)
    for key in leg_variants:
        parts = key.split('+')
        if len(parts) > 2:
            raise SystemExit(f'leg variant {key}: more than two parts')
        resolved = [_leg_part(p, items, slot_item, keyed) for p in parts]
        if len(parts) == 2 and sorted(r for _, r in resolved) != ['bottom', 'shoes']:
            raise SystemExit(f'leg variant {key}: a pair is one bottom and one pair of shoes')
        if len(parts) == 2 and not all(p in LEG_ROLES for p in parts):
            continue   # item-id pair: composed at runtime
        owner = next(o for o, r in resolved if r == 'bottom') if len(parts) == 2 else resolved[0][0]
        out_key = '+'.join(LEG_ROLES) if len(parts) == 2 else resolved[0][1]
        if (owner, out_key) in seen:
            raise SystemExit(f'leg variant {key}: {owner} already owns a {out_key} drawing')
        seen.add((owner, out_key))
        owners.setdefault(owner, []).append((key, out_key))
    return owners


POSES = ('stand', 'walk', 'sit', 'wave')


def part_order(layer_order, part):
    """An item part's draw order: its layer's, or the layer named by the optional `orderLayer` key. The mask layer stays
    `layer` (a head-anchored back-wave hair copy keeps layer 'head', so the app does not hide it in the wave like every
    nearArm range, and draws at nearArm order over the raised arm and the top's wave card). Parts without the key
    export exactly as before."""
    name = part.get('orderLayer', part['layer'])
    if 'orderLayer' in part and name not in layer_order:
        raise SystemExit(f"bad orderLayer {name!r} (one of {sorted(layer_order)})")
    return layer_order.get(name, 3)


def pose_only(iid, k, part):
    """A part's `poseOnly` as a list, checked: one known pose or a non-empty list of them (the lab, doll25.js, takes
    both: `[].concat(poseOnly)`); the runtime draws the part in those poses only."""
    poses = [part['poseOnly']] if isinstance(part['poseOnly'], str) else part['poseOnly']
    if not isinstance(poses, list) or not poses or any(p not in POSES for p in poses):
        raise SystemExit(f'{iid} part {k}: bad poseOnly {poses!r} (a non-empty list of {POSES})')
    return sorted(set(poses), key=POSES.index)


def item_cards(iid, it, body_cards):
    """{pose: (card image, sheet box [x, y])} of an item's seated / waving cards. Without `sitBox` / `waveBox` a card
    is the body card's size and sits at the body's box (one fit: every card shares the union box). With one, the
    card sits at its own box (cards from different fits mix) and is trimmed to its drawn pixels (lossless)."""
    out = {}
    for pose, (body_img, body_box) in body_cards.items():
        if not it.get(pose):
            continue
        card = decode(it[pose])
        own_box = it.get(f'{pose}Box')
        if own_box is None:
            if card.size != body_img.size:
                raise SystemExit(f'{iid} {pose} card is {card.size}, the body card {body_img.size}: give it `{pose}Box`')
            out[pose] = (card, (body_box[0], body_box[1]))
            continue
        bbox = card.getchannel('A').getbbox()
        if bbox is None:
            continue   # nothing drawn
        out[pose] = (card.crop(bbox), (own_box[0] + bbox[0], own_box[1] + bbox[1]))
    return out


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
    # bare legs drawn for what is worn (lab40 fix_rig.py `legVariants`): a range `<leg>@<role>` with the body leg
    # layer's mesh and that drawing, stored with the item that owns it, so its texels load only while it is worn
    # (leg_variant_owners: item-owned 'bottom' / 'shoes' drawings, plus the girl's legacy 'bottom+shoes' pair)
    leg_variants = {k: m for k, m in sorted((hy.get('legVariants') or {}).items())}
    variant_owner = leg_variant_owners(leg_variants, v.get('items', {}))
    # no painted walk yet (lab39 2026-10-08): the runtime steps the standing drawing's own skinned legs
    # a retargeted walk replaces the painted walk cards (body and items): they are not bundled
    walk_img = decode(hy['walk']['atlas']) if hy.get('walk') and not motion else None
    if walk_img is not None:
        atlas.add('walk', walk_img)
    sit_img, wave_img = decode(hy['sit']['card']), decode(hy['wave']['card'])
    atlas.add('sit', sit_img)
    atlas.add('wave', wave_img)
    img, rects = atlas.pack(PAGE_W)
    # body drawings an item may replace while worn (body_replacements), by the body range they are drawn as
    body_sizes = {k: (r[2], r[3]) for k, r in rects.items() if k in TORSO_VARIANTS or k in ARM_LAYERS or k == 'sit'}
    replacements = body_replacements(hy, v.get('items', {}), body_sizes)
    # every item atlas is packed first so the page height (shared by all layers of the array) is known
    item_atlases = {}
    for iid, it in sorted(v.get('items', {}).items()):
        walk_card = decode(it['walk']) if it.get('walk') and walk_img is not None else None
        ia = Atlas()
        for k, p in enumerate(it.get('parts', [])):
            ia.add(f'part{k}', decode(p['png']))
        cards = item_cards(iid, it, {'sit': (sit_img, hy['sit']['box']), 'wave': (wave_img, hy['wave']['box'])})
        for pose, (card, _) in cards.items():
            ia.add(pose, card)
        if walk_card is not None:
            ia.add('walk', walk_card)
        for key, out_key in variant_owner.get(iid, []):
            for ln, png in sorted(leg_variants[key].items()):
                ia.add(f'{ln}@{out_key}', decode(png))
        same_as = add_shared_drawings(ia, [(replacement_range(body, partner), png) for body, png, partner in replacements.get(iid, [])])
        item_img, item_rects = ia.pack(PAGE_W // 2)
        item_rects = with_shared_rects(item_rects, same_as)
        item_atlases[iid] = (item_img, item_rects, walk_card is not None, cards)
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
        iimg, ir, has_walk, cards = item_atlases[iid]
        while len(pages) <= page:
            pages.append(Image.new('RGBA', PAGE, (0, 0, 0, 0)))
        pages[page].paste(iimg, (xoff, 0))
        ir = {k: (r[0] + xoff, r[1], r[2], r[3]) for k, r in ir.items()}
        item_rects[iid] = ir
        page_taken.setdefault(page, []).extend(ir.values())
        items_src.append((iid, it, page))
        im = Mesh()
        f = slot_order(iid, it['slot'], it.get('group'))
        for k, p in enumerate(it.get('parts', [])):
            stand_only = part_stand_only(it['slot'], p['layer'])
            # a part drawn in some poses only (factory `poseOnly`, e.g. a bottom's wave-only hip patch over the waving
            # torso's briefs) carries that list; parts without one export exactly as before
            only = {'poseOnly': pose_only(iid, k, p)} if p.get('poseOnly') else {}
            im.add_range(f'part{k}', part_order(layer_order, p) + f,
                         lambda p=p, k=k: im.skinned(p, ir[f'part{k}'], PAGE, bone_idx, page, ARM_CODE.get(p['layer'], 0)),
                         layer=p['layer'], standOnly=stand_only, **only)
        body_layers = {L['name']: L for L in v['layers']}
        for key, out_key in variant_owner.get(iid, []):
            for ln in sorted(leg_variants[key]):
                # drawn exactly where (and as) the body leg is: its order, its mesh, its own weights
                im.add_range(f'{ln}@{out_key}', layer_order[ln],
                             lambda ln=ln, k=out_key: im.skinned({**body_layers[ln], 'walkWeights': None}, ir[f'{ln}@{k}'], PAGE, bone_idx, page, 0),
                             layer=ln, legVariant=out_key)
        # body drawings this item replaces while worn: the body range's own mesh (or seated card quad) and order
        for body, _, partner in replacements.get(iid, []):
            rname = replacement_range(body, partner)
            tag = {'bodyPart': body, **({'bodyWith': partner} if partner else {})}
            if body == 'sit':
                im.add_range(rname, 4.5 if S.get('front') else LOWER_Z,
                             lambda rname=rname: im.quad(S['box'][0], S['box'][1], sit_img.width, sit_img.height, ir[rname], PAGE, ROOT, None, page),
                             **tag)
                continue
            src = body_layers['torso' if body in TORSO_VARIANTS else body]
            im.add_range(rname, layer_order[src['name']],
                         lambda src=src, rname=rname: im.skinned(src, ir[rname], PAGE, bone_idx, page, ARM_CODE.get(src['name'], 0)),
                         **tag)
        # each card at its own sheet box (the body's box unless the item carries `sitBox` / `waveBox`)
        if 'sit' in cards:
            card, (bx, by) = cards['sit']
            im.add_range('sit', (4.5 if S.get('front') else LOWER_Z) + f,
                         lambda: im.quad(bx, by, card.width, card.height, ir['sit'], PAGE, ROOT, None, page))
        if 'wave' in cards:
            wcard, (wx, wy) = cards['wave']
            im.add_range('wave', layer_order['nearArm'] + f,
                         lambda: im.quad(wx, wy, wcard.width, wcard.height, ir['wave'], PAGE, WAVE, None, page))
        if has_walk:
            iw = ir['walk']
            for i, fr in enumerate(wl['frames']):
                uvr = (iw[0] + fr['cell'][0], iw[1] + fr['cell'][1], cw, ch)
                im.add_range(f'walk{i}', LOWER_Z + f, lambda fr=fr, uvr=uvr: im.quad(fr['x'], fr['y'], fr['w'], fr['h'], None, PAGE, ROOT, uvr, page))
        items[iid] = {'slot': it['slot'], **({'group': it['group']} if it.get('group') else {}),
                      'lift': it.get('lift', 0), 'page': page, 'hasWalk': has_walk, 'mesh': im.dump()}
        if it.get('torso') == MIDRIFF:   # it bares the waist: the runtime draws seated bottoms over its belly
            items[iid]['torso'] = MIDRIFF

    blink_keeps = {}   # stored page -> the item patches whose untouched texels are copied back after resizing
    if blink is not None:
        head = v['blink'].get('layer')
        head_box = next((L['box'] for L in v['layers'] if L['name'] == head), None)   # the head layer in sheet px
        patches = pack_blink_items(v['blink'], layer_images[head], head_box, items_src,
                                   item_rects, pages, page_taken, {k: i['mesh'] for k, i in items.items()}) if head_box is not None else []
        # no item copies an eye: the entry stays exactly as before (rigs without one export byte-identically)
        for pt in patches:
            blink_keeps.setdefault(pt['_keep'][0], []).append(pt.pop('_keep')[1:])
        if patches:
            blink['items'] = patches

    # mirror cards: after the blink patches, so they take only space that is still free
    head = v['blink'].get('layer') if blink is not None else None
    head_box = next((L['box'] for L in v['layers'] if L['name'] == head), None)
    eye = mirror_eye_context(v['blink'], layer_images[head], head_box) if head_box is not None else None
    for iid, it in sorted(v.get('items', {}).items()):
        mirror = pack_mirror_cards(iid, it, item_rects[iid], items[iid]['mesh'], items[iid]['page'], pages, page_taken, eye)
        if mirror:
            items[iid].update(mirror)

    page_names = []
    published = published_rig_items()
    for k, pg in enumerate(pages):
        page_names.append(f'{name}_page{k}.png')
        # UVs are normalised, so only the stored resolution changes. Published items keep Pillow's resize byte for
        # byte; the body and unpublished items take the ring-safe one (page_store.py, the strap-ghost fix).
        on_page = [iid for iid in sorted(items) if items[iid]['page'] == k]
        ring_safe, keep = page_scope(k, pg.size, on_page, item_rects, published)
        stored = store_page(pg, PAGE_STORE_SCALE, ring_safe, keep, math.ceil(PAD * PAGE_STORE_SCALE))
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


IOS_RIG_ASSETS = 'rigAssets.ios.ts'


def rig_asset_modules(pngs, astc):
    """The rig's texture modules: rigAssets.ts requires every PNG page (Android, web, Node tests). With the ASTC packs
    (--astc), rigAssets.ios.ts requires none: Metro takes it over rigAssets.ts on iOS, where every GPU has
    texture-compression-astc and the renderer draws from astc/astcAssets.ts, so the PNG pages stay out of the iOS
    bundle. Without --astc there is no iOS module and iOS bundles the PNG pages, as before."""
    # header kept from the exporter's old home so re-exports stay byte-identical to the approved files
    lines = ['/* Generated by tools/room-avatar-lab/bake25/export_rig.py. Do not edit. */',
             'export const ROOM_AVATAR_25D_TEXTURES: Record<string, number> = {']
    lines += [f'  "{n}": require("./{n}"),' for n in pngs]
    lines += ['}', '']
    modules = {'rigAssets.ts': '\n'.join(lines)}
    if astc:
        modules[IOS_RIG_ASSETS] = '\n'.join([
            '/* Generated by tools/avatar25d/export_rig.py --astc. Do not edit. */',
            '// iOS draws this rig from the packed ASTC pages (astc/astcAssets.ts), so it bundles none of the PNG pages:',
            '// Metro takes this file over rigAssets.ts on iOS. Android, web and Node tests use rigAssets.ts.',
            'export const ROOM_AVATAR_25D_TEXTURES: Record<string, number> = {}',
            ''])
    return modules


def main():
    rig = json.loads(SRC.read_text())
    check_item_slots(rig)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.png'):   # generated output only: the previous export's textures
        old.unlink()
    (OUT / IOS_RIG_ASSETS).unlink(missing_ok=True)   # written again below only with the ASTC packs
    walk = json.loads(MOTION_SRC.read_text()) if MOTION_SRC else {}
    source = f'{SRC.parent.name}/{SRC.name}' + (f' + {MOTION_SRC.parent.name}/{MOTION_SRC.name}' if MOTION_SRC else '')
    out = {'version': 1, 'source': source, 'motion': read_motion_config(),
           'views': {n: export_view(n, v, walk.get(n)) for n, v in sorted(rig.items()) if n in ('front', 'back')}}
    (OUT / 'rig25.json').write_text(json.dumps(out, separators=(',', ':'), sort_keys=True))
    pngs = sorted(p.name for p in OUT.iterdir() if p.suffix == '.png')
    for name, text in rig_asset_modules(pngs, ASTC).items():
        (OUT / name).write_text(text)
    if ASTC:
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from compress_pages import compress_rig
        compress_rig(OUT)
    files = sorted(p.name for p in OUT.iterdir())
    print('wrote', OUT, files)


if __name__ == '__main__':
    main()
