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
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/thumb/<item>.webp the item alone, cropped, at most 256 px,
 *                                                                          without the body art its pages carry (see
 *                                                                          withoutBodyArt: face, ears, neck, hands)
 *   apps/mobile/src/features/avatar/stills/stillAssets.ts                 literal require table (Metro, asset scan)
 *   apps/mobile/src/features/avatar/stills/layers/<rig>/showcase/<key>.webp front (showcase) layers, carried over from
 *                                                                          bake-showcase.mjs (verified by sha256)
 *   packages/domain/src/avatar/avatarStillManifest.json                   layers, rects, windows, rigSha256, and the
 *                                                                          showcaseBase / item showcase layers
 *
 * Body drawings owned by items (avatar25BodySwap: the black trousers' torso and arms, a crop top's bare belly): the
 * body layers they can replace carry `part`, each item's drawing is its own layer (`bodyPart`, `bodyWith` for a pair)
 * baked as the item draws it when it wins, and each item lists its claims (`replaces`), so the still resolver
 * (domain avatarStills) hides and shows exactly the layers the live renderer does.
 * --check: bake into memory and fail if anything on disk differs (nothing is written).
 * BAKE_STILLS_EVIDENCE=<dir>: also write the seam evidence and, per item thumb, before/after/body/stages PNGs.
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { tsImport } from "tsx/esm/api"
import { cleanThumb } from "./thumb-clean.mjs"

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
const bodyTag = (bodyPart, bodyWith) => (bodyPart ? `__body-${bodyPart}${bodyWith ? `-with-${bodyWith}` : ""}` : "")
const layerKey = (owner, order, legVariant, gatedBy, bodyPart, bodyWith) =>
  `${owner}__${orderTag(order)}${legVariant ? `__${legVariant.replace("+", "-")}` : ""}${gatedBy ? `__cut-by__${gatedBy}` : ""}${bodyTag(bodyPart, bodyWith)}`
/** The shared sheet of a bottom's composed legs on one leg layer (every shoes' cell, stacked). */
const sheetKey = (owner, order) => `${owner}__${orderTag(order)}__bottom-cut`
const SHEET_GAP = 2

/** The layer key of a stand entry: body bands, item parts, item leg drawings, composed (cut) legs, item body drawings. */
function entryKey(entry, canonicalOf) {
  const owner = entry.owner === "body" ? "body" : canonicalOf[entry.owner]
  return layerKey(owner, entry.order, entry.legVariant, entry.legMask ? canonicalOf[entry.legMask.owner] : undefined,
    entry.bodyPart, entry.bodyWith ? canonicalOf[entry.bodyWith] : undefined)
}

/** An item's body drawings (export_rig.py body_replacements): its ranges that draw a body range instead of the body's. */
const bodyClaims = (view, id) => view.items[id].mesh.ranges.filter((r) => r.bodyPart !== undefined)

/**
 * Every stand layer a body can show, enumerated per item so any wardrobe bakes: the body with nothing worn, every
 * item part with everything worn (neither depends on what else is worn), each bottom's and each shoes' own leg drawing
 * worn alone, and for each (bottom, shoes) pair what the live renderer draws (avatar25Legs.legPlan): the legacy pair
 * drawing, or the bottom's drawing cut by exactly those shoes.
 */
