import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  assertAvatar25AstcBlob,
  AVATAR25_ASTC_FORMAT,
  avatar25AstcGpuBytes,
  avatar25AstcUploads,
  avatar25PageSourceNamespace,
  chooseAvatar25PageSource,
  findAvatar25AstcSet,
  hasGpuFeature,
  AVATAR25_ASTC_ENABLED,
  isAvatar25AstcRequested,
  shouldRequestAvatar25AstcFeature,
  type Avatar25AstcManifest,
  type Avatar25AstcSource
} from "./avatar25Astc"
import { AVATAR25_PACKED_ASTC_ENCODING, decodeAvatar25PackedAstc } from "./avatar25PackedAstc"
import { compileAvatar } from "./avatar25Pose"
import type { Rig25 } from "./rigTypes"

const here = import.meta.dirname
const RIG_DIRS = ["../rigs/girl", "../rigs/boy"] as const
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const readManifest = (dir: string) => JSON.parse(readFileSync(resolve(here, dir, "astc/manifest.json"), "utf8")) as Avatar25AstcManifest
const readRig = (dir: string) => JSON.parse(readFileSync(resolve(here, dir, "rig25.json"), "utf8")) as Rig25
const neverRead = async (): Promise<ArrayBuffer> => { throw new Error("not read") }
const sourceOf = (dir: string): Avatar25AstcSource => ({ manifest: readManifest(dir), readBlob: neverRead })

// owner decision 2026-10-10: compressed pages are on, as a code constant (no build flag, no runtime switch)
test("the compressed pages are always requested; the PNG pages stay the fallback", () => {
  assert.equal(AVATAR25_ASTC_ENABLED, true)
  assert.equal(isAvatar25AstcRequested(), true)
  assert.equal(shouldRequestAvatar25AstcFeature(), true)
})

test("requested by default, the pages still come from PNG unless the GPU has ASTC and a blob covers them", () => {
  const requested = isAvatar25AstcRequested()
  const pages = ["front_page0.png"]
  assert.deepEqual(chooseAvatar25PageSource({ requested, featureAvailable: false, source: sourceOf("../rigs/girl"), pages }), { kind: "png" })
  assert.deepEqual(chooseAvatar25PageSource({ requested, featureAvailable: true, source: undefined, pages }), { kind: "png" })
  assert.equal(chooseAvatar25PageSource({ requested, featureAvailable: true, source: sourceOf("../rigs/girl"), pages }).kind, "astc")
})

test("flag off keeps the PNG path even when the GPU supports ASTC and a blob exists", () => {
  const girlPages = ["front_page0.png", "front_page1.png"]
  const choice = chooseAvatar25PageSource({ requested: false, featureAvailable: true, source: sourceOf("../rigs/girl"), pages: girlPages })
  assert.deepEqual(choice, { kind: "png" })
  assert.equal(avatar25PageSourceNamespace("female", choice), "female")
})

test("flag on without the GPU feature falls back to the PNG path", () => {
  const choice = chooseAvatar25PageSource({ requested: true, featureAvailable: false, source: sourceOf("../rigs/girl"), pages: ["front_page0.png"] })
  assert.deepEqual(choice, { kind: "png" })
})

test("flag on with the feature but no matching blob falls back to the PNG path", () => {
  assert.deepEqual(chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: undefined, pages: ["front_page0.png"] }), { kind: "png" })
  assert.deepEqual(chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/boy"), pages: ["front_page99.png"] }), { kind: "png" })
  assert.deepEqual(chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/girl"), pages: [] }), { kind: "png" })
  const wrongFormat = { ...readManifest("../rigs/girl"), format: "astc-6x6-unorm" }
  assert.equal(findAvatar25AstcSet(wrongFormat, ["front_page0.png"]), null)
})

test("flag on with the feature picks the blob, in its own texture cache namespace", () => {
  const choice = chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/girl"), pages: ["front_page0.png", "front_page2.png"] })
  assert.equal(choice.kind, "astc")
  if (choice.kind !== "astc") return
  assert.deepEqual(choice.pageIndices, [0, 2])
  assert.equal(choice.set.file, "front.astc-packed.zip")
  assert.notEqual(avatar25PageSourceNamespace("female", choice), "female")
})

test("GPU feature lists work as a Set or as any iterable", () => {
  assert.equal(hasGpuFeature(new Set(["texture-compression-astc"]), "texture-compression-astc"), true)
  assert.equal(hasGpuFeature(["depth-clip-control"], "texture-compression-astc"), false)
  assert.equal(hasGpuFeature(undefined, "texture-compression-astc"), false)
})

