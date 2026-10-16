#!/usr/bin/env node
/**
 * Seeded residue cleanup for card thumbs whose cut still carries body residue (armpit skin, the arm outline strokes
 * beside a skirt, a bare shoulder, specks) that no colour or equality rule can remove without holing the fabric
 * (thumbs_1745 round 4). A person looks at the thumb at 3x and writes seed points ON the residue; this tool clears
 * alpha by a bounded flood fill from each seed, then drops islands under a few px. Remove-only: it never paints.
 *
 *     node tools/avatar25d/seed-clean-thumbs.mjs [--evidence <dir>]     (from the repository root)
 *
 * Input  tools/avatar25d/thumb-redraws/<rig>/<item>.seeds.json
 *          { "input": "<repo path of the thumb to clean>", "input_sha256": "...", "min_island_px": 8,
 *            "seeds": [{ "x", "y", "r", "dE", "thin"?, "minL"?, "note"? }],
 *            "regions"?: [{ "polygon": [[x, y], ...], "note"? }] }
 *        A region clears every visible pixel whose centre lies inside its polygon (pixel coordinates), for residue that
 *        has the same colour as the garment next to it and so cannot be told apart by a colour seed.
 *        A seed floods 4-connected from (x, y) over visible pixels within r px of it whose CIELAB colour is within dE of
 *        the seed pixel's. thin: only pixels outside the 5 px-thick body of the thumb (strokes, never the garment).
 *        minL: only pixels at least that light (keeps dark hair next to a light residue chunk).
 * Output tools/avatar25d/thumb-redraws/<rig>/<item>.webp (lossless), pinned by sha256 in bake-stills.mjs THUMB_REDRAWS.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const REDRAWS_DIR = join(ROOT, "tools/avatar25d/thumb-redraws")
const CORE_RADIUS = 2
const DEFAULT_MIN_ISLAND_PX = 8
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

const linear = (c) => { const v = c / 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92 }
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
/** sRGB (0-255) to CIELAB (D65). */
export function lab(r, g, b) {
  const [R, G, B] = [linear(r), linear(g), linear(b)]
  const x = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const y = labF(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** Pixels inside a (2k+1) square-thick region of the visible mask (binary opening): the garment body, not strokes. */
export function thickCore(visible, width, height, k = CORE_RADIUS) {
  const pass = (src, keep) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let all = true, any = false
      for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
        const nx = x + dx, ny = y + dy
        const v = nx >= 0 && ny >= 0 && nx < width && ny < height ? src[ny * width + nx] : 0
        if (v) any = true; else all = false
      }
      out[y * width + x] = keep === "all" ? (all ? 1 : 0) : (any ? 1 : 0)
    }
    return out
  }
  return pass(pass(visible, "all"), "any")
}

/** Even-odd test of a point against a polygon given as [[x, y], ...]. */
export function pointInPolygon(px, py, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Remove-only seeded cleanup of straight RGBA: returns { data, removed } (removed: 1 seed or region, 2 island). */
export function seedClean(rgba, width, height, seeds, minIslandPx = DEFAULT_MIN_ISLAND_PX, regions = []) {
  const n = width * height
  const out = Buffer.from(rgba)
  const visible = new Uint8Array(n)
  for (let p = 0; p < n; p++) visible[p] = rgba[p * 4 + 3] > 0 ? 1 : 0
  const core = thickCore(visible, width, height)
  const labs = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) labs.set(lab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]), p * 3)
  const removed = new Uint8Array(n)
  for (const seed of seeds) {
    const { x, y, r, dE } = seed
    const start = y * width + x
    if (x < 0 || y < 0 || x >= width || y >= height || !visible[start]) throw new Error(`seed (${x},${y}) is not on a visible pixel`)
    if (seed.thin && core[start]) throw new Error(`thin seed (${x},${y}) is inside the garment body`)
    const s = labs.subarray(start * 3, start * 3 + 3)
    const ok = (p) => {
      const px = p % width, py = (p - px) / width
      if (!visible[p] || removed[p] || (px - x) ** 2 + (py - y) ** 2 > r * r) return false
      if (seed.thin && core[p]) return false
      if (seed.minL !== undefined && labs[p * 3] < seed.minL) return false
      return Math.hypot(labs[p * 3] - s[0], labs[p * 3 + 1] - s[1], labs[p * 3 + 2] - s[2]) <= dE
    }
    const stack = [start]
    removed[start] = 1
    while (stack.length) {
      const p = stack.pop(), px = p % width
      for (const q of [px > 0 ? p - 1 : -1, px < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= n || !ok(q)) continue
        removed[q] = 1
        stack.push(q)
      }
    }
  }
  for (const { polygon } of regions) {
    if (!Array.isArray(polygon) || polygon.length < 3) throw new Error("a region needs a polygon of at least 3 points")
    for (let p = 0; p < n; p++) {
      const px = p % width
      if (visible[p] && pointInPolygon(px + 0.5, (p - px) / width + 0.5, polygon)) removed[p] = 1
    }
  }
  for (let p = 0; p < n; p++) if (removed[p]) out.fill(0, p * 4, p * 4 + 4)
  const seen = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    if (seen[p] || out[p * 4 + 3] === 0) continue
    const piece = [p], stack = [p]
    seen[p] = 1
    while (stack.length) {
      const c = stack.pop(), cx = c % width, cy = (c - cx) / width
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, q = ny * width + nx
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[q] || out[q * 4 + 3] === 0) continue
        seen[q] = 1; piece.push(q); stack.push(q)
      }
    }
    if (piece.length < minIslandPx) for (const q of piece) { out.fill(0, q * 4, q * 4 + 4); removed[q] = 2 }
  }
  return { data: out, removed }
}

async function cleanOne(rig, file, evidence) {
  const itemId = file.replace(/\.seeds\.json$/, "")
  const spec = JSON.parse(readFileSync(join(REDRAWS_DIR, rig, file), "utf8"))
  const input = readFileSync(join(ROOT, spec.input))
  if (sha256(input) !== spec.input_sha256) throw new Error(`${rig}/${itemId}: ${spec.input} differs from input_sha256`)
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data: clean, removed } = seedClean(data, info.width, info.height, spec.seeds, spec.min_island_px ?? DEFAULT_MIN_ISLAND_PX, spec.regions ?? [])
  const webp = await sharp(clean, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
  writeFileSync(join(REDRAWS_DIR, rig, `${itemId}.webp`), webp)
  if (evidence) {
    mkdirSync(evidence, { recursive: true })
    const marked = Buffer.from(data)
    for (let p = 0; p < removed.length; p++) if (removed[p]) marked.set(removed[p] === 1 ? [230, 0, 230, 255] : [255, 200, 0, 255], p * 4)
    await sharp(marked, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(join(evidence, `${itemId}__removed.png`))
  }
  const count = removed.reduce((a, v) => a + (v ? 1 : 0), 0)
  console.log(`${rig}/${itemId}: ${count} px cleared, sha256 ${sha256(webp)}`)
}

async function main() {
  const k = process.argv.indexOf("--evidence")
  const evidence = k >= 0 ? process.argv[k + 1] : undefined
  for (const rig of ["female", "male"]) {
    const dir = join(REDRAWS_DIR, rig)
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".seeds.json")).sort()) await cleanOne(rig, file, evidence)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