function standLayers(rig, rigItemIds, canonicalOf) {
  const view = rig.views.front
  // body ranges a worn item can draw instead of the body's: their body layers are tagged with the range (`part`)
  const replaceable = new Set(rigItemIds.flatMap((id) => bodyClaims(view, id).map((r) => r.bodyPart)))
  const ofSlot = (slot) => rigItemIds.filter((id) => view.items[id].slot === slot)
  const groups = new Map()
  const add = (worn, keep) => {
    for (const entry of pose.avatar25StandEntries(rig, "front", worn)) {
      if (!keep(entry)) continue
      const owner = entry.owner === "body" ? "body" : canonicalOf[entry.owner]
      const key = entryKey(entry, canonicalOf)
      const rank = entry.owner === "body" ? 0 : (SLOT_RANK[view.items[entry.owner].slot] + 1) * 1000
      const part = entry.owner === "body" && replaceable.has(entry.name) ? entry.name : undefined
      const group = groups.get(key) ?? {
        key, owner, rigItemId: entry.owner === "body" ? null : entry.owner,
        slot: entry.owner === "body" ? "body" : view.items[entry.owner].slot,
        order: entry.order, seq: Infinity, legVariant: entry.legVariant, leg: entry.leg, index: new Set(), triangles: [],
        gatedBy: entry.legMask ? canonicalOf[entry.legMask.owner] : undefined,
        part, bodyPart: entry.bodyPart, bodyWith: entry.bodyWith ? canonicalOf[entry.bodyWith] : undefined
      }
      // a replaceable body range must be a layer of its own, or hiding it would hide the other range too
      if (group.part !== part || (part !== undefined && group.triangles.length > 0 && group.triangles[0].index.join() !== entry.index.join())) {
        throw new Error(`stills: body layer ${key} mixes a replaceable range (${group.part ?? part}) with another range`)
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
  add(rigItemIds, (entry) => entry.owner !== "body" && entry.legVariant === undefined && entry.bodyPart === undefined)
  const bottoms = ofSlot("bottom"), shoes = ofSlot("shoes")
  for (const id of [...bottoms, ...shoes]) add([id], (entry) => entry.legVariant !== undefined)
  for (const bottom of bottoms) for (const pair of shoes) add([pair, bottom], (entry) => entry.legVariant !== undefined)
  // each item's body drawings, as drawn while it wins them: worn alone, or with its pair partner (one with art)
  for (const id of rigItemIds) {
    for (const partner of new Set(bodyClaims(view, id).map((r) => r.bodyWith))) {
      if (partner !== undefined && !canonicalOf[partner]) continue
      add(partner === undefined ? [id] : [id, partner], (entry) => entry.owner === id && entry.bodyPart !== undefined && entry.bodyWith === partner)
    }
  }
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
      ...(layer.gatedBy ? { gatedBy: layer.gatedBy } : {}), ...(layer.part ? { part: layer.part } : {}),
      ...(layer.bodyPart ? { bodyPart: layer.bodyPart } : {}), ...(layer.bodyWith ? { bodyWith: layer.bodyWith } : {}) }
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
  // thumbs: each item alone (its own parts, never the bare legs or body it draws for a worn set), cropped, max 256 px
  const items = {}
  // the body as drawn with nothing worn: the rig's own skin, face and ears at the stand pose, the reference an item
  // thumb is cleaned against (an item's art may carry the body it was cut from: hands in cuffs, neck, face under hair)
  const bodySkin = bodySkinOf(rendered, canvas)
  const debugThumbs = process.env.BAKE_STILLS_EVIDENCE ? [] : null
  for (const rigItemId of rigItemIds) {
    const canonical = canonicalOf[rigItemId]
    const own = rendered.filter((r) => r.layer.rigItemId === rigItemId && r.layer.legVariant === undefined && r.layer.bodyPart === undefined)
    const withBody = composite(own, canvas)
    const { rgba: alone, removed } = THUMB_KEEPS_BODY_ART.has(canonical)
      ? { rgba: withBody, removed: new Uint8Array(canvas.width * canvas.height) }
      : withoutBodyArt(withBody, bodySkin, canvas)
    if (debugThumbs) debugThumbs.push({ canonical, withBody, alone, removed })
    const rect = alphaRect(alone, canvas.width, canvas.height)
    const scale = Math.min(1, THUMB_MAX_PX / Math.max(rect[2], rect[3]))
    const thumbW = Math.max(1, Math.round(rect[2] * scale)), thumbH = Math.max(1, Math.round(rect[3] * scale))
    const resized = await sharp(crop(alone, canvas, rect), { raw: { width: rect[2], height: rect[3], channels: 4 } })
      .resize(thumbW, thumbH, { kernel: "lanczos3" }).raw().toBuffer()
    const edgeClean = THUMB_EDGE_CLEAN[canonical]
    const finished = edgeClean ? cleanThumb(resized, thumbW, thumbH, edgeClean).rgba : resized
    const baked = await sharp(finished, { raw: { width: thumbW, height: thumbH, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
    const thumb = redrawnThumb(rigId, canonical) ?? baked
    files.set(`layers/${rigId}/thumb/${canonical}.webp`, thumb)
    // every body range it draws instead of the body's, in any pose: the resolver picks winners from these, as live
    const claims = [...new Map(bodyClaims(view, rigItemId)
      .filter((r) => r.bodyWith === undefined || canonicalOf[r.bodyWith])
      .map((r) => [`${r.bodyPart}|${r.bodyWith ?? ""}`, { part: r.bodyPart, ...(r.bodyWith ? { with: canonicalOf[r.bodyWith] } : {}) }])).values()]
    items[canonical] = { slot: view.items[rigItemId].slot, rigItemId, thumb: canonical, ...(claims.length > 0 ? { replaces: claims } : {}) }
  }
  const evidence = await seamEvidence(rigId, rig, starter, artMap, rigItemIds, canonicalOf, rendered, canvas, meshOf, skinned, pages)
  if (debugThumbs) await writeThumbEvidence(rigId, debugThumbs, bodySkin, canvas)
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

/** Card thumbs that get the edge cleaner (thumb-clean.mjs: part seams, skin flecks on the outline, opt-in heel-collar
 *  spurs), each checked at 2x in artclean_1635. Scoped per item because published thumbs are hash-locked: an entry here
 *  changes that item's thumb bytes. `flecks: false` where the item's own light colours sit inside the skin model. */
const SHOE_COLLAR = { spurs: true }
const THUMB_EDGE_CLEAN = {
  avatar_v2_top_male_white_basic_tee: {}, avatar_v2_top_male_black_basic_tee: {}, avatar_v2_top_male_navy_knit_polo: {},
  avatar_v2_top_black_cute_crop_top: {}, avatar_v2_top_white_cute_crop_top: {}, avatar_v2_shoes_white_clean_sneakers: {},
  avatar_v2_shoes_male_black_clean_sneakers: SHOE_COLLAR, avatar_v2_shoes_male_black_everyday_sneakers: SHOE_COLLAR,
  avatar_v2_shoes_male_brown_loafers: SHOE_COLLAR, avatar_v2_shoes_male_cream_chunky_sneakers: { spurs: true, flecks: false },
  avatar_v2_shoes_male_dark_leather_sneakers: SHOE_COLLAR, avatar_v2_shoes_male_green_skate_shoes: SHOE_COLLAR,
  avatar_v2_shoes_male_sand_desert_boots: SHOE_COLLAR, avatar_v2_shoes_male_tan_loafers: SHOE_COLLAR
}

/** Card thumbs whose rig art lacks a part, redrawn by hand and pinned by sha256 in tools/avatar25d/thumb-redraws/<rig>/.
 *  The redraw replaces the baked thumb only while its bytes match the pin, so a changed file fails the bake loudly.
 *  white sneakers: the rig art has no closed heel, the redraw adds the heel counter and pink lining (gptfin_1615 t2 r1). */
const THUMB_REDRAWS = {
  female: { avatar_v2_shoes_white_clean_sneakers: "6b2e11f3e5bba4a1efc29e596877d3d938db4bf01a028307d11784b983064765" }
}
function redrawnThumb(rigId, canonical) {
  const pin = THUMB_REDRAWS[rigId]?.[canonical]
  if (!pin) return undefined
  const bytes = readFileSync(join(ROOT, "tools/avatar25d/thumb-redraws", rigId, `${canonical}.webp`))
  if (sha256(bytes) !== pin) throw new Error(`${rigId}/${canonical}: the redrawn thumb differs from its pin in bake-stills.mjs`)
  return bytes
}

/** Items whose thumb is not cleaned: their own colour lies inside the body's skin model, so withoutBodyArt cuts holes
 *  into the item itself (honey pigtails lose crown and tail strands). Their art carries no eye, ear or hand fragments
 *  (checked 2026-10-14, rc_beta4_1530). Remove an entry once the cleaner can tell such an item from skin. */
const THUMB_KEEPS_BODY_ART = new Set(["hair_girl_pigtails"])

/** Body layers that are skin and face only: far arm, far leg, near leg, head, near arm (stand orders 0, 1, 2, 4, 5). */
const BODY_SKIN_ORDERS = new Set([0, 1, 2, 4, 5])
/** The head layer (stand order 4): the only body art with eyes, brows and ears. */
const BODY_HEAD_ORDER = 4
/** How far (sheet px) an item's carried body art may sit from the body's own drawing. */
const BODY_MATCH_RADIUS = 4
/** CIELAB tolerances at which an item pixel still is the body's own colour (a*: redness, tight, so cream, white and
 *  grey fabric over skin never match it). */
const BODY_MATCH_TOLERANCE = [14, 5, 9]
/** The body's skin colour model: these percentiles of its skin layers' CIELAB lightness, hue angle and chroma. */
const SKIN_MODEL_PERCENTILES = { lightness: [0.02, 1], hue: [0.01, 0.99], chroma: [0.01, 0.99] }
/** How deep inside the item's outline (px) a removal may start, and how many px of dark rim go with it. */
const SEED_DEPTH = 3
const RIM_STEPS = 3
/** A removed pixel comes back when its colour (CIELAB bin of GARMENT_BIN) is more common in the garment's core (the
 *  kept item deeper than GARMENT_CORE_DEPTH px, at least GARMENT_BIN_MIN_SHARE of it) than in the body's skin. */
const GARMENT_CORE_DEPTH = 4
const GARMENT_BIN = 4
const GARMENT_BIN_MIN_SHARE = 0.0005
/** A piece left after removal smaller than this share of the item's largest piece is a body fragment (a pair of
 *  shoes is two large pieces). */
const ISLAND_MAX_SHARE = 0.05

/** sRGB (0..255) to CIELAB (D65). */
function lab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** CIELAB per pixel of a straight RGBA buffer. */
function labOf(rgba, n) {
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) out.set(lab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]), i * 3)
  return out
}

/**
 * The body drawn with nothing worn, in CIELAB, its skin colour model (percentiles of its skin layers) and where it
 * shows skin (face, ears, neck, shoulders, arms, hands, legs, feet): the skin layers, plus the torso layer's pixels in
 * the skin model (never the white vest or the grey shorts).
 */
function bodySkinOf(rendered, canvas) {
  const bodyLayers = rendered.filter((r) => r.layer.owner === "body" && r.layer.legVariant === undefined && !r.layer.gatedBy)
  const n = canvas.width * canvas.height
  const body = composite(bodyLayers, canvas)
  const skinLayers = composite(bodyLayers.filter((r) => BODY_SKIN_ORDERS.has(r.layer.order)), canvas)
  // the order of the body layer seen at each pixel (layers are drawn in order: legs and far arm go under the torso)
  const seenOrder = new Float32Array(n).fill(-1)
  for (const { layer, rgba } of [...bodyLayers].sort((a, b) => a.layer.order - b.layer.order)) {
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] >= 128) seenOrder[i] = layer.order
  }
  const bodyLab = labOf(body, n)
  const skinLab = labOf(skinLayers, n)
  const samples = { lightness: [], hue: [], chroma: [] }
  const skinBins = { bins: new Map(), count: 0 }
  for (let i = 0; i < n; i++) {
    if (skinLayers[i * 4 + 3] !== 255) continue
    const key = labBin(skinLayers, i)
    skinBins.bins.set(key, (skinBins.bins.get(key) ?? 0) + 1)
    skinBins.count++
    const [L, A, B] = skinLab.subarray(i * 3, i * 3 + 3)
    samples.lightness.push(L)
    samples.hue.push(hueOf(A, B))
    samples.chroma.push(Math.hypot(A, B))
  }
  const range = (values, [lo, hi]) => {
    const sorted = values.sort((a, b) => a - b)
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
    return [at(lo), at(hi)]
  }
  const model = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, range(v, SKIN_MODEL_PERCENTILES[k])]))
  if (process.env.BAKE_STILLS_EVIDENCE) console.log(`skin model ${JSON.stringify(model, (_, x) => (typeof x === "number" ? Math.round(x * 10) / 10 : x))}`)
  // skin: 1 = skin, 2 = the head (face features may be matched there by the body's own colour)
  const skin = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (seenOrder[i] === BODY_HEAD_ORDER) skin[i] = 2
    else if (BODY_SKIN_ORDERS.has(seenOrder[i])) skin[i] = 1
    else if (seenOrder[i] >= 0 && isSkinColour(bodyLab.subarray(i * 3, i * 3 + 3), model)) skin[i] = 1
  }
  return { body, bodyLab, skin, model, skinBins }
}

