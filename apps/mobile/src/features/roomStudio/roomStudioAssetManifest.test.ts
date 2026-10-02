import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_STUDIO_ASSET_IDS,
  ROOM_STUDIO_ASSET_MANIFEST,
  getRoomStudioAssetManifestEntry
} from "./roomStudioAssetManifest"

test("asset continuity manifest covers unique alpha-verified candidates", () => {
  assert.ok(ROOM_STUDIO_ASSET_IDS.length > 0)
  assert.equal(new Set(ROOM_STUDIO_ASSET_IDS).size, ROOM_STUDIO_ASSET_IDS.length)
  for (const id of ROOM_STUDIO_ASSET_IDS) {
    const entry = ROOM_STUDIO_ASSET_MANIFEST[id]!
    assert.equal(entry.status, "candidate")
    assert.equal(entry.alphaVerified, true)
    assert.match(entry.sha256, /^[a-f0-9]{64}$/)
    assert.ok(entry.width > 0 && entry.height > 0)
  }
})

test("asset manifest lookup fails closed for unknown IDs", () => {
  assert.throws(
    () => getRoomStudioAssetManifestEntry("room_studio_unknown"),
    /room_studio_asset_unknown/
  )
})
