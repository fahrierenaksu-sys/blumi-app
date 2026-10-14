#!/usr/bin/env node
/**
 * Bake the 2.5D avatar stills from the committed rigs (plan 2.2, L13). Run by hand after any rig export, from the
 * repository root, and commit the output:
 *
 *     node tools/avatar25d/bake-stills.mjs [--check]
 *
 * For each body: front view, unmirrored, pose `stand` at time 0 (eyes open, breath 0), drawn exactly as the live
 * renderer draws frame 0: the same draw entries and painter's order (`avatar25StandEntries`, shared with
 * `compileAvatar`), the same skinning palette (`writeAvatarPalette`), unorm8 weights, premultiplied bilinear page
 * samples and the per-sample alpha test at 0.5, here at 2x2 samples per sheet pixel (the live canvas uses 4x MSAA).
 *
 * Output
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/full/<key>.webp   one layer per (owner, order[, leg variant])
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/bust/<key>.webp   the same layers in the 256 px bust window
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/thumb/<item>.webp the item alone, cropped, at most 256 px
 *   apps/mobile/src/features/avatar/stills/stillAssets.ts                 literal require table (Metro, asset scan)
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/showcase/<key>.webp front (showcase) layers, carried over from
 *                                                                          bake-showcase.mjs (verified by sha256)
 *   packages/domain/src/avatar/avatarStillManifest.json                   layers, rects, windows, rigSha256, and the
 *                                                                          showcaseBase / item showcase layers
 * --check: bake into memory and fail if anything on disk differs (nothing is written).
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { tsImport } from "tsx/esm/api"

export const BAKER_VERSION = 1
const SS = 2
const BUST_PX = 256
const THUMB_MAX_PX = 256
const ALPHA_TEST = 0.5
const STILL_LIFT_TOLERANCE_PX = 2
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const AVATAR = join(ROOT, "apps/mobile/src/features/avatar")
const STILLS = join(AVATAR, "stills")
const MANIFEST = join(ROOT, "packages/domain/src/avatar/avatarStillManifest.json")
const SHOWCASE_BAKED = join(ROOT, "tools/avatar25d/showcase-baked.json")
const RIG_DIRS = { female: "girl", male: "boy" }
// worn order of the live renderer (resolveAvatarDraw): the four slots, then a dress, glasses, accessories (appended, so
// the seq of every existing layer is unchanged)
const SLOT_RANK = { shoes: 0, bottom: 1, top: 2, hair: 3, dress: 4, glasses: 5, accessory: 6 }
const CHECK = process.argv.includes("--check")
const option = (flag) => { const k = process.argv.indexOf(flag); return k >= 0 ? process.argv[k + 1] : undefined }
/** --rig <rigId>=<dir> --out <dir>: bake one rig from outside the repo (a factory wardrobe) for QA, nothing committed. */
const EXTERNAL = option("--rig")?.split("=")
const OUT_DIR = option("--out")
if (EXTERNAL && (!OUT_DIR || !RIG_DIRS[EXTERNAL[0]] || !EXTERNAL[1])) throw new Error("usage: --rig <female|male>=<rig dir> --out <dir>")

const pose = await tsImport(join(AVATAR, "renderer/avatar25Pose.ts"), import.meta.url)
const art = await tsImport(join(AVATAR, "model/avatarItemArt.ts"), import.meta.url)

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** sha256 over the rig files a front still is drawn from (rig25.json, then each front page, by name). */
export function rigSha256(rigDir, rig) {
  const hash = createHash("sha256")
  for (const name of ["rig25.json", ...rig.views.front.pages]) {
    hash.update(`${name}\n`)
    hash.update(readFileSync(join(rigDir, name)))
  }
  return hash.digest("hex")
}

async function loadPage(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // premultiplied on upload, as the live renderer does
  const px = new Float32Array(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3] / 255
    px[i * 4] = (data[i * 4] / 255) * a
    px[i * 4 + 1] = (data[i * 4 + 1] / 255) * a
    px[i * 4 + 2] = (data[i * 4 + 2] / 255) * a
    px[i * 4 + 3] = a
  }
  return { w: info.width, h: info.height, px }
}

