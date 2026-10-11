#!/usr/bin/env node
/**
 * Bake the front (SHOWCASE) stills of the approved items into the app (phase 3, 3.2). Run by hand on a machine that
 * has the art Workbench, from the repository root, then run `bake-stills.mjs` and commit the output:
 *
 *     node tools/avatar25d/bake-showcase.mjs --src <Workbench showcase root> [--check-allowlist]
 *     node tools/avatar25d/bake-stills.mjs
 *
 * Only what `showcase-allowlist.json` lists is baked, and only when the source file still has the sha256 the list
 * approved. A body or item that is not listed (or whose source changed) emits nothing, so its looks keep the 3/4
 * fallback. Nothing is read at app run time and nothing under a `*candidate/` path is accepted.
 *
 * Output
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/showcase/<key>.webp  base, one layer per item (+ hair back)
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
const WEBP = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: false }
const CROPS = ["card", "head", "push"]
const RIGS = ["female", "male"]

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const fail = (message) => {
  console.error(`bake-showcase: ${message}`)
  process.exit(1)
}

/** Validates the allowlist shape; throws a message naming the first problem. Pure, exported for the test. */
export function validateAllowlist(list) {
  if (!list || typeof list !== "object" || !list.bodies) throw new Error("allowlist has no bodies")
  if (!(list.scale > 0 && list.scale <= 1)) throw new Error("scale must be in (0, 1]")
  for (const [rig, body] of Object.entries(list.bodies)) {
    if (!RIGS.includes(rig)) throw new Error(`unknown body ${rig}`)
    for (const key of ["base", "baseSha256", "crops", "items"]) if (!body[key]) throw new Error(`${rig}: missing ${key}`)
    if (typeof body.qaPass !== "string" || body.qaPass.trim() === "") throw new Error(`${rig}: missing qaPass (path to the fresh-QA PASS record)`)
    if (body.ownerApproved !== true) throw new Error(`${rig}: ownerApproved must be true (the owner has approved the look)`)
    for (const crop of ["head", "push"]) if (!Array.isArray(body.crops[crop]) || body.crops[crop].length !== 4) throw new Error(`${rig}: crop ${crop} needs [x, y, w, h]`)
    for (const [id, item] of Object.entries(body.items)) {
      for (const key of ["slot", "file", "sha256", "order"]) if (item[key] === undefined) throw new Error(`${rig}.${id}: missing ${key}`)
      if (item.backFile && !item.backSha256) throw new Error(`${rig}.${id}: backFile needs backSha256`)
      if (/candidate/i.test(item.file) || /candidate/i.test(item.backFile ?? "")) throw new Error(`${rig}.${id}: a candidate path cannot enter the app`)
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
  const { raw, width, height } = await scaledLayer(source, canvas, scale)
  const rect = keepWholeCanvas ? [0, 0, width, height] : alphaRect(raw, width, height)
  if (!rect) throw new Error(`${key} is empty`)
  const bytes = await sharp(raw, { raw: { width, height, channels: 4 } })
    .extract({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }).webp(WEBP).toBuffer()
  return { key, rect, bytes }
}

function windowInCanvas(window, canvas, scale) {
  const [x, y, w, h] = window
  return [Math.round((x - canvas.left) * scale), Math.round((y - canvas.top) * scale), Math.round(w * scale), Math.round(h * scale)]
}

/** One body: the base, every allowlisted item's layer (and hair back), the windows. Returns manifest data + files. */
export async function bakeBody(rig, body, scale, pad, srcRoot) {
  const at = (relative) => join(srcRoot, relative)
  const base = await loadRgba(at(body.base), body.baseSha256)
  const items = []
  for (const [id, item] of Object.entries(body.items)) {
    const front = await loadRgba(at(item.file), item.sha256)
    const back = item.backFile ? await loadRgba(at(item.backFile), item.backSha256) : null
    items.push({ id, item, front, back })
  }
  const sources = [base, ...items.flatMap((entry) => [entry.front, entry.back].filter(Boolean))]
  const baseRect = alphaRect(base.data, base.width, base.height)
  const cropWindows = [body.crops.head, body.crops.push]
  const canvas = sourceCanvas(sources, cropWindows, scale, pad)
  const outWidth = Math.round(canvas.width * scale), outHeight = Math.round(canvas.height * scale)
  const files = new Map()
  const baseLayer = await encodeLayer("base__front", base, canvas, scale, true)
  files.set(baseLayer.key, baseLayer.bytes)
  const baked = {}
  for (const { id, item, front, back } of items) {
    const frontLayer = await encodeLayer(`${id}__front`, front, canvas, scale, false)
    files.set(frontLayer.key, frontLayer.bytes)
    const entry = { key: frontLayer.key, rect: frontLayer.rect, order: item.order, slot: item.slot, ...(item.tucked === true ? { tucked: true } : {}) }
    if (back) {
      const backLayer = await encodeLayer(`${id}__back`, back, canvas, scale, false)
      files.set(backLayer.key, backLayer.bytes)
      entry.back = { key: backLayer.key, rect: backLayer.rect }
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
    }
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
  validateAllowlist(list)
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
    out.bodies[rig] = { showcaseBase: baked.showcaseBase, items: baked.items, files: hashes }
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
