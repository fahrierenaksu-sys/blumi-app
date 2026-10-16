#!/usr/bin/env node
/**
 * Card thumbs cut from an item's showcase FRONT layer (ITEM_SYNC_RULES: Shop and Wardrobe show the showcase front).
 * Run by hand on a machine that has the art Workbench, from the repository root, then run bake-stills.mjs and commit:
 *
 *     node tools/avatar25d/front-thumbs.mjs --sources <tsv>     columns: item_id, rig (female|male), front, back[, base]
 *
 *     [--base-female <png>] [--base-male <png>] [--evidence <dir>]   the showcase bases (default: the Workbench's)
 *
 * A row's optional `cut` picks the cleanup (default "full"):
 *   full      withoutCarriedBody against the base, paper white included (factory layers cut from a dressed render);
 *   skin      withoutCarriedBody on skin-coloured pixels only, no paper rule (white, cream or grey fabric touching the
 *             body), then the thumb edge cleaner (skin flecks at cuffs and hems);
 *   edge      no colour cut (art whose own colours sit inside the skin model: tan leather, honey hair, cream fabric):
 *             detached pieces under EDGE_FRAGMENT_MAX_SHARE of the largest go (hands), then the edge cleaner;
 *   raw       the layer as it is.
 * A row's optional `base` is the showcase base on the front layer's canvas (default: the rig's).
 * Each row's front layer (with its hair back layer under it, when `back` is not empty), less the body it carries
 * (withoutCarriedBody, against the showcase base; not for glasses and small accessories), is cropped to its alpha rect,
 * scaled down (never up) to at most 256 px with a premultiplied lanczos3 resize, and written as a lossless WebP, the
 * same size rule and format as the rig-baked thumbs. Only pixels of the existing art are kept: nothing is painted.
 *
 * Output
 *   tools/avatar25d/thumb-fronts/<rig>/<item>.webp   the thumb
 *   tools/avatar25d/thumb-fronts.json                each thumb's sha256 and its source layers' sha256 (merged)
 *
 * bake-stills.mjs takes every item's card thumb from its front (see thumbSource): Shop and Wardrobe cards show the
 * item from the front, never the room's three-quarter view (owner, 2026-10-16). A published item's thumb is
 * hash-locked by its receipt, so its front pin is accepted only when PUBLISHED_FRONT_THUMBS lists it; its receipt is
 * reissued with the new thumb bytes after the owner's yes.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { cleanThumb } from "./thumb-clean.mjs"

export const THUMB_MAX_PX = 256
/** Coverage (of 255) at or under which a resized pixel is lanczos ringing, not art (invisible on any card). */
const RINGING_ALPHA_MAX = 2
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
export const FRONT_THUMBS_DIR = join(ROOT, "tools/avatar25d/thumb-fronts")
export const FRONT_THUMBS_PINS = join(ROOT, "tools/avatar25d/thumb-fronts.json")
const RIGS = new Set(["female", "male"])
const CUTS = new Set(["full", "skin", "edge", "raw"])

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** The tight rect [x, y, w, h] of the pixels with any alpha, or null when the image is empty. */
export function alphaRect(rgba, width, height) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] === 0) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1]
}

/** Thumb size for an item rect: the rig-baked rule (bake-stills.mjs), at most THUMB_MAX_PX, never upscaled. */
export function thumbSize(w, h) {
  const scale = Math.min(1, THUMB_MAX_PX / Math.max(w, h))
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))]
}

/** Downscale of straight RGBA, premultiplied: sharp (libvips) premultiplies any image with alpha before a resize and
 *  unpremultiplies after, so transparent pixels never darken or tint a soft edge (frontThumbs.test.mjs checks it). */
export async function premultipliedResize(rgba, width, height, toW, toH) {
  const out = await sharp(rgba, { raw: { width, height, channels: 4 } }).resize(toW, toH, { kernel: "lanczos3" }).raw().toBuffer()
  // lanczos ringing leaves isolated pixels of at most RINGING_ALPHA_MAX coverage outside the outline: not the item
  for (let i = 3; i < out.length; i += 4) if (out[i] <= RINGING_ALPHA_MAX) out.fill(0, i - 3, i + 1)
  return out
}

