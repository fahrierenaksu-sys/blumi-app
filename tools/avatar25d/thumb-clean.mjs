/**
 * Edge cleaner for item card thumbs (runs on the final, resized thumb RGBA). Removal and edge recolour only:
 *  1. seams: a part seam left inside the item (pixels >= SEAM_DEPTH px from transparency with alpha < 255, and enclosed
 *     transparent gaps of at most HOLE_MAX_PX) takes the mean colour of its opaque neighbours at full alpha;
 *  2. flecks: skin-coloured pixels on the outline (<= EDGE_DEPTH px) that differ from the garment's own nearby core
 *     (CIELAB distance > FLECK_DELTA_E) are removed where they stick out and recoloured from the nearest core pixel elsewhere;
 *     (flecks: false for items whose own light colours sit inside the skin model, e.g. cream suede panels)
 *  3. spurs (opt-in, the cut heel collars of shoes): parts of the outline thinner than SPUR_WIDTH px are removed;
 *  4. islands smaller than ISLAND_MAX_SHARE of the largest piece are removed.
 * No pixel outside the item's outline is ever made visible.
 */
const SEAM_DEPTH = 3, HOLE_MAX_PX = 8, EDGE_DEPTH = 5, CORE_DEPTH = 5, CORE_RADIUS = 8, FLECK_DELTA_E = 18
const SKIN = { lightness: [22, 96], chroma: [14, 90], hue: [15, 90] }
const SPUR_WIDTH = 5, ISLAND_MAX_SHARE = 0.01

function lab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const within = (v, [lo, hi]) => v >= lo && v <= hi
function neighbours(p, W, H, visit) {
  const x = p % W, y = (p - x) / W
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const u = x + dx, v = y + dy
    if ((dx || dy) && u >= 0 && v >= 0 && u < W && v < H) visit(v * W + u)
  }
}
/** Chessboard steps from each visible pixel to transparency or the image edge, counted up to max (else max + 1). */
function depthOf(visible, W, H, max) {
  const depth = new Uint8Array(W * H).fill(max + 1)
  let front = []
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p - x) / W
    if (!visible[p]) { depth[p] = 0; front.push(p) } else if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { depth[p] = 1 }
  }
  for (let p = 0; p < W * H; p++) if (depth[p] === 1) front.push(p)
  for (let d = 1; d <= max; d++) {
    const next = []
    for (const p of front) neighbours(p, W, H, (q) => { if (depth[q] > d) { depth[q] = d; next.push(q) } })
    front = next
  }
  return depth
}
function components(mask, W, H) {
  const seen = new Uint8Array(W * H), pieces = []
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !mask[i]) continue
    const piece = [i]; seen[i] = 1
    for (let k = 0; k < piece.length; k++) neighbours(piece[k], W, H, (q) => { if (!seen[q] && mask[q]) { seen[q] = 1; piece.push(q) } })
    pieces.push(piece)
  }
  return pieces
}
/** Pixels of `mask` covered by some size x size square that lies fully inside it (a morphological opening). */
function opened(mask, W, H, size) {
  const fits = new Uint8Array(W * H), out = new Uint8Array(W * H)
  for (let y = 0; y + size <= H; y++) for (let x = 0; x + size <= W; x++) {
    let ok = 1
    for (let v = 0; v < size && ok; v++) for (let u = 0; u < size && ok; u++) ok = mask[(y + v) * W + x + u]
    fits[y * W + x] = ok
  }
  for (let y = 0; y + size <= H; y++) for (let x = 0; x + size <= W; x++) {
    if (!fits[y * W + x]) continue
    for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) out[(y + v) * W + x + u] = 1
  }
  return out
}
function fillFromNeighbours(src, out, p, W, H) {
  let r = 0, g = 0, b = 0, n = 0
  neighbours(p, W, H, (q) => { if (src[q * 4 + 3] === 255) { r += src[q * 4]; g += src[q * 4 + 1]; b += src[q * 4 + 2]; n++ } })
  if (n === 0) return false
  out[p * 4] = Math.round(r / n); out[p * 4 + 1] = Math.round(g / n); out[p * 4 + 2] = Math.round(b / n); out[p * 4 + 3] = 255
  return true
}

