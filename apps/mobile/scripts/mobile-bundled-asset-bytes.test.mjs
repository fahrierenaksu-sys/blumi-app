// Release guard: the app's bundled assets must not grow without anyone noticing.
//
// It replaces the EAS Update 1,000-asset guard, retired with OTA updates
// (owner decision 2026-10-08, ported 2026-10-10): every release is now a
// TestFlight build, so the file-count cap no longer exists, but rig texture
// pages, baked stills and furniture layers still grow the install size and the
// memory the app can touch. The ceiling is deliberately generous (about 55 MiB
// was required on 2026-10-10, before the 2.5D art arrives and the old art is
// deleted). Raise it only with a reason in the same commit.
import assert from "node:assert/strict"
import test from "node:test"
import { measureRequiredAppAssets } from "./mobileBundledAssets.mjs"

const MiB = 1024 * 1024
const BUNDLED_ASSET_BYTES_CEILING = 100 * MiB

test("every asset that app code requires exists", () => {
  const { missing } = measureRequiredAppAssets()
  assert.deepEqual(missing, [])
})

test("the bytes of the assets app code requires stay under the ceiling", () => {
  const { distinctFiles, totalBytes } = measureRequiredAppAssets()
  assert.ok(distinctFiles > 0, "the scan found no required assets; the require pattern is broken")
  assert.ok(
    totalBytes <= BUNDLED_ASSET_BYTES_CEILING,
    `App code requires ${distinctFiles} distinct asset files, ${(totalBytes / MiB).toFixed(1)} MiB in all; ` +
      `the ceiling is ${BUNDLED_ASSET_BYTES_CEILING / MiB} MiB. Delete art that no surface uses, compress it, ` +
      "or raise the ceiling with a reason."
  )
})
