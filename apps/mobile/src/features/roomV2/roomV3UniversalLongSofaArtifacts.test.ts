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

test("Universal long sofa pilot baselines match all four real alpha artifacts", () => {
  const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (entry) => entry.id === "universal_long_sofa_a"
  )
  assert.ok(candidate)

  const baselines = candidate.artifactBaselinesByRotation
  const floors: number[] = []
  for (const rotation of ["front", "back", "left", "right"] as const) {
    const relativePath: string | undefined = candidate.assetPathsByRotation[rotation]
    assert.ok(relativePath)
    const bytes: Uint8Array = readFileSync(
      resolve(process.cwd(), "src/features/roomV2", relativePath)
    )
    const image = PNG.sync.read(bytes)
    const baseline = baselines?.[rotation]
    assert.ok(baseline)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), baseline.sha256)
    assert.equal(image.width, baseline.width)
    assert.equal(image.height, baseline.height)

    let minX = image.width
    let minY = image.height
    let maxX = -1
    let maxY = -1
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
    assert.deepEqual(
      { minX, minY, maxXInclusive: maxX, maxYInclusive: maxY },
      baseline.alphaBounds
    )
    assert.equal(transparent, baseline.transparentPixelCount)
    assert.equal(partial, baseline.partialAlphaPixelCount)
    floors.push(maxY)
  }

  assert.deepEqual(new Set(floors), new Set([975]))
})
