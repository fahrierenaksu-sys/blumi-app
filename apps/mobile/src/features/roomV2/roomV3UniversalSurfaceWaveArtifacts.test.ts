import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { ROOM_V3_FURNITURE_PILOT_CANDIDATES } from "./roomV3FurnitureCandidateGate"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } } }
}

const EXPECTED = {
  universal_small_speaker_a: { sha256: "1aadc26cecdd46fd09236d3da01395d75a01f3ac05199a11e8ec3045f8435521", width: 1254, height: 1254, alphaBounds: { minX: 244, minY: 234, maxXInclusive: 1020, maxYInclusive: 1110 }, transparentPixelCount: 964313, partialAlphaPixelCount: 2174 },
  universal_rug_a: { sha256: "ff016b98871290744b862ede0a3a3b84b5ec12465f6114ee670ce40abcb57a73", width: 1254, height: 1254, alphaBounds: { minX: 11, minY: 194, maxXInclusive: 1241, maxYInclusive: 1047 }, transparentPixelCount: 675498, partialAlphaPixelCount: 4169 },
  universal_full_length_mirror_a: { sha256: "e9578ed29244fa2272daa2c7ad613ff305acdfff0247e130b31023fe5694d63c", width: 1254, height: 1254, alphaBounds: { minX: 332, minY: 35, maxXInclusive: 927, maxYInclusive: 1220 }, transparentPixelCount: 1068079, partialAlphaPixelCount: 3556 },
  universal_open_display_shelf_a: { sha256: "4914c12f1ff1097bdbfc9acb71982cde50ba5c4c6b79db44ec44e8417eddd123", width: 1254, height: 1254, alphaBounds: { minX: 244, minY: 100, maxXInclusive: 1044, maxYInclusive: 1171 }, transparentPixelCount: 995922, partialAlphaPixelCount: 10187 },
  universal_room_divider_a: { sha256: "5b5b32169660bb4731007ee91c7016694b2e726d02143c6bbb9377e57cad5601", width: 1254, height: 1254, alphaBounds: { minX: 158, minY: 124, maxXInclusive: 1099, maxYInclusive: 1160 }, transparentPixelCount: 718438, partialAlphaPixelCount: 4585 }
} as const

test("surface wave candidates point to real normalized alpha artifacts", () => {
  for (const [id, baseline] of Object.entries(EXPECTED)) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find((entry) => entry.id === id)
    assert.ok(candidate, `${id} must be registered as a candidate`)
    assert.equal(candidate.requiresDirectionalAssets, false)
    const relativePath = candidate.assetPathsByRotation.front
    assert.ok(relativePath)
    const bytes = readFileSync(resolve(process.cwd(), "src/features/roomV2", relativePath))
    const image = PNG.sync.read(bytes)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), baseline.sha256)
    assert.equal(image.width, baseline.width)
    assert.equal(image.height, baseline.height)

    let minX: number = image.width
    let minY: number = image.height
    let maxX: number = -1
    let maxY: number = -1
    let transparent = 0
    let partial = 0
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const alpha = image.data[(y * image.width + x) * 4 + 3]
        if (alpha === 0) {
          transparent += 1
          continue
        }
        if (alpha < 255) partial += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    assert.deepEqual({ minX, minY, maxXInclusive: maxX, maxYInclusive: maxY }, baseline.alphaBounds)
    assert.equal(transparent, baseline.transparentPixelCount)
    assert.equal(partial, baseline.partialAlphaPixelCount)
  }
})
