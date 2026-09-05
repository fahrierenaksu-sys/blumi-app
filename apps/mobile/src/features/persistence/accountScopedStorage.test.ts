import assert from "node:assert/strict"
import test from "node:test"
import {
  loadAccountScopedStorage,
  type AsyncKeyValueStorage
} from "./accountScopedStorage"

test("legacy data binds once to the authenticated owner", async () => {
  const storage = createMemoryStorage({ legacy: "saved-room" })
  const result = await loadAccountScopedStorage({
    storage,
    entries: [{ scopedKey: "room:user-a", legacyKey: "legacy" }],
    migrationMarkerKey: "room:migrated:user-a"
  })

  assert.deepEqual(result, {
    status: "ready",
    rawValues: ["saved-room"],
    migrated: true
  })
  assert.equal(await storage.getItem("room:user-a"), "saved-room")
  assert.equal(await storage.getItem("legacy"), null)
})

test("a scoped value always wins and never reads another owner's legacy data", async () => {
  const storage = createMemoryStorage({
    "saved:user-a": "owner-a",
    legacy: "unknown-owner"
  })
  const result = await loadAccountScopedStorage({
    storage,
    entries: [{ scopedKey: "saved:user-a", legacyKey: "legacy" }],
    migrationMarkerKey: "saved:migrated:user-a"
  })

  assert.deepEqual(result, {
    status: "ready",
    rawValues: ["owner-a"],
    migrated: false
  })
  assert.equal(await storage.getItem("legacy"), "unknown-owner")
})

test("read failures retry and fail without writing fallback data", async () => {
  const writes: string[] = []
  let reads = 0
  const storage: AsyncKeyValueStorage = {
    async getItem() {
      reads += 1
      throw new Error("storage unavailable")
    },
    async setItem(key) {
      writes.push(key)
    },
    async removeItem(key) {
      writes.push(key)
    }
  }

  const result = await loadAccountScopedStorage({
    storage,
    entries: [{ scopedKey: "room:user-b", legacyKey: "legacy" }],
    migrationMarkerKey: "room:migrated:user-b"
  })

  assert.deepEqual(result, { status: "error" })
  assert.equal(reads, 2)
  assert.deepEqual(writes, [])
})

function createMemoryStorage(initial: Record<string, string>): AsyncKeyValueStorage {
  const values = new Map(Object.entries(initial))
  return {
    async getItem(key) {
      return values.get(key) ?? null
    },
    async setItem(key, value) {
      values.set(key, value)
    },
    async removeItem(key) {
      values.delete(key)
    }
  }
}
