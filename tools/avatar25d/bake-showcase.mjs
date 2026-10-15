#!/usr/bin/env node
/**
 * Bake the front (SHOWCASE) stills of the approved items into the app (phase 3, 3.2). Run by hand on a machine that
 * has the art Workbench, from the repository root, then run `bake-stills.mjs` and commit the output:
 *
 *     node tools/avatar25d/bake-showcase.mjs --src <Workbench showcase root> [--check-allowlist]
 *     node tools/avatar25d/bake-stills.mjs
 *
 * Only what `showcase-allowlist.json` lists is baked, and only when the source file still has the sha256 the list
 * approved. Items carry the factory's erase masks (`eraseFile`): the baker cuts each slot's region out of the base and
 * gives every item of that slot the body under it with its own mask applied (`under`), so any mix composes like the
 * factory compositor (hair back, base minus the erased regions, unders, shoes, bottom, top, hair front). A body or item that is not listed (or whose source changed) emits nothing, so its looks keep the 3/4
 * fallback. Nothing is read at app run time and nothing under a `*candidate/` path is accepted.
 *
 * Output
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/showcase/<key>.webp  base, one layer per item (+ hair back)
 * --pending-owner-approval also bakes bodies whose `ownerApproved` is false (a work branch, for the owner's look
 * review); showcase-baked.json records it and preview/production app builds refuse such a bake.
 *
 *   tools/avatar25d/showcase-baked.json  base canvas, ground, crop windows, item layers and file hashes; read by
 *                                        bake-stills.mjs, which writes the manifest and the asset table from it
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const ALLOWLIST = join(ROOT, "tools/avatar25d/showcase-allowlist.json")
const BAKED = join(ROOT, "tools/avatar25d/showcase-baked.json")
const STILLS = join(ROOT, "apps/mobile/src/features/avatar/stills")
/** Hand-finished showcase layers, pinned by sha256 in the allowlist: tools/avatar25d/showcase-redraws/<rig>/<key>.webp. */
const SHOWCASE_REDRAWS = join(ROOT, "tools/avatar25d/showcase-redraws")
const WEBP = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: false }
const CROPS = ["card", "head", "push"]
const RIGS = ["female", "male"]
const ERASED_SLOTS = ["shoes", "bottom", "top"]
/** The erase region an item's mask joins (cut out of the shared front base): its own slot. */
const ERASE_REGIONS_OF = { shoes: ["shoes"], bottom: ["bottom"], top: ["top"] }
/**
 * The regions an item's `under` refills. A one-piece dress is drawn instead of the top and the bottom, so its under
 * refills both of theirs, with its own mask applied there only: its mask never joins the shared regions, so adding a
 * dress cannot change the base or any top or bottom layer (review slots_1330 HIGH-1).
 */
const REFILL_REGIONS_OF = { ...ERASE_REGIONS_OF, dress: ["bottom", "top"] }
/** Output pixels each slot region reaches past its erase masks (body only, identical in base and under: no seam). */
const UNDER_OVERLAP_PX = 2
/** The slots a front layer can be worn as (the rig item's slot; slots_2140 DESIGN §7). */
const SHOWCASE_SLOTS = ["shoes", "bottom", "top", "hair", "dress", "glasses", "accessory"]

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const fail = (message) => {
  console.error(`bake-showcase: ${message}`)
  process.exit(1)
}

