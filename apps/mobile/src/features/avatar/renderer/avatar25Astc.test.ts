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
  assert.deepEqual(chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/boy"), pages: ["front_page2.png"] }), { kind: "png" })
  assert.deepEqual(chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/girl"), pages: [] }), { kind: "png" })
  const wrongFormat = { ...readManifest("../rigs/girl"), format: "astc-6x6-unorm" }
  assert.equal(findAvatar25AstcSet(wrongFormat, ["front_page0.png"]), null)
})

test("flag on with the feature picks the blob, in its own texture cache namespace", () => {
  const choice = chooseAvatar25PageSource({ requested: true, featureAvailable: true, source: sourceOf("../rigs/girl"), pages: ["front_page0.png", "front_page2.png"] })
  assert.equal(choice.kind, "astc")
  if (choice.kind !== "astc") return
  assert.deepEqual(choice.pageIndices, [0, 2])
  assert.equal(choice.set.file, "front.astc.zip")
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
      assert.deepEqual(Object.keys(set.sourceSha256), set.pages)
      for (const page of set.pages) {
        assert.equal(sha256(readFileSync(resolve(here, dir, page))), set.sourceSha256[page], `${dir}/${page} changed since the blob was derived: re-run compress_pages.py`)
      }
    }
  })

  test(`${dir}: each blob matches its recorded hash and size, and its writes tile the file exactly`, () => {
    for (const set of Object.values(readManifest(dir).sets)) {
      const blob = readFileSync(resolve(here, dir, "astc", set.file))
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
        const pages = compileAvatar(rig, view, worn).pages
        assert.ok(findAvatar25AstcSet(manifest, pages), `${dir} ${view} ${worn.length} items`)
      }
    }
  })
}
