import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const approvedRoot = resolve(
  "docs/avatar-motion-pipeline/female-premium-top-motion-staging/cream_basic_tee"
)
const legacyRoot = resolve("docs/avatar-motion-pipeline/female-cream-tee-motion-staging")
const approvedSitting = join(
  approvedRoot,
  "extracted/room_avatar_top_female_cream_basic_tee_v2_sitting_front_f01.png"
)
const rejectedLegacy = join(legacyRoot, "cream-tee-sit-source-rejected-has-body.png")
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

test("approved Cream Tee sitting candidate satisfies the premium staging contract", () => {
  const metrics = JSON.parse(readFileSync(join(approvedRoot, "metrics.json"), "utf8"))
  const sitting = metrics.frames.find(({ pose }) => pose === "sitting_front_f01")
  assert.ok(sitting)
  assert.deepEqual(sitting.targetBbox, [87, 219, 170, 289])
  assert.equal(sitting.greenResiduePixels, 0)
  assert.equal(metrics.liveAssetsUntouched, true)

  const layer = PNG.sync.read(readFileSync(approvedSitting))
  assert.deepEqual([layer.width, layer.height], [256, 384])
  for (let offset = 0; offset < layer.data.length; offset += 4) {
    const red = layer.data[offset] ?? 0
    const green = layer.data[offset + 1] ?? 0
    const blue = layer.data[offset + 2] ?? 0
    const alpha = layer.data[offset + 3] ?? 0
    if (alpha === 0) assert.deepEqual([red, green, blue], [0, 0, 0])
    else assert.equal(green > red + 30 && green > blue + 30, false)
  }
})

test("rejected body-contaminated Cream source remains evidence, never the approved source", () => {
  const metrics = JSON.parse(readFileSync(join(approvedRoot, "metrics.json"), "utf8"))
  const legacyReport = readFileSync(
    join(legacyRoot, "2026-07-15-cream-tee-sitting-pilot-report.md"),
    "utf8"
  )
  assert.match(legacyReport, /Historical evidence/i)
  assert.match(legacyReport, /body-contaminated/i)
  assert.notEqual(metrics.sitSourceSha256, digest(rejectedLegacy))
  assert.notEqual(digest(approvedSitting), digest(rejectedLegacy))
})
