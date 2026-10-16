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
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { SHIPPED_PLATFORMS, measureRequiredAppAssets, mobileRoot } from "./mobileBundledAssets.mjs"

const MiB = 1024 * 1024
const BUNDLED_ASSET_BYTES_CEILING = 100 * MiB

test("every asset that app code requires exists", () => {
  const { missing } = measureRequiredAppAssets()
  assert.deepEqual(missing, [])
})

for (const platform of SHIPPED_PLATFORMS) {
  test(`the bytes of the assets the ${platform} bundle requires stay under the ceiling`, () => {
    const { distinctFiles, totalBytes } = measureRequiredAppAssets(mobileRoot, platform)
    assert.ok(distinctFiles > 0, "the scan found no required assets; the require pattern is broken")
    assert.ok(
      totalBytes <= BUNDLED_ASSET_BYTES_CEILING,
      `The ${platform} bundle requires ${distinctFiles} distinct asset files, ${(totalBytes / MiB).toFixed(1)} MiB in all; ` +
        `the ceiling is ${BUNDLED_ASSET_BYTES_CEILING / MiB} MiB. Delete art that no surface uses, compress it, ` +
        "or raise the ceiling with a reason."
    )
  })
}

// iOS draws the 2.5D rigs from their packed ASTC pages, so the PNG pages (the Android/web fallback) must stay out of
// the iOS bundle, and every page a rig view draws must be in that view's ASTC set or iOS could not draw it.
const RIGS_DIR = join(mobileRoot, "src/features/avatar/rigs")
const RIG_PAGE = /^src\/features\/avatar\/rigs\/[^/]+\/[^/]+_page\d+\.png$/

test("the iOS bundle carries no 2.5D rig PNG page", () => {
  const { files } = measureRequiredAppAssets(mobileRoot, "ios")
  assert.ok(files.some((file) => file.startsWith("src/features/avatar/rigs/")), "the scan found no rig assets for iOS")
  assert.deepEqual(files.filter((file) => RIG_PAGE.test(file)), [])
})

for (const rig of readdirSync(RIGS_DIR).filter((name) => existsSync(join(RIGS_DIR, name, "rig25.json")))) {
  test(`${rig}: every page the rig draws is in its view's ASTC set, so iOS can draw it without PNG pages`, () => {
    const views = JSON.parse(readFileSync(join(RIGS_DIR, rig, "rig25.json"), "utf8")).views
    const sets = JSON.parse(readFileSync(join(RIGS_DIR, rig, "astc/manifest.json"), "utf8")).sets
    assert.ok(Object.keys(views).length > 0, `${rig} has no views`)
    for (const [viewName, view] of Object.entries(views)) {
      assert.ok(view.pages.length > 0, `${rig}/${viewName} draws no page`)
      assert.deepEqual(view.pages.filter((page) => !sets[viewName]?.pages.includes(page)), [], `${rig}/${viewName}`)
    }
  })
}
