import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  ROOM_V3_FURNITURE_PILOT_CANDIDATES,
  type RoomV3FurnitureArtifactBaseline
} from "./roomV3FurnitureCandidateGate"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } } }
}

test("existing neutral universal wave baselines match their real PNG artifacts", () => {
  for (const id of [
    "universal_lounge_armchair_a",
    "universal_cloud_bed_b",
    "universal_rounded_wardrobe_a",
    "universal_soft_media_console_a",
    "universal_soft_coat_stand_a",
    "universal_soft_pouf_b",
    "universal_arch_wall_mirror_a"
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)

    for (const [rotation, relativePath] of Object.entries(
      candidate.assetPathsByRotation
    )) {
      assert.ok(relativePath)
      const bytes = readFileSync(
        resolve(process.cwd(), "src/features/roomV2", relativePath)
      )
      const image = PNG.sync.read(bytes)
      const baseline: RoomV3FurnitureArtifactBaseline | undefined = candidate.artifactBaselinesByRotation?.[
        rotation as "front" | "back" | "left" | "right"
      ]
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
    }
  }
})