/** Validates the allowlist shape; throws a message naming the first problem. Pure, exported for the test. */
export function validateAllowlist(list, { allowPendingOwnerApproval = false } = {}) {
  if (!list || typeof list !== "object" || !list.bodies) throw new Error("allowlist has no bodies")
  if (!(list.scale > 0 && list.scale <= 1)) throw new Error("scale must be in (0, 1]")
  for (const [rig, body] of Object.entries(list.bodies)) {
    if (!RIGS.includes(rig)) throw new Error(`unknown body ${rig}`)
    for (const key of ["base", "baseSha256", "crops", "items"]) if (!body[key]) throw new Error(`${rig}: missing ${key}`)
    if (typeof body.qaPass !== "string" || body.qaPass.trim() === "") throw new Error(`${rig}: missing qaPass (path to the fresh-QA PASS record)`)
    const pending = body.ownerApproved === false && allowPendingOwnerApproval
    if (body.ownerApproved !== true && !pending) throw new Error(`${rig}: ownerApproved must be true (the owner has approved the look)`)
    for (const crop of ["head", "push"]) if (!Array.isArray(body.crops[crop]) || body.crops[crop].length !== 4) throw new Error(`${rig}: crop ${crop} needs [x, y, w, h]`)
    for (const [id, item] of Object.entries(body.items)) {
      for (const key of ["slot", "file", "sha256", "order"]) if (item[key] === undefined) throw new Error(`${rig}.${id}: missing ${key}`)
      if (!SHOWCASE_SLOTS.includes(item.slot)) throw new Error(`${rig}.${id}: unknown slot ${item.slot}`)
      if (item.backFile && !item.backSha256) throw new Error(`${rig}.${id}: backFile needs backSha256`)
      for (const key of ["frontRedrawSha256", "backRedrawSha256"]) if (item[key] !== undefined && !/^[0-9a-f]{64}$/.test(item[key])) throw new Error(`${rig}.${id}: ${key} must be a sha256`)
      if (item.backRedrawSha256 && !item.backFile) throw new Error(`${rig}.${id}: backRedrawSha256 needs backFile`)
      if (item.eraseFile && !item.eraseSha256) throw new Error(`${rig}.${id}: eraseFile needs eraseSha256`)
      if (item.eraseFile && !REFILL_REGIONS_OF[item.slot]) throw new Error(`${rig}.${id}: only shoes, bottoms, tops and dresses erase the body`)
      if ([item.file, item.backFile, item.eraseFile].some((path) => /candidate/i.test(path ?? ""))) throw new Error(`${rig}.${id}: a candidate path cannot enter the app`)
    }
    if (/candidate/i.test(body.base)) throw new Error(`${rig}: a candidate path cannot enter the app`)
  }
}

async function loadRgba(path, expectedSha256) {
  const bytes = readFileSync(path)
  if (sha256(bytes) !== expectedSha256) throw new Error(`${path} is not the approved still (sha256 differs)`)
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** A grey erase mask (255 = the body is erased there) as an RGBA buffer [v, v, v, 255], so it scales like a layer. */
async function loadMask(path, expectedSha256) {
  const bytes = readFileSync(path)
  if (sha256(bytes) !== expectedSha256) throw new Error(`${path} is not the approved mask (sha256 differs)`)
  const { data, info } = await sharp(bytes).removeAlpha().toColourspace("b-w").raw().toBuffer({ resolveWithObject: true })
  const rgba = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) {
    const v = data[i * info.channels]
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255
  }
  return { data: rgba, width: info.width, height: info.height }
}

/** The base with a mask's erase applied to its alpha (straight alpha, as the factory compositor does). */
function erased(base, mask) {
  const data = Buffer.from(base.data)
  for (let i = 0; i < base.width * base.height; i++) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (1 - mask.data[i * 4] / 255))
  return { data, width: base.width, height: base.height }
}

/** Tight pixel rect [x, y, w, h] of every pixel with any alpha, or null when empty. */
export function alphaRect(rgba, width, height) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1]
}

/** The source-pixel box that holds every layer and every crop window, padded and snapped to whole output pixels. */
export function sourceCanvas(sources, crops, scale, pad) {
  const step = Math.round(1 / scale)
  const rects = [...sources.map((s) => alphaRect(s.data, s.width, s.height)), ...crops].filter(Boolean)
  const x0 = Math.min(...rects.map((r) => r[0])) - pad, y0 = Math.min(...rects.map((r) => r[1])) - pad
  const x1 = Math.max(...rects.map((r) => r[0] + r[2])) + pad, y1 = Math.max(...rects.map((r) => r[1] + r[3])) + pad
  const left = Math.max(0, Math.floor(x0 / step) * step), top = Math.max(0, Math.floor(y0 / step) * step)
  return { left, top, width: Math.ceil((x1 - left) / step) * step, height: Math.ceil((y1 - top) / step) * step }
}