const isSkinColour = ([L, A, B], model) =>
  within(L, model.lightness) && within(hueOf(A, B), model.hue) && within(Math.hypot(A, B), model.chroma)
const hueOf = (a, b) => (Math.atan2(b, a) * 180) / Math.PI
const within = (x, [lo, hi]) => x >= lo && x <= hi

/**
 * An item thumb without the body art its own pages carry. Each item was cut from a dressed render, so its art can
 * hold the face under a fringe, an ear, a neck in a collar or hands in cuffs, always at the item's outline. A pixel is
 * the body's when it lies on (or within BODY_MATCH_RADIUS of) the body's skin and either has the body's skin colour
 * (its colour model) or, on the head, shows the colour the body itself draws nearby (eyes, brows, ears). The removal
 * starts within SEED_DEPTH px of the outline (a patch of skin is ringed by its own dark line) or at an outline pixel
 * of skin colour off the body (matting fringe), and grows through such pixels only, so garment shading inside the
 * outline stays; then the dark rim of each removed patch goes (RIM_STEPS px of skin hue, at any lightness and
 * saturation). Removed pixels in the garment's own colours come back, and fragments the removal cut off go.
 */
function withoutBodyArt(item, bodySkin, canvas) {
  const { width: W, height: H } = canvas
  const n = W * H
  const { isBody, isRim, isSkinColour } = bodyArtTest(item, bodySkin, canvas)
  const depth = outlineDepth(item, canvas, SEED_DEPTH)
  const removed = new Uint8Array(n)
  const queue = []
  // seeds: body art near the outline, and the outline's own skin-coloured matting fringe (skin the art was cut from)
  for (let p = 0; p < n; p++) {
    if ((depth[p] <= SEED_DEPTH && isBody(p)) || (depth[p] === 1 && isSkinColour(p))) { removed[p] = 1; queue.push(p) }
  }
  for (let k = 0; k < queue.length; k++) {
    eachNeighbour(queue[k], W, H, (q) => { if (!removed[q] && item[q * 4 + 3] > 0 && isBody(q)) { removed[q] = 1; queue.push(q) } })
  }
  let rim = queue
  for (let step = 0; step < RIM_STEPS; step++) {
    const next = []
    for (const p of rim) eachNeighbour(p, W, H, (q) => { if (!removed[q] && item[q * 4 + 3] > 0 && isRim(q)) { removed[q] = 2; next.push(q) } })
    rim = next
  }
  const out = Buffer.from(item)
  for (let p = 0; p < n; p++) if (removed[p]) out.fill(0, p * 4, p * 4 + 4)
  return { rgba: withoutIslands(restoreGarmentColours(item, out, removed, bodySkin.skinBins, canvas), canvas), removed }
}

