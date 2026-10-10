"""Blink gate: during a blink ONLY eye pixels change, and no hole opens.
Renders an exported rig's front view offline with the app's fragment rules (avatar25Gpu.ts fs: per-vertex page, blink
redirect = rect grown by pad + uv offset, premultiplied bilinear sample, alpha test 0.5), at rest pose, for every blink
frame, bare and with every item worn, at scale 1 and 2, unmirrored and mirrored. For each frame vs open:
  - eye mask = pixels the HEAD's own blink frames change (lids, lashes, iris: bare render, open vs a frame), except
    where an item covers them, plus an item's painted copy of the eye (eye_masks), grown by EYE_GROW px;
  - FAIL if a pixel changes visibly (>= VISIBLE) outside that mask grown EYE_GROW px, or at all outside it grown
    EYE_GROW stored texels (a half-size page's bilinear filter reaches 1 texel past a cleared texel);
  - FAIL on a hole: a pixel drawn in open that shows the background in the frame;
  - FAIL on a speck: item pixels left floating over the eye in a frame (not joined to the item outside the eye).
Mirroring is a vertex flip (uv unchanged), so it is checked by flipping the render; seated/walking move the rigid head
only (same texels, other placement), so the rest pose covers them for this texel rule.
Usage: python3 blink_gate.py <rigdir> [--report out.json]   (exit 1 on failure)"""
import json, pathlib, sys
import numpy as np
from PIL import Image

EYE_GROW = 2               # px the eye mask may be grown (rubric: dilated <= 2 px): no visible change outside it
VISIBLE = 24 / 255         # a channel step at least this big is a visible change; smaller drift is texture filtering
CHANGE_EPS = 2 / 255       # a channel moving less than this (8-bit rounding) is not a change
LAYERS = ('torso', 'head', 'nearArm', 'farArm')
FRAMES = ('half', 'closed')
SKIN_DIST = 60 / 255      # a head pixel this far from the face's skin is the eye drawing (as the exporter)
HAIR_MISMATCH = 90 / 255  # an item pixel this far from the head's own eye pixel is hair, not a painted eye copy
LASH_SAT = 0.65           # an eye copy's lash line: HSV saturation above this (hair brown ~0.45-0.5) ...
LASH_VALUE = 90 / 255     # ... and darker than this (as the exporter)
COPY_REACH = 4            # px around the head's eye drawing that may hold an item's eye copy (rim, lash dots)


def load(rigdir):
    rigdir = pathlib.Path(rigdir)
    v = json.loads((rigdir / 'rig25.json').read_text())['views']['front']
    pages = [np.asarray(Image.open(rigdir / p).convert('RGBA')).astype(np.float64) / 255 for p in v['pages']]
    return v, pages


def redirects(v, frame):
    b = v.get('blink')
    if not b or frame == 'open':
        return []
    pw, ph = v['pageSize']

    def entry(page, rect, pad, off):
        x, y, w, h = rect
        return page, ((x - pad) / pw, (y - pad) / ph, (x + w + pad) / pw, (y + h + pad) / ph), (off[0] / pw, off[1] / ph)

    out = [entry(b.get('page', 0), b['rect'], b.get('pad', 0), b['frames'][frame])]
    out += [entry(it['page'], it['rect'], it.get('pad', 0), it['offset']) for it in b.get('items', [])]
    return out


def _sample(page, u, vv):
    H, W = page.shape[:2]
    x = u * W - 0.5; y = vv * H - 0.5
    fx = (x - np.floor(x))[:, None]; fy = (y - np.floor(y))[:, None]
    x0 = np.clip(np.floor(x).astype(int), 0, W - 1); y0 = np.clip(np.floor(y).astype(int), 0, H - 1)
    x1 = np.clip(x0 + 1, 0, W - 1); y1 = np.clip(y0 + 1, 0, H - 1)

    def pm(px):
        return np.concatenate([px[:, :3] * px[:, 3:4], px[:, 3:4]], 1)
    return (pm(page[y0, x0]) * (1 - fx) * (1 - fy) + pm(page[y0, x1]) * fx * (1 - fy)
            + pm(page[y1, x0]) * (1 - fx) * fy + pm(page[y1, x1]) * fx * fy)