/** Bilinear, clamp-to-edge, premultiplied (mip 0: a still at sheet size magnifies the half-size pages). */
function sample(page, u, v, out) {
  const x = u * page.w - 0.5, y = v * page.h - 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const cx = (i) => Math.min(page.w - 1, Math.max(0, i)), cy = (i) => Math.min(page.h - 1, Math.max(0, i))
  const a = (cy(y0) * page.w + cx(x0)) * 4, b = (cy(y0) * page.w + cx(x0 + 1)) * 4
  const c = (cy(y0 + 1) * page.w + cx(x0)) * 4, d = (cy(y0 + 1) * page.w + cx(x0 + 1)) * 4
  for (let k = 0; k < 4; k++) {
    const top = page.px[a + k] * (1 - fx) + page.px[b + k] * fx
    const bottom = page.px[c + k] * (1 - fx) + page.px[d + k] * fx
    out[k] = top * (1 - fy) + bottom * fy
  }
}

/** Skinned sheet positions of every vertex of a mesh at the stand pose (the vertex shader, unorm8 weights). */
function skinMesh(mesh, palette, ground) {
  const n = mesh.pos.length / 2
  const out = new Float64Array(n * 2)
  const S = pose.PALETTE_STRIDE
  for (let i = 0; i < n; i++) {
    const px = mesh.pos[i * 2] - ground[0], py = -(mesh.pos[i * 2 + 1] - ground[1])
    const w = [0, 1, 2, 3].map((k) => Math.round(mesh.weights[i * 4 + k] * 255))
    w[0] += 255 - w.reduce((s, x) => s + x, 0)
    let qx = 0, qy = 0
    for (let k = 0; k < 4; k++) {
      if (w[k] === 0) continue
      const o = mesh.joints[i * 4 + k] * S
      qx += (palette[o] * px + palette[o + 1] * py + palette[o + 2]) * (w[k] / 255)
      qy += (palette[o + 4] * px + palette[o + 5] * py + palette[o + 6]) * (w[k] / 255)
    }
    out[i * 2] = qx + ground[0]
    out[i * 2 + 1] = ground[1] - qy
  }
  return out
}

/**
 * Rasterises triangles into a sample buffer (straight rgb + coverage per sample), later ones overwrite. `mask` (a
 * composed leg, avatar25Pose legPlan): { mesh, vertexOffset } of the shoes' leg drawing; a sample is drawn only where
 * that drawing passes the same alpha test at the same vertex weights (the GPU shader's AND).
 */
function rasterise(buffer, canvas, mesh, skinned, index, pages, mask = null) {
  const m = [0, 0, 0, 0]
  const W = canvas.width * SS, H = canvas.height * SS
  const c = [0, 0, 0, 0]
  for (let t = 0; t + 2 < index.length; t += 3) {
    const ia = index[t], ib = index[t + 1], ic = index[t + 2]
    const ax = (skinned[ia * 2] - canvas.x) * SS, ay = (skinned[ia * 2 + 1] - canvas.y) * SS
    const bx = (skinned[ib * 2] - canvas.x) * SS, by = (skinned[ib * 2 + 1] - canvas.y) * SS
    const cx = (skinned[ic * 2] - canvas.x) * SS, cy = (skinned[ic * 2 + 1] - canvas.y) * SS
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(area) < 1e-12) continue
    const page = pages[mesh.page[ia]] // flat: the provoking (first) vertex
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5
      for (let x = x0; x <= x1; x++) {
        const sx = x + 0.5
        let w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) / area
        let w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) / area
        let w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const u = w0 * mesh.uv[ia * 2] + w1 * mesh.uv[ib * 2] + w2 * mesh.uv[ic * 2]
        const v = w0 * mesh.uv[ia * 2 + 1] + w1 * mesh.uv[ib * 2 + 1] + w2 * mesh.uv[ic * 2 + 1]
        sample(page, u, v, c)
        if (c[3] < ALPHA_TEST) continue
        if (mask) {
          const ma = ia + mask.vertexOffset, mb = ib + mask.vertexOffset, mc = ic + mask.vertexOffset
          const mu = w0 * mask.mesh.uv[ma * 2] + w1 * mask.mesh.uv[mb * 2] + w2 * mask.mesh.uv[mc * 2]
          const mv = w0 * mask.mesh.uv[ma * 2 + 1] + w1 * mask.mesh.uv[mb * 2 + 1] + w2 * mask.mesh.uv[mc * 2 + 1]
          sample(pages[mask.mesh.page[ma]], mu, mv, m)
          if (m[3] < ALPHA_TEST) continue
        }
        const o = (y * W + x) * 4
        buffer[o] = c[0] / c[3]
        buffer[o + 1] = c[1] / c[3]
        buffer[o + 2] = c[2] / c[3]
        buffer[o + 3] = 1
      }
    }
  }
}