async function scaledLayer(source, canvas, scale) {
  const width = Math.round(canvas.width * scale), height = Math.round(canvas.height * scale)
  const width0 = Math.min(canvas.width, source.width - canvas.left), height0 = Math.min(canvas.height, source.height - canvas.top)
  const raw = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 4 } })
    .extract({ left: canvas.left, top: canvas.top, width: width0, height: height0 })
    .resize(width, height, { kernel: "lanczos3" }).raw().toBuffer()
  return { raw, width, height }
}

async function encodeLayer(key, source, canvas, scale, keepWholeCanvas) {
  return encodeRaw(key, await scaledLayer(source, canvas, scale), keepWholeCanvas)
}

async function encodeRaw(key, { raw, width, height }, keepWholeCanvas) {
  const rect = keepWholeCanvas ? [0, 0, width, height] : alphaRect(raw, width, height)
  if (!rect) throw new Error(`${key} is empty`)
  const bytes = await sharp(raw, { raw: { width, height, channels: 4 } })
    .extract({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }).webp(WEBP).toBuffer()
  return { key, rect, bytes }
}

/** Pixels set in `mask` grown by `px` (square), limited to `allowed`. */
function dilate(mask, width, height, px, allowed) {
  const out = new Uint8Array(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      for (let dy = -px; dy <= px; dy++) {
        for (let dx = -px; dx <= px; dx++) {
          const xx = x + dx, yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < width && yy < height && allowed[yy * width + xx]) out[yy * width + xx] = 1
        }
      }
    }
  }
  return out
}

/**
 * Splits the output canvas into one region per erasing slot (every pixel any of its items erases; a pixel two slots
 * erase goes to the first of shoes, bottom, top) and the rest. Pure, exported for the test.
 * Returns { claimed: {slot: Uint8Array}, regions: {slot: Uint8Array} }: `claimed` is cut out of the base, `regions`
 * is `claimed` grown by UNDER_OVERLAP_PX into unclaimed pixels (the base there is drawn twice, identically).
 */
export function slotRegions(scaledMasks, width, height) {
  const taken = new Uint8Array(width * height)
  const claimed = {}
  for (const slot of ERASED_SLOTS) {
    const masks = scaledMasks[slot] ?? []
    if (masks.length === 0) continue
    const own = new Uint8Array(width * height)
    for (const mask of masks) {
      for (let i = 0; i < width * height; i++) if (mask[i * 4] > 0 && !taken[i]) own[i] = 1
    }
    for (let i = 0; i < width * height; i++) if (own[i]) taken[i] = 1
    claimed[slot] = own
  }
  const free = taken.map((v) => (v ? 0 : 1))
  const regions = {}
  for (const [slot, own] of Object.entries(claimed)) regions[slot] = dilate(own, width, height, UNDER_OVERLAP_PX, free)
  return { claimed, regions }
}

/** The union of region masks: undefined for none, the one mask itself for one (so a slot's own region is unchanged). */
function unionOf(masks) {
  if (masks.length <= 1) return masks[0]
  return masks[0].map((_, i) => (masks.some((mask) => mask[i]) ? 1 : 0))
}

/**
 * A dress erases only inside the top and bottom regions its under refills. Body it would erase elsewhere would stay
 * on the shared base, so the bake stops: the factory must widen the top or bottom erase masks instead.
 */
function assertErasesInside(id, scaledErase, baseRaw, region) {
  for (let i = 0; i < baseRaw.length / 4; i++) {
    if (scaledErase[i * 4] > 0 && baseRaw[i * 4 + 3] > 0 && !region?.[i]) {
      throw new Error(`${id}: its erase mask reaches body outside the top and bottom erase regions (widen their masks)`)
    }
  }
}