async function rawOf(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Straight-alpha "over": `top` drawn on `under` (same canvas). */
function over(under, top) {
  const out = Buffer.alloc(top.length)
  for (let i = 0; i < top.length; i += 4) {
    const ta = top[i + 3] / 255, ua = under[i + 3] / 255
    const a = ta + ua * (1 - ta)
    if (a === 0) continue
    for (let k = 0; k < 3; k++) out[i + k] = Math.round((top[i + k] * ta + under[i + k] * ua * (1 - ta)) / a)
    out[i + 3] = Math.round(a * 255)
  }
  return out
}

/** Slots whose front layer is drawn alone (no body under it to carry): glasses and small accessories. */
const DRAWN_ALONE_PREFIXES = ["glasses_", "clip_", "necklace_", "bag_"]
export const carriesBody = (itemId) => !DRAWN_ALONE_PREFIXES.some((prefix) => itemId.startsWith(prefix))
/** How far (front canvas px) a carried body pixel may sit from the same body pixel of the showcase base. */
const BODY_MATCH_RADIUS = 8
/** CIELAB distance under which an item pixel is the base's own body colour at that place. */
const BODY_MATCH_DELTA_E = 9
/** A base pixel is skin (not the base tank or shorts) above this CIELAB chroma with a warm hue. */
const SKIN_MIN_CHROMA = 9
/** Paper white of the dressed render the layer was cut from (gaps between arm and body): CIELAB lightness above
 *  and chroma under these. Removed only when reached from outside, so a white garment inside its outline stays. */
const PAPER_MIN_LIGHTNESS = 97
const PAPER_MAX_CHROMA = 3
/** The "skin" cut: only skin-coloured item pixels (warm, CIELAB chroma over SKIN_MIN_CHROMA) can be carried body, and
 *  there is no paper rule, so white, cream and grey fabric next to the neck, hands or hips is never cut. */
const SKIN_CUT = { paper: false, skinOnly: true }
/** A piece left after the cut smaller than this share of the item's largest piece is a body fragment. */
const FRAGMENT_MAX_SHARE = 0.01
/** Without a body cut ("edge"), a detached piece under this share of the largest is carried body (a hand beside
 *  trousers), as bake-stills.mjs ISLAND_MAX_SHARE: a pair of shoes or two pigtails are pieces of similar size. */
const EDGE_FRAGMENT_MAX_SHARE = 0.05

/** Pixels (straight RGBA) without the detached pieces under `share` of the largest piece. */
function withoutFragments(rgba, width, height, share) {
  const out = Buffer.from(rgba), parts = pieces(rgba, width, height)
  const largest = parts[0]?.length ?? 0
  for (const piece of parts) if (piece.length < largest * share) for (const p of piece) out.fill(0, p * 4, p * 4 + 4)
  return out
}

function labOf(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** The showcase base's skin (face, neck, arms, hands, legs, feet and their outline), as CIELAB per pixel. */
function baseSkin(base) {
  const n = base.width * base.height
  const lab = new Float32Array(n * 3), skin = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (base.data[i * 4 + 3] < 128) continue
    const [L, A, B] = labOf(base.data[i * 4], base.data[i * 4 + 1], base.data[i * 4 + 2])
    lab.set([L, A, B], i * 3)
    if (Math.hypot(A, B) > SKIN_MIN_CHROMA && A > 0 && B > 0) skin[i] = 1
  }
  return { lab, skin }
}

/** 8-connected pieces of the pixels with alpha, largest first (each a list of pixel indices). */
function pieces(rgba, width, height) {
  const seen = new Uint8Array(width * height), out = []
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || rgba[start * 4 + 3] === 0) continue
    const piece = [start], stack = [start]
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = (p - x) / width
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * width + nx
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[q] || rgba[q * 4 + 3] === 0) continue
        seen[q] = 1; piece.push(q); stack.push(q)
      }
    }
    out.push(piece)
  }
  return out.sort((a, b) => b.length - a.length)
}