const labBin = (rgba, p) => {
  const [L, A, B] = lab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2])
  return `${Math.round(L / GARMENT_BIN)},${Math.round(A / GARMENT_BIN)},${Math.round(B / GARMENT_BIN)}`
}

/**
 * Gives back each removed pixel whose colour is more the garment's than the body's: its CIELAB bin is more common in
 * the garment's core (the kept item deeper than GARMENT_CORE_DEPTH px) than in the body's skin layers, and holds at
 * least GARMENT_BIN_MIN_SHARE of that core. A tan suede shoe, a taupe knit, a salmon sleeve or a light brown strand
 * where it touches skin comes back; skin carried by the art (face, ears, necks, hands) stays out.
 */
function restoreGarmentColours(item, kept, removed, skinBins, canvas) {
  const n = canvas.width * canvas.height
  const depth = outlineDepth(kept, canvas, GARMENT_CORE_DEPTH)
  const core = new Map()
  let coreCount = 0
  for (let p = 0; p < n; p++) {
    if (depth[p] <= GARMENT_CORE_DEPTH) continue
    const key = labBin(kept, p)
    core.set(key, (core.get(key) ?? 0) + 1)
    coreCount++
  }
  const out = Buffer.from(kept)
  for (let p = 0; p < n; p++) {
    if (!removed[p]) continue
    const key = labBin(item, p)
    const garment = (core.get(key) ?? 0) / Math.max(1, coreCount)
    if (garment >= GARMENT_BIN_MIN_SHARE && garment > (skinBins.bins.get(key) ?? 0) / skinBins.count) item.copy(out, p * 4, p * 4, p * 4 + 4)
  }
  return out
}

