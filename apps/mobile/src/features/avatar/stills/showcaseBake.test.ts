import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import sharp from "sharp"

// The showcase baker takes an explicit allowlist of approved stills (by path and sha256) and emits nothing for the
// rest, so an unapproved or changed still can never reach the app. Synthetic stills stand in for the art.

const BAKER = pathToFileURL(resolve(import.meta.dirname, "../../../../../../tools/avatar25d/bake-showcase.mjs")).href
interface Baker {
  validateAllowlist(list: unknown): void
  bakeBody(rig: string, body: unknown, scale: number, pad: number, srcRoot: string): Promise<{
    showcaseBase: { key: string; canvas: { width: number; height: number }; windows: Record<string, number[]> }
    items: Record<string, { key: string; rect: number[]; order: number; back?: { key: string; rect: number[] } }>
    files: Map<string, Buffer>
  }>
}
const loadBaker = async () => (await import(BAKER)) as Baker

const SIZE = { width: 400, height: 800 }
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")

async function still(rect: readonly [number, number, number, number], colour: { r: number; g: number; b: number }) {
  const [x, y, w, h] = rect
  const square = await sharp({ create: { width: w, height: h, channels: 4, background: { ...colour, alpha: 1 } } }).png().toBuffer()
  return sharp({ create: { ...SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: square, left: x, top: y }]).png().toBuffer()
}

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "blumi-showcase-"))
  mkdirSync(join(dir, "g"), { recursive: true })
  const files = {
    base: await still([100, 100, 200, 600], { r: 240, g: 200, b: 170 }),
    top: await still([110, 250, 180, 150], { r: 200, g: 60, b: 60 }),
    hair: await still([120, 80, 160, 100], { r: 30, g: 20, b: 20 }),
    hairBack: await still([90, 90, 220, 220], { r: 20, g: 10, b: 10 })
  }
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, "g", `${name}.png`), bytes)
  const body = {
    base: "g/base.png", baseSha256: sha(files.base),
    crops: { head: [100, 60, 200, 200], push: [80, 60, 240, 300] },
    items: {
      item_top: { slot: "top", order: 3, file: "g/top.png", sha256: sha(files.top) },
      item_hair: { slot: "hair", order: 4, file: "g/hair.png", sha256: sha(files.hair), backFile: "g/hairBack.png", backSha256: sha(files.hairBack) }
    }
  }
  return { dir, body, files }
}

test("only allowlisted stills are baked, each layer is cropped to its pixels, and the hair back is its own layer", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body } = await fixture()
  try {
    writeFileSync(join(dir, "g", "unlisted.png"), await still([0, 0, 50, 50], { r: 1, g: 2, b: 3 }))
    const baked = await bakeBody("female", body, 0.5, 20, dir)
    assert.deepEqual([...baked.files.keys()].sort(), ["base__front", "item_hair__back", "item_hair__front", "item_top__front"])
    const top = baked.items.item_top!
    const [, , w, h] = top.rect
    assert.ok(w <= 110 && h <= 95 && w > 0 && h > 0, "the layer is the item's own pixels at half size, not the canvas")
    assert.equal(top.order, 3)
    assert.ok(baked.items.item_hair!.back, "the hair keeps its back part")
    const { width, height } = baked.showcaseBase.canvas
    for (const [x, y, ww, hh] of Object.values(baked.showcaseBase.windows)) {
      assert.ok(x >= 0 && y >= 0 && x + ww <= width && y + hh <= height, "every crop window is inside the canvas")
    }
    const meta = await sharp(baked.files.get("base__front")!).metadata()
    assert.deepEqual([meta.width, meta.height], [width, height], "the base is the whole canvas, so the resolver can place it at 0,0")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a still whose bytes are not the approved ones is refused, so nothing unapproved can be baked", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body } = await fixture()
  try {
    writeFileSync(join(dir, "g", "top.png"), await still([110, 250, 180, 150], { r: 10, g: 200, b: 10 }))
    await assert.rejects(bakeBody("female", body, 0.5, 20, dir), /not the approved still/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the allowlist rejects candidate paths, a missing hash and a crop that is not a window", async () => {
  const { validateAllowlist } = await loadBaker()
  const { dir, body } = await fixture()
  rmSync(dir, { recursive: true, force: true })
  const approved = { qaPass: "qa/PASS.md", ownerApproved: true }
  const list = (patch: Record<string, unknown>) => ({ scale: 0.5, bodies: { female: { ...body, ...approved, ...patch } } })
  assert.doesNotThrow(() => validateAllowlist(list({})))
  assert.throws(() => validateAllowlist(list({ base: "x/candidate/base.png" })), /candidate/)
  assert.throws(() => validateAllowlist(list({ items: { a: { slot: "top", order: 1, file: "a.png" } } })), /sha256/)
  assert.throws(() => validateAllowlist(list({ crops: { head: [1, 2], push: [1, 2, 3, 4] } })), /head/)
  assert.throws(() => validateAllowlist({ scale: 0.5, bodies: { robot: { ...body, ...approved } } }), /unknown body/)
})

test("an entry without a QA PASS record or without the owner's approval is refused", async () => {
  const { validateAllowlist } = await loadBaker()
  const { dir, body } = await fixture()
  rmSync(dir, { recursive: true, force: true })
  const entry = (patch: Record<string, unknown>) => ({ scale: 0.5, bodies: { female: { ...body, qaPass: "qa/PASS.md", ownerApproved: true, ...patch } } })
  assert.doesNotThrow(() => validateAllowlist(entry({})))
  assert.throws(() => validateAllowlist(entry({ qaPass: undefined })), /qaPass/)
  assert.throws(() => validateAllowlist(entry({ qaPass: " " })), /qaPass/)
  assert.throws(() => validateAllowlist(entry({ ownerApproved: undefined })), /ownerApproved/)
  assert.throws(() => validateAllowlist(entry({ ownerApproved: "yes" })), /ownerApproved/)
  assert.throws(() => validateAllowlist(entry({ ownerApproved: false })), /ownerApproved/)
})

test("a crop window that leaves the canvas stops the bake", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body } = await fixture()
  try {
    const wide = { ...body, crops: { ...body.crops, push: [-50, 0, 200, 200] } }
    await assert.rejects(bakeBody("female", wide, 0.5, 20, dir), /leaves the canvas/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