/** Item pixels whose colour the showcase base has as skin within BODY_MATCH_RADIUS px, or paper white (1 = matched). */
function matchesBaseSkin(item, { lab, skin }, { paper, skinOnly }) {
  const { width, height } = item
  const matched = new Uint8Array(width * height)
  const r = BODY_MATCH_RADIUS, limit = BODY_MATCH_DELTA_E ** 2
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    if (item.data[p * 4 + 3] === 0) continue
    const [L, A, B] = labOf(item.data[p * 4], item.data[p * 4 + 1], item.data[p * 4 + 2])
    if (paper && L > PAPER_MIN_LIGHTNESS && Math.hypot(A, B) < PAPER_MAX_CHROMA) { matched[p] = 1; continue }
    if (skinOnly && !(Math.hypot(A, B) > SKIN_MIN_CHROMA && A > 0 && B > 0)) continue
    search: for (let dy = -r; dy <= r; dy++) {
      const qy = y + dy
      if (qy < 0 || qy >= height) continue
      for (let dx = -r; dx <= r; dx++) {
        const qx = x + dx, q = qy * width + qx
        if (qx < 0 || qx >= width || !skin[q]) continue
        const dL = L - lab[q * 3], dA = A - lab[q * 3 + 1], dB = B - lab[q * 3 + 2]
        if (dL * dL + dA * dA + dB * dB < limit) { matched[p] = 1; break search }
      }
    }
  }
  return matched
}

/**
 * Removes the body a front layer carries (the factory cuts each layer from a dressed render, so a neck, wrists, hands
 * or a face outline can come with it, and the render's paper white in the gaps). A pixel goes only when the showcase
 * base itself has skin of that colour within BODY_MATCH_RADIUS px (or it is paper white) AND it is reached from outside the item through such pixels. Then detached pieces under
 * FRAGMENT_MAX_SHARE of the largest piece (hands) go. Pixels are only removed, never painted.
 */
export function withoutCarriedBody(item, base, { paper = true, skinOnly = false } = {}) {
  const { width, height } = item
  if (base.width !== width || base.height !== height) throw new Error("the showcase base canvas differs from the front layer")
  const matched = matchesBaseSkin(item, baseSkin(base), { paper, skinOnly })
  // only body reachable from outside the item through matched pixels: fabric that looks like skin inside the outline
  // (light gingham checks, suede toe caps) is never reached, so the cut cannot hole the garment
  const out = Buffer.from(item.data), removed = new Uint8Array(width * height)
  const outside = (x, y) => x < 0 || y < 0 || x >= width || y >= height || item.data[(y * width + x) * 4 + 3] === 0
  const stack = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    if (!matched[p]) continue
    if (outside(x - 1, y) || outside(x + 1, y) || outside(x, y - 1) || outside(x, y + 1)) { removed[p] = 1; stack.push(p) }
  }
  while (stack.length) {
    const p = stack.pop(), x = p % width, y = (p - x) / width
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, q = ny * width + nx
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || removed[q] || !matched[q]) continue
      removed[q] = 1; stack.push(q)
    }
  }
  for (let p = 0; p < width * height; p++) if (removed[p]) out.fill(0, p * 4, p * 4 + 4)
  const parts = pieces(out, width, height)
  const largest = parts[0]?.length ?? 0
  for (const piece of parts) if (piece.length < largest * FRAGMENT_MAX_SHARE) for (const p of piece) { out.fill(0, p * 4, p * 4 + 4); removed[p] = 2 }
  return { data: out, width, height, removed }
}