function eachNeighbour(p, W, H, visit) {
  const x = p % W, y = (p - x) / W
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const u = x + dx, v = y + dy
    if ((dx || dy) && u >= 0 && v >= 0 && u < W && v < H) visit(v * W + u)
  }
}

/** Steps (8-connected) from each opaque pixel to the nearest transparent one, counted up to `max` (else max + 1). */
function outlineDepth(rgba, { width: W, height: H }, max) {
  const depth = new Uint8Array(W * H).fill(max + 1)
  let front = []
  for (let p = 0; p < W * H; p++) if (rgba[p * 4 + 3] === 0) { depth[p] = 0; front.push(p) }
  for (let d = 1; d <= max; d++) {
    const next = []
    for (const p of front) eachNeighbour(p, W, H, (q) => { if (depth[q] > d) { depth[q] = d; next.push(q) } })
    front = next
  }
  return depth
}

const BODY = 1, RIM = 2, SKIN_COLOUR = 4
/** Per-pixel tests (memoised): `isBody` (see withoutBodyArt), `isRim` (on skin, skin hue and chroma) and
 *  `isSkinColour` (the skin model, anywhere). */
function bodyArtTest(item, { bodyLab, skin, model }, { width: W, height: H }) {
  const R = BODY_MATCH_RADIUS
  const [tL, tA, tB] = BODY_MATCH_TOLERANCE
  const memo = new Int8Array(W * H).fill(-1)
  const classify = (p) => {
    const colour = lab(item[p * 4], item[p * 4 + 1], item[p * 4 + 2])
    const [L, A, B] = colour
    const x = p % W, y = (p - x) / W
    let onSkin = false, matched = false
    for (let dy = -R; dy <= R && !matched; dy++) for (let dx = -R; dx <= R && !matched; dx++) {
      const u = x + dx, v = y + dy
      if (u < 0 || v < 0 || u >= W || v >= H || !skin[v * W + u]) continue
      onSkin = true
      if (skin[v * W + u] !== 2) continue
      const q = (v * W + u) * 3
      matched = Math.abs(L - bodyLab[q]) <= tL && Math.abs(A - bodyLab[q + 1]) <= tA && Math.abs(B - bodyLab[q + 2]) <= tB
    }
    const hue = within(hueOf(A, B), model.hue), chroma = Math.hypot(A, B)
    const skinColour = hue && within(chroma, model.chroma) && within(L, model.lightness)
    // a patch's rim: skin hue at any lightness, and as saturated as skin in deep shadow gets
    const rim = hue && chroma >= model.chroma[0]
    return (skinColour ? SKIN_COLOUR : 0) | (onSkin && (skinColour || matched) ? BODY : 0) | (onSkin && rim ? RIM : 0)
  }
  const get = (p) => (memo[p] >= 0 ? memo[p] : (memo[p] = classify(p)))
  return { isBody: (p) => (get(p) & BODY) !== 0, isRim: (p) => (get(p) & RIM) !== 0, isSkinColour: (p) => (get(p) & SKIN_COLOUR) !== 0 }
}