/** The rasteriser's mask for an entry's composed leg (avatar25StandEntries `legMask`), else null. */
const maskOf = (legMask, meshOf) => (legMask ? { mesh: meshOf(legMask.owner), vertexOffset: legMask.vertexOffset } : null)

/** Box-filters the samples to sheet pixels: straight RGBA8 + the tight pixel rect (null when empty). */
function resolveSamples(buffer, canvas) {
  const W = canvas.width * SS
  const rgba = Buffer.alloc(canvas.width * canvas.height * 4)
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const o = ((y * SS + j) * W + x * SS + i) * 4
          r += buffer[o]; g += buffer[o + 1]; b += buffer[o + 2]; a += buffer[o + 3]
        }
      }
      if (a === 0) continue
      const o = (y * canvas.width + x) * 4
      rgba[o] = Math.round((r / a) * 255)
      rgba[o + 1] = Math.round((g / a) * 255)
      rgba[o + 2] = Math.round((b / a) * 255)
      rgba[o + 3] = Math.round((a / (SS * SS)) * 255)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { rgba, rect: maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1] }
}

function crop(rgba, canvas, rect) {
  const [x0, y0, w, h] = rect
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) rgba.copy(out, y * w * 4, ((y0 + y) * canvas.width + x0) * 4, ((y0 + y) * canvas.width + x0 + w) * 4)
  return out
}

/** Straight-alpha "over" of layers (each { rgba, rect } in canvas px) into a canvas-sized straight RGBA buffer. */
function composite(layers, canvas) {
  const acc = new Float64Array(canvas.width * canvas.height * 4)
  for (const { rgba } of layers) {
    for (let i = 0; i < canvas.width * canvas.height; i++) {
      const a = rgba[i * 4 + 3] / 255
      if (a === 0) continue
      for (let k = 0; k < 3; k++) acc[i * 4 + k] = (rgba[i * 4 + k] / 255) * a + acc[i * 4 + k] * (1 - a)
      acc[i * 4 + 3] = a + acc[i * 4 + 3] * (1 - a)
    }
  }
  const out = Buffer.alloc(canvas.width * canvas.height * 4)
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    const a = acc[i * 4 + 3]
    if (a === 0) continue
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round((acc[i * 4 + k] / a) * 255)
    out[i * 4 + 3] = Math.round(a * 255)
  }
  return out
}

const webp = (raw, w, h) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
const orderTag = (order) => `o${String(order).replace(".", "p")}`
const layerKey = (owner, order, legVariant, gatedBy) =>
  `${owner}__${orderTag(order)}${legVariant ? `__${legVariant.replace("+", "-")}` : ""}${gatedBy ? `__cut-by__${gatedBy}` : ""}`
/** The shared sheet of a bottom's composed legs on one leg layer (every shoes' cell, stacked). */
const sheetKey = (owner, order) => `${owner}__${orderTag(order)}__bottom-cut`
const SHEET_GAP = 2

