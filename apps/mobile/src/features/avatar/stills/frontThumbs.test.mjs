// Card thumbs cut from the showcase front (tools/avatar25d/front-thumbs.mjs): an unpublished item's Shop and
// Wardrobe thumb is its front cut, a published item keeps its receipt-locked rig thumb, and the cut only removes
// the body a front layer carries, never fabric inside the item's outline.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"
import { premultipliedResize, readFrontThumbPins, thumbSource, withoutCarriedBody } from "../../../../../../tools/avatar25d/front-thumbs.mjs"

const ROOT = resolve(import.meta.dirname, "../../../../../..")
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "packages/domain/src/avatar/avatarStillManifest.json"), "utf8"))
const PUBLISHED = new Set(JSON.parse(readFileSync(join(ROOT, "packages/domain/src/release/blumiR1ReleaseCatalog.json"), "utf8")).publishedItems.map((i) => i.itemId))

test("an unpublished item with a front pin ships exactly its front cut as the card thumb", () => {
  const pins = readFrontThumbPins()
  let checked = 0
  for (const [rig, items] of Object.entries(pins)) {
    for (const [itemId, pin] of Object.entries(items)) {
      assert.ok(!PUBLISHED.has(itemId), `${itemId} is published: its thumb is receipt-locked and must not have a front pin`)
      const item = MANIFEST.bodies[rig]?.items[itemId]
      if (!item) continue // pinned ahead of its rig art: baked once the item lands
      const thumb = readFileSync(join(ROOT, "apps/mobile/src/features/avatar/stills/layers", rig, "thumb", `${item.thumb}.webp`))
      assert.equal(sha256(thumb), pin.sha256, `${rig}/${itemId}: the card thumb is not its front cut (run bake-stills.mjs)`)
      checked++
    }
  }
  assert.ok(checked > 0, "no front-cut thumb was checked")
})

test("a published item keeps its rig thumb, and a front pin for one is refused", () => {
  assert.equal(thumbSource({ itemId: "p", isPublished: true, hasRedraw: false, hasFront: false }), "rig")
  assert.throws(() => thumbSource({ itemId: "p", isPublished: true, hasRedraw: false, hasFront: true }), /receipt-locked/)
  assert.equal(thumbSource({ itemId: "n", isPublished: false, hasRedraw: false, hasFront: true }), "front")
  assert.equal(thumbSource({ itemId: "n", isPublished: false, hasRedraw: false, hasFront: false }), "rig")
  assert.equal(thumbSource({ itemId: "n", isPublished: false, hasRedraw: true, hasFront: true }), "redraw")
})

const SKIN = [240, 200, 175], FABRIC = [40, 60, 160]
function canvas(w, h, paint) {
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const colour = paint(x, y)
    if (colour) data.set([...colour, 255], (y * w + x) * 4)
  }
  return { data, width: w, height: h }
}
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3]

test("the front cut removes the carried body outside the item, never skin-coloured fabric inside its outline", () => {
  const [w, h] = [120, 80]
  // base: skin everywhere the body is (here the whole canvas)
  const base = canvas(w, h, () => SKIN)
  const inGarment = (x, y) => x >= 30 && x < 90 && y >= 10 && y < 70
  const item = canvas(w, h, (x, y) => {
    if (x >= 5 && x < 15 && y >= 30 && y < 40) return SKIN // a detached hand
    if (x >= 20 && x < 30 && y >= 30 && y < 50) return SKIN // a neck strip on the item's outer edge
    if (x >= 50 && x < 60 && y >= 30 && y < 40) return SKIN // fabric that looks like skin, inside the outline
    return inGarment(x, y) ? FABRIC : null
  })
  const cut = withoutCarriedBody(item, base)
  assert.equal(alphaAt(cut, 10, 35), 0, "the detached hand stays")
  assert.equal(alphaAt(cut, 25, 40), 0, "the neck strip on the edge stays")
  assert.equal(alphaAt(cut, 55, 35), 255, "skin-coloured fabric inside the outline was cut")
  assert.equal(alphaAt(cut, 40, 20), 255, "the garment was cut")
})

test("the thumb downscale is premultiplied: a soft edge never darkens toward transparent black", async () => {
  const img = canvas(64, 64, (x) => (x < 32 ? [255, 0, 0] : null))
  const out = await premultipliedResize(img.data, 64, 64, 8, 8)
  let edge = 0
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue
    if (out[i + 3] < 255) edge++
    assert.ok(out[i] >= 250 && out[i + 1] <= 3 && out[i + 2] <= 3, `pixel ${i / 4} darkened or tinted: ${[...out.slice(i, i + 4)]}`)
  }
  assert.ok(edge > 0, "no soft edge pixel was checked")
})