/** The card thumb of a front layer (and its hair back layer under it): { webp, width, height }. */
export async function cutFrontThumb(frontPath, backPath, basePath, { match = {}, edgeClean = false } = {}) {
  const front = await rawOf(frontPath)
  let pixels = front.data
  if (backPath) {
    const back = await rawOf(backPath)
    if (back.width !== front.width || back.height !== front.height) throw new Error(`${backPath}: back layer canvas differs from its front layer`)
    pixels = over(back.data, front.data)
  }
  let removed = null
  if (!basePath && edgeClean) pixels = withoutFragments(pixels, front.width, front.height, EDGE_FRAGMENT_MAX_SHARE)
  if (basePath) {
    const cut = withoutCarriedBody({ data: pixels, width: front.width, height: front.height }, await rawOf(basePath), match)
    pixels = cut.data
    removed = cut.removed
  }
  const rect = alphaRect(pixels, front.width, front.height)
  if (!rect) throw new Error(`${frontPath}: the front layer is empty`)
  const [x0, y0, w, h] = rect
  const cropped = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) pixels.copy(cropped, y * w * 4, ((y0 + y) * front.width + x0) * 4, ((y0 + y) * front.width + x0 + w) * 4)
  const [toW, toH] = thumbSize(w, h)
  const resized = toW === w && toH === h ? cropped : await premultipliedResize(cropped, w, h, toW, toH)
  const scaled = edgeClean ? Buffer.from(cleanThumb(resized, toW, toH).rgba) : resized
  const webp = await sharp(scaled, { raw: { width: toW, height: toH, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
  return { webp, width: toW, height: toH, rect, removed, full: { data: pixels, width: front.width, height: front.height } }
}

/** Published items whose card thumb moved to the front cut at the owner's request (2026-10-16: "mağaza ve wardrobe
 *  kartları ürünün önden görünümü olmalı"). Each needs its receipt reissued with the new thumb sha256. */
export const PUBLISHED_FRONT_THUMBS = new Set([
  "avatar_v2_hair_mocha_ribbon_waves", "avatar_v2_shoes_white_clean_sneakers", "hair_girl_bob", "hair_girl_pigtails",
  "avatar_v2_bottom_male_black_pocket_trousers", "avatar_v2_bottom_male_charcoal_trousers",
  "avatar_v2_bottom_male_cream_drawstring_trousers", "avatar_v2_bottom_male_cream_pleated_trousers",
  "avatar_v2_bottom_male_dark_straight_jeans", "avatar_v2_bottom_male_ecru_wide_trousers",
  "avatar_v2_bottom_male_grey_wide_jeans", "avatar_v2_hair_male_textured_twists",
  "avatar_v2_shoes_male_black_everyday_sneakers", "avatar_v2_shoes_male_brown_loafers",
  "avatar_v2_shoes_male_cream_chunky_sneakers", "avatar_v2_shoes_male_dark_leather_sneakers",
  "avatar_v2_shoes_male_green_skate_shoes", "avatar_v2_shoes_male_sand_desert_boots", "avatar_v2_shoes_male_tan_loafers",
  "avatar_v2_top_male_black_basic_tee", "avatar_v2_top_male_black_embroidered_sweatshirt",
  "avatar_v2_top_male_check_flannel_white_tee", "avatar_v2_top_male_forest_collar_sweater",
  "avatar_v2_top_male_navy_knit_polo", "avatar_v2_top_male_olive_overshirt", "avatar_v2_top_male_taupe_waffle_blouson"
])

export function readFrontThumbPins(path = FRONT_THUMBS_PINS) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { female: {}, male: {} }
}

/**
 * The one decision point for where a card thumb comes from:
 *   "redraw"  a hand-finished thumb pinned in bake-stills.mjs THUMB_REDRAWS (wins: it was checked by hand);
 *   "front"   the item's pinned front thumb (this tool's output); a published item only when PUBLISHED_FRONT_THUMBS
 *             lists it, since its thumb bytes are receipt-locked;
 *   "rig"     no front pin, only where the bake does not require one (an external rig export); the app bake
 *             (requireFront) fails instead, so no card falls back to the room's three-quarter view.
 */
export function thumbSource({ itemId, isPublished, hasRedraw, hasFront, requireFront = false }) {
  if (hasRedraw) return "redraw"
  if (isPublished && hasFront && !PUBLISHED_FRONT_THUMBS.has(itemId)) {
    throw new Error(`${itemId} is published: its thumb is receipt-locked, list it in PUBLISHED_FRONT_THUMBS (owner yes) or remove its front thumb pin`)
  }
  if (hasFront) return "front"
  if (requireFront) throw new Error(`${itemId}: no front thumb pin (cards show the item from the front; run front-thumbs.mjs)`)
  return "rig"
}

/** A pinned front thumb's bytes, verified against its pin (undefined when the item has none). */
export function pinnedFrontThumb(pins, rigId, itemId, dir = FRONT_THUMBS_DIR) {
  const pin = pins[rigId]?.[itemId]
  if (!pin) return undefined
  const bytes = readFileSync(join(dir, rigId, `${itemId}.webp`))
  if (sha256(bytes) !== pin.sha256) throw new Error(`${rigId}/${itemId}: the front thumb differs from thumb-fronts.json (re-run front-thumbs.mjs)`)
  return bytes
}

const option = (flag) => { const k = process.argv.indexOf(flag); return k >= 0 ? process.argv[k + 1] : undefined }
const WORKBENCH_SHOWCASE = join(process.env.HOME ?? "", "BlumiArtWorkbench/avatar25-v2/integration/card_design/showcase")
const DEFAULT_BASES = { female: join(WORKBENCH_SHOWCASE, "base/girl_a.png"), male: join(WORKBENCH_SHOWCASE, "base/boy_a.png") }

/** Evidence: the item before the cut and the cut marked (red: matched the base's body, yellow: fragment). */
async function writeEvidence(dir, itemId, frontPath, backPath, rect, removed, full) {
  mkdirSync(dir, { recursive: true })
  const front = await rawOf(frontPath)
  const before = backPath ? over((await rawOf(backPath)).data, front.data) : front.data
  const marked = Buffer.from(before)
  if (removed) for (let p = 0; p < removed.length; p++) if (removed[p]) marked.set(removed[p] === 1 ? [230, 0, 0, 255] : [255, 200, 0, 255], p * 4)
  const box = alphaRect(before, full.width, full.height)
  const png = (raw) => sharp(raw, { raw: { width: full.width, height: full.height, channels: 4 } })
    .extract({ left: box[0], top: box[1], width: box[2], height: box[3] }).png().toBuffer()
  writeFileSync(join(dir, `${itemId}__marked.png`), await png(marked))
}

function parseSources(path) {
  const [header, ...rows] = readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "")
  const cols = header.split("\t")
  for (const c of ["item_id", "rig", "front", "back"]) if (!cols.includes(c)) throw new Error(`${path}: missing column ${c}`)
  return rows.map((line) => Object.fromEntries(line.split("\t").map((v, i) => [cols[i], v.trim()])))
}