/** The layer key of a stand entry: body bands, item parts, item leg drawings and composed (cut) legs. */
function entryKey(entry, canonicalOf) {
  const owner = entry.owner === "body" ? "body" : canonicalOf[entry.owner]
  return layerKey(owner, entry.order, entry.legVariant, entry.legMask ? canonicalOf[entry.legMask.owner] : undefined)
}

/**
 * Every stand layer a body can show, enumerated per item so any wardrobe bakes: the body with nothing worn, every
 * item part with everything worn (neither depends on what else is worn), each bottom's and each shoes' own leg drawing
 * worn alone, and for each (bottom, shoes) pair what the live renderer draws (avatar25Legs.legPlan): the legacy pair
 * drawing, or the bottom's drawing cut by exactly those shoes.
 */
function standLayers(rig, rigItemIds, canonicalOf) {
  const view = rig.views.front
  const ofSlot = (slot) => rigItemIds.filter((id) => view.items[id].slot === slot)
  const groups = new Map()
  const add = (worn, keep) => {
    for (const entry of pose.avatar25StandEntries(rig, "front", worn)) {
      if (!keep(entry)) continue
      const owner = entry.owner === "body" ? "body" : canonicalOf[entry.owner]
      const key = entryKey(entry, canonicalOf)
      const rank = entry.owner === "body" ? 0 : (SLOT_RANK[view.items[entry.owner].slot] + 1) * 1000
      const group = groups.get(key) ?? {
        key, owner, rigItemId: entry.owner === "body" ? null : entry.owner,
        slot: entry.owner === "body" ? "body" : view.items[entry.owner].slot,
        order: entry.order, seq: Infinity, legVariant: entry.legVariant, leg: entry.leg, index: new Set(), triangles: [],
        gatedBy: entry.legMask ? canonicalOf[entry.legMask.owner] : undefined
      }
      // seq: the live tie-break is monotone in (worn slot, range); a stable rank keeps it for any worn subset
      const localSeq = rank + entryRangeIndex(rig, entry)
      group.seq = Math.min(group.seq, localSeq)
      const sig = `${entry.owner}:${entry.index[0]}:${entry.index.length}`
      if (!group.index.has(sig)) {
        group.index.add(sig)
        group.triangles.push({ meshOwner: entry.owner, index: entry.index, seq: localSeq, legMask: entry.legMask })
      }
      groups.set(key, group)
    }
  }
  add([], () => true)
  add(rigItemIds, (entry) => entry.owner !== "body" && entry.legVariant === undefined)
  const bottoms = ofSlot("bottom"), shoes = ofSlot("shoes")
  for (const id of [...bottoms, ...shoes]) add([id], (entry) => entry.legVariant !== undefined)
  for (const bottom of bottoms) for (const pair of shoes) add([pair, bottom], (entry) => entry.legVariant !== undefined)
  return [...groups.values()].sort((a, b) => a.order - b.order || a.seq - b.seq)
}

/**
 * Packs a bottom's composed legs into one sheet per leg layer (cells stacked, a transparent gap between them), so
 * the file count grows with bottoms, not with bottoms x shoes. Writes the sheets; returns each cell's source by key.
 */
async function packCutSheets(cut, rigId, files) {
  const sheets = new Map(), sources = new Map()
  for (const cell of cut) {
    const key = sheetKey(cell.entry.owner, cell.entry.order)
    sheets.set(key, [...(sheets.get(key) ?? []), cell])
  }
  for (const [key, cells] of sheets) {
    const width = Math.max(...cells.map((c) => c.entry.rect[2]))
    const height = cells.reduce((h, c) => h + c.entry.rect[3], 0) + SHEET_GAP * (cells.length - 1)
    const sheet = Buffer.alloc(width * height * 4)
    let y = 0
    for (const cell of cells) {
      const [, , w, h] = cell.entry.rect
      for (let row = 0; row < h; row++) cell.pixels.copy(sheet, ((y + row) * width) * 4, row * w * 4, (row + 1) * w * 4)
      sources.set(cell.entry.key, { key, rect: [0, y, w, h], sheet: [width, height] })
      y += h + SHEET_GAP
    }
    files.set(`layers/${rigId}/full/${key}.webp`, await webp(sheet, width, height))
  }
  return sources
}