/** Keeps the pixels of `raw` inside `mask` (the rest become transparent). */
function keepOnly(raw, mask, invert = false) {
  const out = Buffer.from(raw)
  for (let i = 0; i < mask.length; i++) if (Boolean(mask[i]) === invert) out.writeUInt32LE(0, i * 4)
  return out
}

function windowInCanvas(window, canvas, scale) {
  const [x, y, w, h] = window
  return [Math.round((x - canvas.left) * scale), Math.round((y - canvas.top) * scale), Math.round(w * scale), Math.round(h * scale)]
}

/**
 * Swaps a baked layer's bytes for its pinned hand-finished version (a cleanup done on the layer itself, after the
 * bake, with no full-size source to re-bake from). The source still fixes the layer's rect; the redraw must have the
 * same size and the exact pinned bytes, or the bake stops.
 */
async function withRedraw(rig, layer, pin, redrawRoot) {
  if (!pin) return layer
  const bytes = readFileSync(join(redrawRoot, rig, `${layer.key}.webp`))
  if (sha256(bytes) !== pin) throw new Error(`${layer.key}: the redrawn layer differs from its pin in the allowlist`)
  const { width, height } = await sharp(bytes).metadata()
  if (width !== layer.rect[2] || height !== layer.rect[3]) throw new Error(`${layer.key}: the redrawn layer is ${width}x${height}, the baked rect is ${layer.rect[2]}x${layer.rect[3]}`)
  return { ...layer, bytes }
}

/** One body: the base, every allowlisted item's layer (and hair back), the windows. Returns manifest data + files. */
export async function bakeBody(rig, body, scale, pad, srcRoot, redrawRoot = SHOWCASE_REDRAWS) {
  const at = (relative) => join(srcRoot, relative)
  const base = await loadRgba(at(body.base), body.baseSha256)
  const items = []
  for (const [id, item] of Object.entries(body.items)) {
    const front = await loadRgba(at(item.file), item.sha256)
    const back = item.backFile ? await loadRgba(at(item.backFile), item.backSha256) : null
    const erase = item.eraseFile ? await loadMask(at(item.eraseFile), item.eraseSha256) : null
    items.push({ id, item, front, back, erase })
  }
  const sources = [base, ...items.flatMap((entry) => [entry.front, entry.back].filter(Boolean))]
  const baseRect = alphaRect(base.data, base.width, base.height)
  const cropWindows = [body.crops.head, body.crops.push]
  const canvas = sourceCanvas(sources, cropWindows, scale, pad)
  const outWidth = Math.round(canvas.width * scale), outHeight = Math.round(canvas.height * scale)
  const files = new Map()
  const scaledMasks = {}
  for (const entry of items.filter((e) => e.erase)) {
    entry.scaledErase = (await scaledLayer(entry.erase, canvas, scale)).raw
    for (const slot of ERASE_REGIONS_OF[entry.item.slot] ?? []) scaledMasks[slot] = [...(scaledMasks[slot] ?? []), entry.scaledErase]
  }
  const { claimed, regions } = slotRegions(scaledMasks, outWidth, outHeight)
  const anyClaimed = new Uint8Array(outWidth * outHeight)
  for (const own of Object.values(claimed)) own.forEach((v, i) => { if (v) anyClaimed[i] = 1 })
  const scaledBase = await scaledLayer(base, canvas, scale)
  const baseLayer = await encodeRaw("base__front", { ...scaledBase, raw: keepOnly(scaledBase.raw, anyClaimed, true) }, true)
  files.set(baseLayer.key, baseLayer.bytes)
  const baked = {}
  for (const { id, item, front, back, erase, scaledErase } of items) {
    const frontLayer = await withRedraw(rig, await encodeLayer(`${id}__front`, front, canvas, scale, false), item.frontRedrawSha256, redrawRoot)
    files.set(frontLayer.key, frontLayer.bytes)
    const entry = { key: frontLayer.key, rect: frontLayer.rect, order: item.order, slot: item.slot, ...(item.tucked === true ? { tucked: true } : {}) }
    if (back) {
      const backLayer = await withRedraw(rig, await encodeLayer(`${id}__back`, back, canvas, scale, false), item.backRedrawSha256, redrawRoot)
      files.set(backLayer.key, backLayer.bytes)
      entry.back = { key: backLayer.key, rect: backLayer.rect }
    }
    const region = unionOf((REFILL_REGIONS_OF[item.slot] ?? []).map((slot) => regions[slot]).filter(Boolean))
    if (scaledErase && !ERASE_REGIONS_OF[item.slot]) assertErasesInside(id, scaledErase, scaledBase.raw, region)
    if (region) {
      const body = erase ? erased(base, erase) : base
      const scaledBody = await scaledLayer(body, canvas, scale)
      const underLayer = await encodeRaw(`${id}__under`, { ...scaledBody, raw: keepOnly(scaledBody.raw, region) }, false)
      files.set(underLayer.key, underLayer.bytes)
      entry.under = { key: underLayer.key, rect: underLayer.rect }
    }
    baked[id] = entry
  }
  const showcaseBase = {
    key: baseLayer.key,
    canvas: { width: outWidth, height: outHeight },
    ground: [Math.round(((baseRect[0] + baseRect[2] / 2) - canvas.left) * scale), Math.round(((baseRect[1] + baseRect[3]) - canvas.top) * scale)],
    windows: {
      card: [0, 0, outWidth, outHeight],
      head: windowInCanvas(body.crops.head, canvas, scale),
      push: windowInCanvas(body.crops.push, canvas, scale)
    },
    ...(Object.keys(regions).length > 0 ? { underSlots: ERASED_SLOTS.filter((slot) => regions[slot]) } : {})
  }
  for (const crop of CROPS) {
    const [x, y, w, h] = showcaseBase.windows[crop]
    if (x < 0 || y < 0 || x + w > outWidth || y + h > outHeight) throw new Error(`${rig}: crop ${crop} leaves the canvas`)
  }
  return { showcaseBase, items: baked, files }
}