def _draw(canvas, mesh, rg, pages, redir, scale, box):
    pos = np.asarray(mesh['pos'], float).reshape(-1, 2); uv = np.asarray(mesh['uv'], float).reshape(-1, 2)
    pg = np.asarray(mesh['page']); idx = np.asarray(mesh['index'][rg['start']:rg['start'] + rg['count']]).reshape(-1, 3)
    H, W = canvas.shape[:2]
    for t in idx:
        P = (pos[t] - box[:2]) * scale; T = uv[t]; page = int(pg[t[0]])
        x0, y0 = np.maximum(np.floor(P.min(0)).astype(int), 0); x1, y1 = np.ceil(P.max(0)).astype(int)
        x1 = min(x1, W - 1); y1 = min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]; px = xs.ravel() + 0.5; py = ys.ravel() + 0.5
        (ax, ay), (bx, by), (cx, cy) = P
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
        l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
        inside = (l0 >= -1e-9) & (l1 >= -1e-9) & (1 - l0 - l1 >= -1e-9)
        if not inside.any():
            continue
        l0, l1 = l0[inside], l1[inside]; l2 = 1 - l0 - l1
        u = l0 * T[0, 0] + l1 * T[1, 0] + l2 * T[2, 0]; vv = l0 * T[0, 1] + l1 * T[1, 1] + l2 * T[2, 1]
        for rp, r, off in redir:
            if rp == page:
                m = (u >= r[0]) & (vv >= r[1]) & (u <= r[2]) & (vv <= r[3])
                u = np.where(m, u + off[0], u); vv = np.where(m, vv + off[1], vv)
        c = _sample(pages[page], u, vv)
        keep = c[:, 3] >= 0.5
        X = xs.ravel()[inside][keep]; Y = ys.ravel()[inside][keep]
        canvas[Y, X, :3] = c[keep, :3] / c[keep, 3:4]; canvas[Y, X, 3] = 1


def head_box(v):
    """Sheet-space box around the head range (where a blink can show), + margin."""
    mesh = v['mesh']; pos = np.asarray(mesh['pos'], float).reshape(-1, 2)
    rg = next(r for r in mesh['ranges'] if r['name'] == 'head')
    pts = pos[np.asarray(mesh['index'][rg['start']:rg['start'] + rg['count']])]
    lo = np.floor(pts.min(0)) - 8; hi = np.ceil(pts.max(0)) + 8
    return np.array([lo[0], lo[1], hi[0], hi[1]])


def render(v, pages, items=(), frame='open', scale=1.0, box=None):
    """RGBA float image; alpha 0 = background."""
    box = head_box(v) if box is None else np.asarray(box, float)
    W = int((box[2] - box[0]) * scale); H = int((box[3] - box[1]) * scale)
    canvas = np.zeros((H, W, 4))
    layers = [(rg['order'], v['mesh'], rg) for rg in v['mesh']['ranges'] if rg['name'] in LAYERS]
    for iid in items:
        it = v['items'][iid]
        layers += [(rg['order'], it['mesh'], rg) for rg in it['mesh']['ranges']
                   if rg.get('layer') in LAYERS and 'legVariant' not in rg]
    redir = redirects(v, frame)
    for _, mesh, rg in sorted(layers, key=lambda l: l[0]):
        _draw(canvas, mesh, rg, pages, redir, scale, box)
    return canvas


def _grow(mask, n):
    out = mask.copy()
    for _ in range(n):
        g = out.copy()
        g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]
        out = g
    return out


def changed(a, b):
    return np.abs(a - b).max(-1) > CHANGE_EPS


def _flood(seed, through):
    """Pixels of `through` 4-connected to `seed` (seed included)."""
    out = seed.copy()
    while True:
        g = out.copy()
        g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]
        g &= through | seed
        if (g == out).all():
            return out
        out = g


def _dist(a, b):
    return np.sqrt(((a[..., :3] - b[..., :3]) ** 2).sum(-1))