export function cleanThumb(rgba, W, H, { spurs = false, flecks = true } = {}) {
  const n = W * H, out = Buffer.from(rgba), stats = { seam: 0, hole: 0, fleckRemoved: 0, fleckRecoloured: 0, spur: 0, island: 0 }
  // 1. seams and small enclosed gaps
  const visible = new Uint8Array(n); for (let p = 0; p < n; p++) visible[p] = rgba[p * 4 + 3] > 0
  const depth = depthOf(visible, W, H, CORE_DEPTH)
  for (let p = 0; p < n; p++) if (depth[p] >= SEAM_DEPTH && rgba[p * 4 + 3] < 255 && fillFromNeighbours(rgba, out, p, W, H)) stats.seam++
  const empty = new Uint8Array(n); for (let p = 0; p < n; p++) empty[p] = !visible[p]
  for (const piece of components(empty, W, H)) {
    if (piece.length > HOLE_MAX_PX) continue
    const touchesEdge = piece.some((p) => { const x = p % W, y = (p - x) / W; return x === 0 || y === 0 || x === W - 1 || y === H - 1 })
    if (touchesEdge) continue
    for (const p of piece) if (fillFromNeighbours(out, out, p, W, H)) stats.hole++
  }
  // 2. flecks on the outline
  const labs = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) labs.set(lab(out[p * 4], out[p * 4 + 1], out[p * 4 + 2]), p * 3)
  const vis2 = new Uint8Array(n); for (let p = 0; p < n; p++) vis2[p] = out[p * 4 + 3] > 0
  const depth2 = depthOf(vis2, W, H, CORE_DEPTH)
  const body = opened(vis2, W, H, 3)
  const core = []; for (let p = 0; p < n; p++) if (depth2[p] > CORE_DEPTH) core.push(p)
  const src = Buffer.from(out)
  for (let p = 0; p < n; p++) {
    if (!flecks || !vis2[p] || depth2[p] > EDGE_DEPTH) continue
    const [L, A, B] = [labs[p * 3], labs[p * 3 + 1], labs[p * 3 + 2]]
    const chroma = Math.hypot(A, B), hue = (Math.atan2(B, A) * 180) / Math.PI
    if (!(within(L, SKIN.lightness) && within(chroma, SKIN.chroma) && within(hue, SKIN.hue))) continue
    const x = p % W, y = (p - x) / W
    let sL = 0, sA = 0, sB = 0, k = 0, best = -1, bestD = Infinity
    for (let v = Math.max(0, y - CORE_RADIUS); v <= Math.min(H - 1, y + CORE_RADIUS); v++) for (let u = Math.max(0, x - CORE_RADIUS); u <= Math.min(W - 1, x + CORE_RADIUS); u++) {
      const q = v * W + u
      if (depth2[q] <= CORE_DEPTH) continue
      sL += labs[q * 3]; sA += labs[q * 3 + 1]; sB += labs[q * 3 + 2]; k++
      const d = (u - x) ** 2 + (v - y) ** 2
      if (d < bestD) { bestD = d; best = q }
    }
    if (k === 0) continue
    if (Math.hypot(L - sL / k, A - sA / k, B - sB / k) <= FLECK_DELTA_E) continue
    if (!body[p]) { out.fill(0, p * 4, p * 4 + 4); stats.fleckRemoved++ }
    else { src.copy(out, p * 4, best * 4, best * 4 + 3); stats.fleckRecoloured++ }
  }
  // 3. spurs (thin outline teeth)
  if (spurs) {
    const vis3 = new Uint8Array(n); for (let p = 0; p < n; p++) vis3[p] = out[p * 4 + 3] > 0
    const keep = opened(vis3, W, H, SPUR_WIDTH)
    const thin = new Uint8Array(n); for (let p = 0; p < n; p++) thin[p] = vis3[p] && !keep[p]
    for (const piece of components(thin, W, H)) {
      if (piece.length < SPUR_WIDTH) continue           // a few rim pixels of a smooth curve, not a tooth
      for (const p of piece) { out.fill(0, p * 4, p * 4 + 4); stats.spur++ }
    }
  }
  // 4. islands
  const vis4 = new Uint8Array(n); for (let p = 0; p < n; p++) vis4[p] = out[p * 4 + 3] > 0
  const pieces = components(vis4, W, H), largest = Math.max(0, ...pieces.map((x) => x.length))
  for (const piece of pieces) if (piece.length < largest * ISLAND_MAX_SHARE) for (const p of piece) { out.fill(0, p * 4, p * 4 + 4); stats.island++ }
  return { rgba: out, stats }
}