function entryRangeIndex(rig, entry) {
  const mesh = entry.owner === "body" ? rig.views.front.mesh : rig.views.front.items[entry.owner].mesh
  const at = mesh.ranges.findIndex((r) => mesh.index.slice(r.start, r.start + r.count).join() === entry.index.join())
  if (at < 0) throw new Error(`range not found for ${entry.owner} order ${entry.order}`)
  return at
}

function windowsFor(view) {
  const head = (name) => view.bones.find((b) => b.name === name)?.head
  const [chest, neck, hips] = [head("chest"), head("neck"), head("hips")]
  if (!chest || !neck || !hips) throw new Error("rig lacks chest/neck/hips bones")
  const h = view.height, top = view.ground[1] - h * 1.04
  const bustBottom = chest[1] + h * 0.06, bustSide = bustBottom - top
  const halfBottom = hips[1] + h * 0.05, halfH = halfBottom - top
  const fullH = view.ground[1] + h * 0.02 - top
  const round = (r) => r.map((x) => Math.round(x))
  return {
    bust: round([neck[0] - bustSide / 2, top, bustSide, bustSide]),
    half: round([neck[0] - halfH * 0.375, top, halfH * 0.75, halfH]),
    full: round([view.ground[0] - fullH * 0.31, top, fullH * 0.62, fullH])
  }
}

