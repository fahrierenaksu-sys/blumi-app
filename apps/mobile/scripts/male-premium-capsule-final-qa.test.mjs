import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve(import.meta.dirname, "../../..")
const qaRoot = resolve(root, "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16/final-qa")

test("full male premium capsule QA publishes hair, glasses, outfit, and catalog evidence", () => {
  const manifest = JSON.parse(readFileSync(resolve(qaRoot, "final-qa-manifest.json"), "utf8"))
  assert.equal(manifest.rigId, "blumi_2_5d_layered_v1")
  assert.equal(manifest.fitProfileId, "blumi_male_room_avatar_v1")
  assert.deepEqual(Object.keys(manifest.outputs).sort(), [
    "catalogRuntime",
    "glassesComparison",
    "hairComparison",
    "outfitCompatibility"
  ])

  for (const path of Object.values(manifest.outputs)) {
    const file = resolve(root, path)
    assert.equal(existsSync(file), true, path)
    const image = PNG.sync.read(readFileSync(file))
    assert.ok(image.width >= 640, `${path} width`)
    assert.ok(image.height >= 320, `${path} height`)
  }
})
