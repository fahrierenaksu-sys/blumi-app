"""Page store resize for the rig exporter, with the strap-ghost fix scoped to unpublished items.

Pillow resizes RGBA premultiplied in 8 bit and clips the ringing alpha (> 255) before it un-premultiplies, so the colour
just inside every hard alpha edge comes out up to ~10% lighter. Where two pieces of one item overlap (a dress's full
piece + its upper piece over the shoulder skin) the upper piece's edge shows as two light lines: the 'strap ghost'
(WB integration/strapghost_1710). `resize_rgba_lanczos` is the same LANCZOS on float premultiplied bands, divided by
the unclipped alpha, then clipped: same size, sharpness and UVs, no light rim.

Single decision point (`store_page`): texels of items that draw a published (receipted) shop item, and pages without
items (the body), keep Pillow's resize byte for byte; only unpublished items' texels take the ring-safe resize. An item
becomes published only through owner receipts, and its look must not change under them.
"""
import json, math, pathlib, re
from PIL import Image

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
RELEASE_CATALOG = ROOT_DIR / 'packages/domain/src/release/blumiR1ReleaseCatalog.json'
ITEM_ART = ROOT_DIR / 'apps/mobile/src/features/avatar/model/avatarItemArt.ts'
ART_ENTRY = re.compile(r'^\s*(\w+): "(\w+)",?\s*$', re.M)   # `catalogId: "rigItemId",` in AVATAR_ITEM_ART


def published_rig_items(catalog=RELEASE_CATALOG, item_art=ITEM_ART):
    """Rig item ids that draw a published shop item: the published ids themselves and every rig item they map to."""
    published = {x['itemId'] for x in json.loads(pathlib.Path(catalog).read_text())['publishedItems']}
    art = ART_ENTRY.findall(pathlib.Path(item_art).read_text())
    if not published or not art:
        raise SystemExit(f'page store: read {len(published)} published items and {len(art)} item-art entries; '
                         'refusing to guess which items keep the old resize')
    return frozenset(published | {rig for item, rig in art if item in published})


def resize_rgba_lanczos(im, size):
    """LANCZOS for straight-alpha RGBA without the light rim at hard alpha edges (see the module doc)."""
    import numpy as np
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    al = a[..., 3] / 255.0
    band = lambda x: np.asarray(Image.fromarray(x.astype(np.float32), 'F').resize(size, Image.LANCZOS))
    A = band(al)
    out = np.zeros((size[1], size[0], 4), np.float32)
    safe = np.maximum(A, 1e-4)
    for c in range(3):
        out[..., c] = np.where(A > 1e-4, band(a[..., c] * al) / safe, 0)
    out[..., 3] = A * 255.0
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), 'RGBA')


def _rect_mask(rects, size, scale, margin):
    import numpy as np
    mask = np.zeros((size[1], size[0]), bool)
    for x, y, w, h in rects:
        x0, y0 = max(0, math.floor(x * scale) - margin), max(0, math.floor(y * scale) - margin)
        x1, y1 = math.ceil((x + w) * scale) + margin, math.ceil((y + h) * scale) + margin
        mask[y0:y1, x0:x1] = True
    return mask


def store_page(page, scale, ring_safe_rects=(), keep_rects=(), margin=3):
    """The stored page: Pillow LANCZOS everywhere, except inside `ring_safe_rects` (source px, the unpublished items'
    packed parts) minus `keep_rects` (the published items' parts), which take the ring-safe resize. `margin` stored px
    around each rect covers the filter's reach (the packer leaves PAD = 6 source px = 3 stored px around each part)."""
    if scale == 1:
        return page
    size = (round(page.width * scale), round(page.height * scale))
    stored = page.resize(size, Image.LANCZOS)
    if not ring_safe_rects:
        return stored
    import numpy as np
    take = _rect_mask(ring_safe_rects, size, scale, margin) & ~_rect_mask(keep_rects, size, scale, margin)
    out = np.where(take[..., None], np.asarray(resize_rgba_lanczos(page, size)), np.asarray(stored))
    return Image.fromarray(out.astype(np.uint8), 'RGBA')