/** Clears 8-connected opaque pieces smaller than ISLAND_MAX_SHARE of the largest piece. */
function withoutIslands(rgba, { width: W, height: H }) {
  const n = W * H
  const seen = new Uint8Array(n)
  const pieces = []
  for (let i = 0; i < n; i++) {
    if (seen[i] || rgba[i * 4 + 3] === 0) continue
    const piece = [i]
    seen[i] = 1
    for (let k = 0; k < piece.length; k++) {
      eachNeighbour(piece[k], W, H, (q) => { if (!seen[q] && rgba[q * 4 + 3] > 0) { seen[q] = 1; piece.push(q) } })
    }
    pieces.push(piece)
  }
  const out = Buffer.from(rgba)
  const largest = Math.max(0, ...pieces.map((piece) => piece.length))
  for (const piece of pieces) if (piece.length < largest * ISLAND_MAX_SHARE) for (const p of piece) out.fill(0, p * 4, p * 4 + 4)
  return out
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
/** Evidence (BAKE_STILLS_EVIDENCE): each thumb before and after body removal, on the body, cropped to the item. */
async function writeThumbEvidence(rigId, thumbs, { body, skin }, canvas) {
  const skinView = Buffer.from(body)
  for (let i = 0; i < skin.length; i++) if (!skin[i] && skinView[i * 4 + 3]) skinView.fill(255, i * 4, i * 4 + 3)
  const dir = join(process.env.BAKE_STILLS_EVIDENCE, "thumbs", rigId)
  mkdirSync(dir, { recursive: true })
  const png = (raw, rect) => sharp(crop(raw, canvas, rect), { raw: { width: rect[2], height: rect[3], channels: 4 } }).png().toBuffer()
  for (const { canonical, withBody, alone, removed } of thumbs) {
    const rect = alphaRect(withBody, canvas.width, canvas.height)
    // stages: removed by the flood (red), by the rim (blue), given back (green), dropped as a fragment (yellow)
    const stages = Buffer.from(withBody)
    for (let p = 0; p < removed.length; p++) {
      if (withBody[p * 4 + 3] === 0) continue
      const kept = alone[p * 4 + 3] > 0
      const colour = removed[p] ? (kept ? [0, 200, 0] : removed[p] === 1 ? [230, 0, 0] : [0, 0, 255]) : kept ? null : [255, 220, 0]
      if (colour) stages.set(colour, p * 4)
    }
    writeFileSync(join(dir, `${canonical}__stages.png`), await png(stages, rect))
    writeFileSync(join(dir, `${canonical}__before.png`), await png(withBody, rect))
    writeFileSync(join(dir, `${canonical}__after.png`), await png(alone, rect))
    writeFileSync(join(dir, `${canonical}__body.png`), await png(skinView, rect))
  }
}
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