async function bakeBody(rigId, rigDir, files) {
  const rig = JSON.parse(readFileSync(join(rigDir, "rig25.json"), "utf8"))
  const view = rig.views.front
  // a rig outside the repo (--rig, factory QA) names its items by their rig ids
  const artMap = EXTERNAL ? Object.fromEntries(Object.keys(view.items).map((id) => [id, id])) : art.AVATAR_ITEM_ART[rigId]
  // --worn a,b,c (with --rig): the look the one-pass evidence draws, else nothing worn
  const starter = EXTERNAL
    ? Object.fromEntries((option("--worn")?.split(",") ?? []).map((id) => [view.items[id].slot, id]))
    : art.AVATAR_RIG_STARTER[rigId]
  const canonicalOf = Object.fromEntries(Object.entries(artMap).map(([canonical, rigItem]) => [rigItem, canonical]))
  const rigItemIds = Object.keys(canonicalOf).filter((id) => view.items[id]).sort((a, b) => SLOT_RANK[view.items[a].slot] - SLOT_RANK[view.items[b].slot])
  // stills are drawn at lift 0: a sole lift up to STILL_LIFT_TOLERANCE_PX sheet px (under 1 bust px) is not visible
  for (const id of rigItemIds) if (Math.abs(view.items[id].lift ?? 0) > STILL_LIFT_TOLERANCE_PX) throw new Error(`${id} has a sole lift: stills need a lift offset first`)

  // the stand pose at time 0: eyes open, breath 0; must equal the reduced-motion pose (the still never moves)
  const compiled = pose.compileView("front", view)
  const palette = new Float32Array(Math.max(64, compiled.slotCount) * pose.PALETTE_STRIDE)
  const still = new Float32Array(palette.length)
  const clip = new Float32Array(2)
  const input = { pose: "stand", time: 0, walkCycles: 0, walkWeight: 0, waveTime: 0, reduceMotion: false, breathWeight: 0 }
  pose.writeAvatarPalette(compiled, input, palette, clip)
  pose.writeAvatarPalette(compiled, { ...input, reduceMotion: true }, still)
  if (palette.some((x, i) => Math.abs(x - still[i]) > 1e-6)) throw new Error(`${rigId}: frame 0 differs from the still pose`)
  if (clip[0] > -1e8 || clip[1] > -1e8) throw new Error(`${rigId}: the stand pose clips an arm`)

  const pages = await Promise.all(view.pages.map((name) => loadPage(join(rigDir, name))))
  const meshOf = (owner) => (owner === "body" ? view.mesh : view.items[owner].mesh)
  const skinned = new Map(["body", ...rigItemIds].map((owner) => [owner, skinMesh(meshOf(owner), palette, view.ground)]))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of skinned.values()) for (let i = 0; i < s.length; i += 2) {
    minX = Math.min(minX, s[i]); maxX = Math.max(maxX, s[i]); minY = Math.min(minY, s[i + 1]); maxY = Math.max(maxY, s[i + 1])
  }
  // the canvas holds every vertex and every crop window, so a window never needs clamping
  const windows = windowsFor(view)
  for (const [x, y, w, h] of Object.values(windows)) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h)
  }
  const canvas = { x: Math.floor(minX) - 2, y: Math.floor(minY) - 2 }
  canvas.width = Math.ceil(maxX) + 2 - canvas.x
  canvas.height = Math.ceil(maxY) + 2 - canvas.y

  const layers = standLayers(rig, rigItemIds, canonicalOf)
  const toCanvas = (r) => [r[0] - canvas.x, r[1] - canvas.y, r[2], r[3]]
  const bustWin = toCanvas(windows.bust)
  const rendered = []
  const drawn = [], bust = [], cut = []
  for (const layer of layers) {
    const buffer = new Float32Array(canvas.width * SS * canvas.height * SS * 4)
    for (const tri of layer.triangles.sort((a, b) => a.seq - b.seq)) rasterise(buffer, canvas, meshOf(tri.meshOwner), skinned.get(tri.meshOwner), tri.index, pages, maskOf(tri.legMask, meshOf))
    const { rgba, rect } = resolveSamples(buffer, canvas)
    if (!rect) continue
    rendered.push({ layer, rgba, rect })
    const entry = { key: layer.key, owner: layer.owner, slot: layer.slot, order: layer.order, seq: layer.seq, rect,
      ...(layer.leg ? { leg: layer.leg } : {}), ...(layer.legVariant !== undefined ? { legVariant: layer.legVariant } : {}),
      ...(layer.gatedBy ? { gatedBy: layer.gatedBy } : {}) }
    drawn.push(entry)
    if (layer.gatedBy) {
      // a composed leg is a cell of its bottom's sheet; legs never reach the bust window
      cut.push({ entry, pixels: crop(rgba, canvas, rect) })
      if (rect[1] < bustWin[1] + bustWin[3]) throw new Error(`${rigId}: a composed leg reaches the bust window`)
      continue
    }
    files.set(`layers/${rigId}/full/${layer.key}.webp`, await webp(crop(rgba, canvas, rect), rect[2], rect[3]))
    // bust: the layer inside the bust window, scaled to 256 px; kept only when something of it is in the window
    const bust256 = await sharp(rgba, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
      .extract({ left: bustWin[0], top: bustWin[1], width: bustWin[2], height: bustWin[3] }).resize(BUST_PX, BUST_PX, { kernel: "lanczos3" }).raw().toBuffer()
    const bustRect = alphaRect(bust256, BUST_PX, BUST_PX)
    if (!bustRect) continue
    bust.push({ ...entry, rect: bustRect })
    files.set(`layers/${rigId}/bust/${layer.key}.webp`, await webp(crop(bust256, { width: BUST_PX }, bustRect), bustRect[2], bustRect[3]))
  }
  const sources = await packCutSheets(cut, rigId, files)
  const full = drawn.map((entry) => (sources.has(entry.key) ? { ...entry, source: sources.get(entry.key) } : entry))
  // thumbs: each item alone (its own parts, never the bare legs it draws for a worn set), cropped, max 256 px
  const items = {}
  for (const rigItemId of rigItemIds) {
    const canonical = canonicalOf[rigItemId]
    const own = rendered.filter((r) => r.layer.rigItemId === rigItemId && r.layer.legVariant === undefined)
    const alone = composite(own, canvas)
    const rect = alphaRect(alone, canvas.width, canvas.height)
    const scale = Math.min(1, THUMB_MAX_PX / Math.max(rect[2], rect[3]))
    const thumb = await sharp(crop(alone, canvas, rect), { raw: { width: rect[2], height: rect[3], channels: 4 } })
      .resize(Math.max(1, Math.round(rect[2] * scale)), Math.max(1, Math.round(rect[3] * scale)), { kernel: "lanczos3" })
      .webp({ lossless: true, effort: 6 }).toBuffer()
    files.set(`layers/${rigId}/thumb/${canonical}.webp`, thumb)
    items[canonical] = { slot: view.items[rigItemId].slot, rigItemId, thumb: canonical }
  }
  const evidence = await seamEvidence(rigId, rig, starter, artMap, rigItemIds, canonicalOf, rendered, canvas, meshOf, skinned, pages)
  return {
    manifest: {
      rigSha256: rigSha256(rigDir, rig),
      sheetHeight: view.height,
      canvas: { width: canvas.width, height: canvas.height },
      ground: [view.ground[0] - canvas.x, view.ground[1] - canvas.y],
      windows: { bust: bustWin, half: toCanvas(windows.half), full: toCanvas(windows.full) },
      bustPx: BUST_PX,
      starter,
      items,
      layers: { full, bust }
    },
    evidence
  }
}