def eye_masks(bare_open, bare_frames, dressed_open, scale=1.0):
    """(eye, zone, item_eye): eye = the pixels a blink may change before growing. lid = what the head's own frames change (bare: lids, lashes, iris); zone = the head's
    eye drawing grown by COPY_REACH; item_eye = item pixels in the zone that are a painted copy of the eye, i.e. not
    hair: hair = item pixels joined to the item outside the zone, inside the eye drawing only through pixels above
    the copy's upper lash line or ones that do not look like the head's eye there. Hair over the lids is NOT allowed to change."""
    lid = np.any([changed(f, bare_open) for f in bare_frames], 0)
    ring = _grow(lid, 6) & ~lid & (bare_open[..., 3] > 0)
    skin = np.median(bare_open[ring][:, :3], 0) if ring.any() else np.array([1.0, 0.85, 0.75])
    draw = lid & (_dist(bare_open, skin[None, None]) > SKIN_DIST)
    zone = _grow(draw, int(round(COPY_REACH * scale)))
    over = changed(dressed_open, bare_open)
    border = np.zeros(over.shape, bool); border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    around = _flood(border & over & ~zone, over & ~zone)
    rgb = dressed_open[..., :3]; mx = rgb.max(-1)
    lash = over & draw & ((mx - rgb.min(-1)) > LASH_SAT * np.maximum(mx, 1 / 255)) & (mx < LASH_VALUE)
    h = over.shape[0]
    top = np.where(lash.any(0), lash.argmax(0), 0)
    above = np.arange(h)[:, None] < top[None, :]      # item px above an eye copy's upper lash line: bangs, not eye
    path = over & (~draw | above | (_dist(dressed_open, bare_open) > HAIR_MISMATCH))
    hair = _flood(around, path & zone)
    item_eye = over & zone & ~hair
    base = (lid & ~over) | item_eye
    return base, zone, item_eye


def specks(bare_frame, frame, zone):
    """Item pixels showing in a blink frame inside the eye zone that are not joined to the item outside it: loose
    bits of an eye copy left floating over the closed eye."""
    item = changed(frame, bare_frame) & (frame[..., 3] > 0)
    border = np.zeros(item.shape, bool); border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    joined = _flood(_flood(border & item & ~zone, item & ~zone), item)
    visible = np.abs(frame - bare_frame).max(-1) >= VISIBLE      # filter drift next to a cut is not a speck
    return item & visible & zone & ~joined


def _holes(o, f, allowed):
    """Background showing in the frame where open drew something; an eye pixel past the face outline that the frame
    no longer draws (a lash tip, connected to the outside) is the eye changing, not a hole."""
    drop = (o[..., 3] > 0) & (f[..., 3] == 0)
    outside = _flood(o[..., 3] == 0, drop & allowed)
    return drop & ~(outside & allowed)


def check(rigdir, scales=(1.0, 2.0)):
    """Every case's numbers; case['ok'] is False on any changed pixel outside the eye masks or any hole."""
    v, pages = load(rigdir)
    if not v.get('blink'):
        return []
    outfits = {'bare': (), 'dressed': tuple(sorted(v.get('items', {})))}
    texel_scale = pages[0].shape[1] / v['pageSize'][0]     # stored texels per sheet px (0.5: half-size pages)
    cases = []
    for scale in scales:
        bare = {fr: render(v, pages, (), fr, scale) for fr in ('open',) + FRAMES}
        for outfit, items in outfits.items():
            r = bare if not items else {fr: render(v, pages, items, fr, scale) for fr in ('open',) + FRAMES}
            eye, zone, item_eye = eye_masks(bare['open'], [bare[fr] for fr in FRAMES], r['open'], scale)
            near = _grow(eye, int(round(EYE_GROW * scale)))                      # px: nothing visible changes outside
            texel = _grow(eye, int(round(EYE_GROW * scale / texel_scale)))      # texels: nothing changes at all
            for frame in FRAMES:
                for mirror in (False, True):
                    flip = (lambda a: a[:, ::-1]) if mirror else (lambda a: a)
                    o, f, ok_px, ok_near = flip(r['open']), flip(r[frame]), flip(texel), flip(near)
                    loose = specks(flip(bare[frame]), f, flip(zone))
                    diff = changed(o, f)
                    outside = (diff & ~ok_px) | (diff & ~ok_near & (np.abs(o - f).max(-1) >= VISIBLE))
                    hole = _holes(o, f, ok_px)
                    ys, xs = np.nonzero(outside)
                    cases.append({'outfit': outfit, 'frame': frame, 'scale': scale, 'mirror': mirror,
                                  'changed': int(diff.sum()), 'itemEye': int(item_eye.sum()),
                                  'outsideEye': int(outside.sum()), 'holes': int(hole.sum()), 'specks': int(loose.sum()),
                                  'outsideBox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None,
                                  'ok': not outside.any() and not hole.any() and not loose.any()})
    return cases


if __name__ == '__main__':
    a = sys.argv[1:]
    res = check(a[0])
    if '--report' in a:
        pathlib.Path(a[a.index('--report') + 1]).write_text(json.dumps(res, indent=1))
    for c in res:
        print(('PASS' if c['ok'] else 'FAIL'), {k: c[k] for k in c if k != 'ok'})
    sys.exit(0 if res and all(c['ok'] for c in res) else 1)
