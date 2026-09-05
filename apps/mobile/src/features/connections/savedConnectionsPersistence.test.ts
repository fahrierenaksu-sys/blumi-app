import assert from "node:assert/strict"
import test from "node:test"
import {
  getSavedConnectionsStorageKeys,
  normalizeSavedConnectionsOwnerId
} from "./savedConnectionsPersistence"

test("saved and skipped connection storage is isolated by account", () => {
  const first = getSavedConnectionsStorageKeys("user/a")
  const second = getSavedConnectionsStorageKeys("user-b")

  assert.deepEqual(first, {
    saved: "@blumi/savedConnections/v2:user%2Fa",
    skipped: "@blumi/skippedConnections/v2:user%2Fa",
    migrationMarker: "@blumi/connections/migrated:v2:user%2Fa"
  })
  assert.notEqual(first.saved, second.saved)
  assert.notEqual(first.skipped, second.skipped)
})

test("connection storage refuses an empty account owner", () => {
  assert.throws(() => normalizeSavedConnectionsOwnerId("  "), /owner/i)
  assert.equal(normalizeSavedConnectionsOwnerId(" user-a "), "user-a")
})