function alphaRect(rgba, w, h) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] === 0) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1]
}

/**
 * The starter outfit drawn in one pass (every sample overwritten in painter's order, as the GPU does) against the
 * stacked layers: the difference is only where two layers' soft edges meet (a still composites coverage).
 */
async function seamEvidence(rigId, rig, starter, artMap, rigItemIds, canonicalOf, rendered, canvas, meshOf, skinned, pages) {
  const starterIds = Object.values(starter).map((id) => artMap[id])
  const worn = rigItemIds.filter((id) => starterIds.includes(id))
  const buffer = new Float32Array(canvas.width * SS * canvas.height * SS * 4)
  const entries = pose.avatar25StandEntries(rig, "front", worn)
  for (const entry of entries) rasterise(buffer, canvas, meshOf(entry.owner), skinned.get(entry.owner), entry.index, pages, maskOf(entry.legMask, meshOf))
  const single = resolveSamples(buffer, canvas).rgba
  // the layers of exactly the ranges the live renderer draws for this worn set
  const drawnKeys = new Set(entries.map((entry) => entryKey(entry, canonicalOf)))
  const stack = rendered.filter(({ layer }) => drawnKeys.has(layer.key))
  const stacked = composite(stack, canvas)
  let maxDiff = 0, sum = 0, over8 = 0
  for (let i = 0; i < single.length; i++) {
    const d = Math.abs(single[i] - stacked[i])
    maxDiff = Math.max(maxDiff, d); sum += d
    if (d > 8) over8++
  }
  return { rigId, worn: worn.map((id) => canonicalOf[id]), layers: stack.length, maxDiff, meanDiff: sum / single.length, channelsOver8: over8,
    single: await sharp(single, { raw: { width: canvas.width, height: canvas.height, channels: 4 } }).png().toBuffer(),
    stacked: await sharp(stacked, { raw: { width: canvas.width, height: canvas.height, channels: 4 } }).png().toBuffer() }
}

function stillAssetsSource(keys) {
  const lines = ["/* Generated by tools/avatar25d/bake-stills.mjs. Do not edit. */", "/** Bundled still layers by `<rig>/<product>/<key>` (literal requires: Metro and the asset scan need them). */",
    "export const AVATAR_STILL_ASSETS: Readonly<Record<string, number>> = {"]
  for (const key of keys) lines.push(`  "${key}": require("./layers/${key}.webp"),`)
  lines.push("}", "")
  return lines.join("\n")
}