export async function main(argv) {
  const srcIndex = argv.indexOf("--src")
  const list = JSON.parse(readFileSync(ALLOWLIST, "utf8"))
  validateAllowlist(list, { allowPendingOwnerApproval: argv.includes("--pending-owner-approval") })
  if (srcIndex < 0 || !argv[srcIndex + 1]) fail("pass --src <the Workbench showcase root> (the folder the allowlist paths are relative to)")
  const srcRoot = resolve(argv[srcIndex + 1])
  const out = { bakerVersion: 1, scale: list.scale, bodies: {} }
  const written = new Map()
  for (const [rig, body] of Object.entries(list.bodies)) {
    const baked = await bakeBody(rig, body, list.scale, list.pad ?? 24, srcRoot).catch((error) => fail(`${rig}: ${error.message}`))
    const hashes = {}
    for (const [key, bytes] of baked.files) {
      hashes[key] = sha256(bytes)
      written.set(join(STILLS, "layers", rig, "showcase", `${key}.webp`), bytes)
    }
    out.bodies[rig] = { ownerApproved: body.ownerApproved === true, showcaseBase: baked.showcaseBase, items: baked.items, files: hashes }
    console.log(`${rig}: ${baked.files.size} layers, canvas ${baked.showcaseBase.canvas.width}x${baked.showcaseBase.canvas.height}, ${[...baked.files.values()].reduce((s, b) => s + b.length, 0)} bytes`)
  }
  for (const rig of RIGS) rmSync(join(STILLS, "layers", rig, "showcase"), { recursive: true, force: true })
  for (const [path, bytes] of written) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  }
  writeFileSync(BAKED, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`wrote ${written.size} showcase files; run tools/avatar25d/bake-stills.mjs next`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
