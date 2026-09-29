import assert from "node:assert/strict"
import { createRequire, Module } from "node:module"
import test from "node:test"

// Account switching keeps per-owner caches in memory instead of clearing them.
// These tests prove that another signed-in account can never read them.
const testRequire = createRequire(__filename)
function stub(id: string, exports: unknown) {
  const path = testRequire.resolve(id)
  const module = new Module(path)
  module.filename = path
  module.loaded = true
  module.exports = exports
  testRequire.cache[path] = module
}

const storage = new Map<string, string>()
stub("react", {
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useState: () => [0, () => undefined],
  useEffect: () => undefined
})
stub("@react-native-async-storage/async-storage", {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value) },
  removeItem: async (key: string) => { storage.delete(key) },
  multiRemove: async (keys: string[]) => { for (const key of keys) storage.delete(key) }
})
stub("../../config/env", { MOBILE_HTTP_BASE_URL: "https://api.test" })

const blockStore = testRequire("../safety/blockStore") as typeof import("../safety/blockStore")
const savedConnections = testRequire("../connections/savedConnectionsStore") as typeof import("../connections/savedConnectionsStore")
const savedConnectionsPersistence = testRequire("../connections/savedConnectionsPersistence") as typeof import("../connections/savedConnectionsPersistence")
const discoveryQueries = testRequire("../discovery/discoveryQueryOptions") as typeof import("../discovery/discoveryQueryOptions")

test("a block recorded by one account is invisible to the next signed-in account", () => {
  blockStore.blockUser("account-a", "blocked-person", { persist: false })

  assert.equal(blockStore.isUserBlocked("account-a", "blocked-person"), true)
  assert.equal(blockStore.isUserBlocked("account-b", "blocked-person"), false)
})

test("pending safety reports stay with the account that filed them", () => {
  blockStore.submitReport("account-a", {
    targetUserId: "reported-person",
    reason: "harassment"
  })

  assert.equal(blockStore.getPendingReports("account-a").length, 1)
  assert.deepEqual(blockStore.getPendingReports("account-b"), [])
})

test("saved connections are persisted and read per account", async () => {
  await savedConnections.saveConnection({
    ownerUserId: "account-a",
    userId: "match-1",
    displayName: "Deniz"
  })

  assert.deepEqual(
    (await savedConnections.getSavedConnections("account-a")).map((entry) => entry.userId),
    ["match-1"]
  )
  assert.deepEqual(await savedConnections.getSavedConnections("account-b"), [])
  const accountAKeys = savedConnectionsPersistence.getSavedConnectionsStorageKeys("account-a")
  const accountBKeys = savedConnectionsPersistence.getSavedConnectionsStorageKeys("account-b")
  assert.notEqual(accountAKeys.saved, accountBKeys.saved)
  assert.ok(storage.has(accountAKeys.saved))
  assert.equal(storage.has(accountBKeys.saved), false)
})

test("discovery query caches are keyed by the signed-in account", () => {
  const filters = { ageMin: 18, ageMax: 40, genders: [], vibes: [] } as never
  const first = discoveryQueries.buildDiscoveryPageQueryKey({
    baseHttpUrl: "https://api.test", userId: "account-a", filters, cursor: undefined
  })
  const second = discoveryQueries.buildDiscoveryPageQueryKey({
    baseHttpUrl: "https://api.test", userId: "account-b", filters, cursor: undefined
  })

  assert.notDeepEqual(first, second)
  assert.ok(first.includes("account-a"))
  assert.ok(second.includes("account-b"))
})