/** The front (showcase) bake of bake-showcase.mjs, merged in as data: its files are read from disk and verified. */
function mergeShowcase(rigId, body, files) {
  const baked = existsSync(SHOWCASE_BAKED) ? JSON.parse(readFileSync(SHOWCASE_BAKED, "utf8")).bodies?.[rigId] : undefined
  if (!baked) return body
  const items = { ...body.items }
  for (const [id, layer] of Object.entries(baked.items)) {
    if (!items[id] || items[id].slot !== layer.slot) throw new Error(`${rigId}: showcase layer for ${id}, which has no rig art in that slot`)
    const { slot: _slot, ...front } = layer
    items[id] = { ...items[id], showcase: front }
  }
  for (const [key, hash] of Object.entries(baked.files)) {
    const path = join(STILLS, "layers", rigId, "showcase", `${key}.webp`)
    if (!existsSync(path) || sha256(readFileSync(path)) !== hash) throw new Error(`${rigId}: showcase file ${key} is missing or differs from showcase-baked.json (run bake-showcase.mjs)`)
    files.set(`layers/${rigId}/showcase/${key}.webp`, readFileSync(path))
  }
  return { ...body, items, showcaseBase: baked.showcaseBase }
}

const files = new Map()
const manifest = { bakerVersion: BAKER_VERSION, supersample: SS, bodies: {} }
const evidence = []
const rigSources = EXTERNAL ? [[EXTERNAL[0], resolve(EXTERNAL[1])]] : Object.entries(RIG_DIRS).map(([rigId, dir]) => [rigId, join(AVATAR, "rigs", dir)])
for (const [rigId, rigDir] of rigSources) {
  const baked = await bakeBody(rigId, rigDir, files)
  manifest.bodies[rigId] = EXTERNAL ? baked.manifest : mergeShowcase(rigId, baked.manifest, files)
  evidence.push(baked.evidence)
}
if (EXTERNAL) {
  for (const [path, bytes] of files) {
    mkdirSync(dirname(join(OUT_DIR, path)), { recursive: true })
    writeFileSync(join(OUT_DIR, path), bytes)
  }
  writeFileSync(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${files.size} layers to ${OUT_DIR}`)
} else {
  writeRepoOutputs()
}

/** The committed outputs: written, or (--check) compared byte for byte. */
function writeRepoOutputs() {
  const keys = [...files.keys()].map((path) => path.replace(/^layers\//, "").replace(/\.webp$/, "")).sort()
  const outputs = new Map([...files.entries()].map(([path, bytes]) => [join(STILLS, path), bytes]))
  outputs.set(join(STILLS, "stillAssets.ts"), Buffer.from(stillAssetsSource(keys)))
  outputs.set(MANIFEST, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))

  if (CHECK) {
    const stale = [...outputs.entries()].filter(([path, bytes]) => !existsSync(path) || sha256(readFileSync(path)) !== sha256(bytes)).map(([path]) => path)
    const onDisk = existsSync(join(STILLS, "layers")) ? listFiles(join(STILLS, "layers")) : []
    const extra = onDisk.filter((path) => !outputs.has(path))
    if (stale.length || extra.length) {
      console.error(`stills are stale: ${stale.length} differ, ${extra.length} extra\n${[...stale, ...extra].join("\n")}`)
      process.exit(1)
    }
    console.log(`stills up to date (${outputs.size} files)`)
  } else {
    rmSync(join(STILLS, "layers"), { recursive: true, force: true })
    for (const [path, bytes] of outputs) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytes)
    }
    console.log(`wrote ${outputs.size} files (${files.size} layers)`)
  }
}
const evidenceDir = process.env.BAKE_STILLS_EVIDENCE
for (const e of evidence) {
  console.log(`${e.rigId}: starter ${e.worn.join(", ")}; ${e.layers} layers stacked vs one pass: max ${e.maxDiff}, mean ${e.meanDiff.toFixed(4)}, channels > 8: ${e.channelsOver8}`)
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, `${e.rigId}_single_pass.png`), e.single)
    writeFileSync(join(evidenceDir, `${e.rigId}_stacked_layers.png`), e.stacked)
  }
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])
}