for (const dir of RIG_DIRS) {
  test(`${dir}: the manifest's source hashes match the current PNG pages`, () => {
    const manifest = readManifest(dir)
    assert.equal(manifest.format, AVATAR25_ASTC_FORMAT)
    assert.deepEqual(Object.keys(manifest.sets).sort(), ["back", "front"])
    for (const set of Object.values(manifest.sets)) {
      // JSON key order is not meaningful (the manifest is written with sorted keys: page10 sorts before page2)
      assert.deepEqual(Object.keys(set.sourceSha256).sort(), [...set.pages].sort())
      for (const page of set.pages) {
        assert.equal(sha256(readFileSync(resolve(here, dir, page))), set.sourceSha256[page], `${dir}/${page} changed since the blob was derived: re-run compress_pages.py`)
      }
    }
  })

  test(`${dir}: each blob matches its recorded hash and size, and its writes tile the file exactly`, () => {
    for (const set of Object.values(readManifest(dir).sets)) {
      const packed = readFileSync(resolve(here, dir, "astc", set.file))
      assert.equal(set.packed.encoding, AVATAR25_PACKED_ASTC_ENCODING)
      assert.equal(packed.byteLength, set.packed.bytes)
      assert.equal(sha256(packed), set.packed.sha256)
      // the decoded blob is byte-identical to the one the ASTC encoder wrote: the GPU receives exactly the same texture
      const blob = Buffer.from(decodeAvatar25PackedAstc(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)))
      assert.equal(sha256(blob), set.sha256)
      assert.doesNotThrow(() => assertAvatar25AstcBlob(set, blob.byteLength))
      const all = avatar25AstcUploads(set, set.pages.map((_, i) => i))
      assert.equal(all.reduce((sum, u) => sum + u.byteLength, 0), blob.byteLength)
      assert.equal(new Set(all.map((u) => u.byteOffset)).size, all.length)
      for (const up of all) {
        assert.equal(up.bytesPerRow % 16, 0)
        assert.equal(up.extent[0] % 4, 0)
        assert.equal(up.extent[1] % 4, 0)
        assert.equal(up.byteLength, up.bytesPerRow * up.rowsPerImage)
        assert.ok(up.byteOffset + up.byteLength <= blob.byteLength)
      }
      assert.equal(avatar25AstcGpuBytes(set, 1) * set.layers, set.gpuBytes)
      assert.throws(() => assertAvatar25AstcBlob(set, blob.byteLength - 16), /size mismatch/)
    }
  })

  test(`${dir}: every page set an avatar can draw has a blob (bare, and each item alone)`, () => {
    const rig = readRig(dir)
    const manifest = readManifest(dir)
    for (const view of ["front", "back"] as const) {
      const itemIds = Object.keys(rig.views[view].items)
      for (const worn of [[], ...itemIds.map((id) => [id]), itemIds]) {
        // the plain drawing, and a mirrored one (an item's mirror cards may live on a page of their own: that page must
        // be in a blob too, or the mirrored view would fall back to PNG pages, four times the GPU memory)
        for (const [mirrored, withCardPages] of [[false, false], [true, true], [false, true]] as const) {
          const pages = compileAvatar(rig, view, worn, mirrored, withCardPages).pages
          assert.ok(findAvatar25AstcSet(manifest, pages), `${dir} ${view} ${worn.length} items, mirrored ${mirrored}, card pages ${withCardPages}`)
        }
      }
    }
  })
}

/** A packed file built by hand: `blocks` 16-byte blocks of `fill`, except the given runs. */
function packedOf(blockCount: number, fill: number, runs: Array<[first: number, blocks: number[]]>, trailing = 0): ArrayBuffer {
  const payload = runs.flatMap(([, blocks]) => blocks)
  const bytes = new Uint8Array(28 + runs.length * 8 + payload.length * 16 + trailing)
  const view = new DataView(bytes.buffer)
  bytes.set([0x42, 0x53, 0x41, 0x31])
  view.setUint32(4, blockCount * 16, true)
  view.setUint32(8, runs.length, true)
  bytes.fill(fill, 12, 28)
  runs.forEach(([first, blocks], index) => {
    view.setUint32(28 + index * 8, first, true)
    view.setUint32(32 + index * 8, blocks.length, true)
  })
  payload.forEach((value, index) => bytes.fill(value, 28 + runs.length * 8 + index * 16, 44 + runs.length * 8 + index * 16))
  return bytes.buffer
}

test("a packed ASTC blob decodes to the fill block everywhere except its runs", () => {
  const blob = new Uint8Array(decodeAvatar25PackedAstc(packedOf(7, 0xaa, [[1, [1, 2]], [5, [3]]])))
  const blockValues = Array.from({ length: 7 }, (_, block) => blob[block * 16])
  assert.deepEqual(blockValues, [0xaa, 1, 2, 0xaa, 0xaa, 3, 0xaa])
  assert.equal(blob.byteLength, 7 * 16)
  assert.ok(blob.every((value, index) => value === blob[index - (index % 16)]), "each block is uniform")
  assert.equal(decodeAvatar25PackedAstc(packedOf(0, 0, [])).byteLength, 0)
})

test("a corrupt packed ASTC blob is refused instead of reaching the GPU", () => {
  const good = packedOf(4, 0, [[1, [9]]])
  const wrongMagic = new Uint8Array(good.slice(0))
  wrongMagic[0] = 0
  assert.throws(() => decodeAvatar25PackedAstc(wrongMagic.buffer), /wrong magic/)
  assert.throws(() => decodeAvatar25PackedAstc(good.slice(0, 20)), /header/)
  assert.throws(() => decodeAvatar25PackedAstc(good.slice(0, good.byteLength - 1)), /no bytes/)
  assert.throws(() => decodeAvatar25PackedAstc(packedOf(4, 0, [[1, [9]]], 3)), /trailing/)
  assert.throws(() => decodeAvatar25PackedAstc(packedOf(4, 0, [[3, [1, 2]]])), /out of range/)
  assert.throws(() => decodeAvatar25PackedAstc(packedOf(4, 0, [[2, [1]], [1, [2]]])), /out of order/)
})