async function main() {
  const at = process.argv.indexOf("--sources")
  if (at < 0 || !process.argv[at + 1]) throw new Error("usage: node tools/avatar25d/front-thumbs.mjs --sources <tsv>")
  const rows = parseSources(process.argv[at + 1])
  const bases = { female: option("--base-female") ?? DEFAULT_BASES.female, male: option("--base-male") ?? DEFAULT_BASES.male }
  const evidence = option("--evidence")
  const pins = readFrontThumbPins()
  const next = { female: { ...pins.female }, male: { ...pins.male } }
  for (const row of rows) {
    if (!RIGS.has(row.rig)) throw new Error(`${row.item_id}: rig must be female or male, got ${row.rig}`)
    if (!/^[a-z0-9_]+$/.test(row.item_id)) throw new Error(`bad item id ${row.item_id}`)
    const back = row.back && row.back !== "none" ? row.back : undefined
    const cut = row.cut || "full"
    if (!CUTS.has(cut)) throw new Error(`${row.item_id}: cut must be one of ${[...CUTS].join(", ")}, got ${cut}`)
    const cutsBody = carriesBody(row.item_id) && (cut === "full" || cut === "skin")
    const basePath = cutsBody ? (row.base || bases[row.rig]) : undefined
    const { webp, width, height, rect, removed, full } = await cutFrontThumb(row.front, back, basePath,
      { match: cut === "skin" ? SKIN_CUT : {}, edgeClean: cut === "skin" || cut === "edge" })
    if (evidence) await writeEvidence(evidence, row.item_id, row.front, back, rect, removed, full)
    mkdirSync(join(FRONT_THUMBS_DIR, row.rig), { recursive: true })
    writeFileSync(join(FRONT_THUMBS_DIR, row.rig, `${row.item_id}.webp`), webp)
    const sources = [row.front, ...(back ? [back] : []), ...(basePath ? [basePath] : [])].map((p) => ({ file: basename(p), sha256: sha256(readFileSync(p)) }))
    next[row.rig] = { ...next[row.rig], [row.item_id]: { sha256: sha256(webp), size: [width, height], sources } }
    console.log(`${row.rig}/${row.item_id}: ${width}x${height}`)
  }
  const sorted = Object.fromEntries(Object.entries(next).map(([rig, items]) => [rig, Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)))]))
  writeFileSync(FRONT_THUMBS_PINS, `${JSON.stringify(sorted, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
