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
  validateAllowlist(list: unknown, options?: { allowPendingOwnerApproval?: boolean }): void
  bakeBody(rig: string, body: unknown, scale: number, pad: number, srcRoot: string, redrawRoot?: string): Promise<{
    showcaseBase: { key: string; canvas: { width: number; height: number }; windows: Record<string, number[]> }
    items: Record<string, { key: string; rect: number[]; order: number; back?: { key: string; rect: number[] }; under?: { key: string; rect: number[] } }>
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

test("a pinned hand-finished layer replaces the baked one only with the exact bytes and the baked size", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body } = await fixture()
  try {
    const plain = await bakeBody("female", body, 0.5, 20, dir)
    const [, , w, h] = plain.items.item_hair!.rect
    const redrawn = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 90, g: 40, b: 40, alpha: 1 } } }).webp({ lossless: true }).toBuffer()
    mkdirSync(join(dir, "redraws", "female"), { recursive: true })
    writeFileSync(join(dir, "redraws", "female", "item_hair__front.webp"), redrawn)
    const pinned = { ...body, items: { ...body.items, item_hair: { ...body.items.item_hair, frontRedrawSha256: sha(redrawn) } } }
    const baked = await bakeBody("female", pinned, 0.5, 20, dir, join(dir, "redraws"))
    assert.deepEqual(baked.files.get("item_hair__front"), redrawn, "the pinned redraw is the layer")
    assert.deepEqual(baked.files.get("item_hair__back"), plain.files.get("item_hair__back"), "an unpinned layer is still baked from its source")
    assert.deepEqual(baked.items.item_hair!.rect, plain.items.item_hair!.rect, "the source still fixes the rect")
    const wrongPin = { ...body, items: { ...body.items, item_hair: { ...body.items.item_hair, frontRedrawSha256: "0".repeat(64) } } }
    await assert.rejects(bakeBody("female", wrongPin, 0.5, 20, dir, join(dir, "redraws")), /differs from its pin/)
    const wrongSize = await sharp({ create: { width: w + 1, height: h, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).webp({ lossless: true }).toBuffer()
    writeFileSync(join(dir, "redraws", "female", "item_hair__front.webp"), wrongSize)
    const sizedPin = { ...body, items: { ...body.items, item_hair: { ...body.items.item_hair, frontRedrawSha256: sha(wrongSize) } } }
    await assert.rejects(bakeBody("female", sizedPin, 0.5, 20, dir, join(dir, "redraws")), /baked rect/)
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
  // the new item kinds have front layers too; an unknown slot is refused
  for (const slot of ["dress", "glasses", "accessory"]) {
    assert.doesNotThrow(() => validateAllowlist(list({ items: { a: { slot, order: 35, file: "a.png", sha256: "0" } } })), slot)
  }
  assert.throws(() => validateAllowlist(list({ items: { a: { slot: "cape", order: 1, file: "a.png", sha256: "0" } } })), /unknown slot/)
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

test("a look the owner has not approved yet is baked only when the work branch asks for it explicitly", async () => {
  const { validateAllowlist } = await loadBaker()
  const { dir, body } = await fixture()
  rmSync(dir, { recursive: true, force: true })
  const entry = (patch: Record<string, unknown>) => ({ scale: 0.5, bodies: { female: { ...body, qaPass: "qa/PASS.md", ...patch } } })
  assert.doesNotThrow(() => validateAllowlist(entry({ ownerApproved: false }), { allowPendingOwnerApproval: true }))
  assert.throws(() => validateAllowlist(entry({ ownerApproved: undefined }), { allowPendingOwnerApproval: true }), /ownerApproved/)
  assert.throws(() => validateAllowlist(entry({ ownerApproved: false })), /ownerApproved/)
})

async function mask(rect: readonly [number, number, number, number]) {
  const [x, y, w, h] = rect
  const white = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer()
  return sharp({ create: { ...SIZE, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite([{ input: white, left: x, top: y }])
    .toColourspace("b-w").png().toBuffer()
}

test("each piece erases the body only where its own mask says, whichever other piece of the slot erases more", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body } = await fixture()
  try {
    const masks = { a: await mask([150, 300, 40, 40]), b: await mask([220, 500, 40, 40]) }
    for (const [name, bytes] of Object.entries(masks)) writeFileSync(join(dir, "g", `erase_${name}.png`), bytes)
    const top = body.items.item_top
    const items = {
      ...body.items,
      item_top: { ...top, eraseFile: "g/erase_a.png", eraseSha256: sha(masks.a) },
      item_top2: { ...top, eraseFile: "g/erase_b.png", eraseSha256: sha(masks.b) }
    }
    const baked = await bakeBody("female", { ...body, items }, 0.5, 20, dir)
    const { width, height } = baked.showcaseBase.canvas
    const [hx, hy] = baked.showcaseBase.windows.head!
    const at = (x: number, y: number) => [Math.round((x - (100 - hx! * 2)) / 2), Math.round((y - (60 - hy! * 2)) / 2)] as const
    const alphaWith = async (itemId: string) => {
      const under = baked.items[itemId]!.under!
      const { data } = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: baked.files.get("base__front")!, left: 0, top: 0 }, { input: baked.files.get(under.key)!, left: under.rect[0]!, top: under.rect[1]! }])
        .raw().toBuffer({ resolveWithObject: true })
      return (x: number, y: number) => { const [px, py] = at(x, y); return data[(py * width + px) * 4 + 3]! }
    }
    const withA = await alphaWith("item_top"), withB = await alphaWith("item_top2")
    assert.equal(withA(170, 320), 0, "piece a erases the body under its mask")
    assert.equal(withB(170, 320), 255, "piece b leaves that body in place")
    assert.equal(withB(240, 520), 0, "piece b erases under its own mask")
    assert.equal(withA(240, 520), 255, "piece a leaves that body in place")
    assert.equal(withA(200, 650), 255, "the body outside every mask is the base itself")
    assert.equal((baked.showcaseBase as { underSlots?: string[] }).underSlots?.join(), "top", "only the slot that erases is cut from the base")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Review slots_1330 HIGH-1: a one-piece dress's erase mask applies only when that dress is worn. It must never change
// the front base or the top and bottom under layers that every top+bottom look is drawn with.
async function topBottomDressFixture(dressErase: readonly [number, number, number, number]) {
  const { dir, body } = await fixture()
  const art = {
    bottom: await still([120, 400, 160, 200], { r: 60, g: 60, b: 200 }),
    dress: await still([110, 250, 180, 350], { r: 200, g: 120, b: 200 }),
    eraseTop: await mask([140, 260, 120, 130]),
    eraseBottom: await mask([140, 390, 120, 200]),
    eraseDress: await mask(dressErase)
  }
  for (const [name, bytes] of Object.entries(art)) writeFileSync(join(dir, "g", `${name}.png`), bytes)
  const withErase = (file: string) => ({ eraseFile: `g/${file}.png`, eraseSha256: sha(art[file as keyof typeof art]) })
  const separates = {
    ...body.items,
    item_top: { ...body.items.item_top, ...withErase("eraseTop") },
    item_bottom: { slot: "bottom", order: 2, file: "g/bottom.png", sha256: sha(art.bottom), ...withErase("eraseBottom") }
  }
  const dress = { slot: "dress", order: 3, file: "g/dress.png", sha256: sha(art.dress), ...withErase("eraseDress") }
  return { dir, body, separates, dress }
}

test("adding a dress with an erase mask leaves the front base and every top and bottom layer byte-identical", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body, separates, dress } = await topBottomDressFixture([140, 260, 120, 330])
  try {
    const before = await bakeBody("female", { ...body, items: separates }, 0.5, 20, dir)
    const after = await bakeBody("female", { ...body, items: { ...separates, item_dress: dress } }, 0.5, 20, dir)
    assert.deepEqual(after.showcaseBase, before.showcaseBase, "base canvas, windows and erased slots are unchanged")
    for (const [key, bytes] of before.files) assert.ok(after.files.get(key)?.equals(bytes), `${key} changed`)
    for (const id of ["item_top", "item_bottom"]) assert.deepEqual(after.items[id], before.items[id], id)
    assert.ok(after.items.item_dress?.under, "the dress refills the top and bottom regions with its own under layer")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a dress whose mask would erase body outside the top and bottom regions stops the bake instead of changing the base", async () => {
  const { bakeBody } = await loadBaker()
  const { dir, body, separates, dress } = await topBottomDressFixture([140, 260, 120, 420])
  try {
    await assert.rejects(bakeBody("female", { ...body, items: { ...separates, item_dress: dress } }, 0.5, 20, dir), /outside the top and bottom/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
