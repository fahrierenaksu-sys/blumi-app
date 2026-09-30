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
  useEffect: () => undefined,
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot()
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
const discoveryApi = testRequire("../discovery/discoveryApi") as typeof import("../discovery/discoveryApi")
const chatStore = testRequire("../chat/chatStore") as typeof import("../chat/chatStore")
const sessionRefresh = testRequire("./sessionRefresh") as typeof import("./sessionRefresh")

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

test("discovery watch and room-showcase caches are keyed by the signed-in account", () => {
  const scope = (userId: string) => ({ baseHttpUrl: "https://api.test", userId, sessionToken: `token-${userId}` }) as never
  assert.notDeepEqual(
    discoveryQueries.buildDiscoveryWatchQueryKey(scope("account-a")),
    discoveryQueries.buildDiscoveryWatchQueryKey(scope("account-b"))
  )
  const showcase = (viewerUserId: string) => discoveryApi.buildDiscoveryRoomShowcaseQueryKey({
    baseHttpUrl: "https://api.test", viewerUserId, candidateUserId: "candidate-1", authorizationId: 1
  })
  assert.notDeepEqual(showcase("account-a"), showcase("account-b"))
  assert.ok((showcase("account-a") as readonly unknown[]).includes("account-a"))
})

test("the chat reset run on sign-out leaves no threads, messages, unsent drafts or unread counts for the next account", () => {
  chatStore.applyChatThreadListed({
    userId: "account-a",
    threads: [{
      threadId: "thread-a",
      miniRoomId: "room-a",
      participantUserIds: ["account-a", "partner-a"],
      participants: [
        { userId: "account-a", displayName: "Ada" },
        { userId: "partner-a", displayName: "Deniz" }
      ],
      createdAt: "2026-09-30T10:00:00.000Z",
      unreadCount: 3
    }]
  } as never)
  const pending = chatStore.addOptimisticMessage({
    threadId: "thread-a",
    senderUserId: "account-a",
    body: "private draft of account a",
    clientMessageId: "client-a-1"
  })
  assert.equal(chatStore.getThreads().length, 1)
  assert.ok(chatStore.getRetryableMessage(pending.localMessageId))

  chatStore.resetChatStore()

  assert.deepEqual(chatStore.getThreads(), [])
  assert.deepEqual(chatStore.getMessages("thread-a"), [])
  assert.equal(chatStore.getRetryableMessage(pending.localMessageId), null)
  assert.equal(chatStore.getTotalUnreadCount(), 0)
  assert.equal(chatStore.hasThreadsFetched(), false)
})

test("a refresh started for one account is never handed to, or kept after sign-out for, the next account", async () => {
  const actor = (userId: string) => ({
    session: { mode: "production", userId, accountId: `acc-${userId}`, sessionId: `s-${userId}`, sessionToken: `t-${userId}`, expiresAt: "2026-10-30T00:00:00.000Z" },
    profile: { userId, displayName: userId }
  }) as never
  let release: (value: unknown) => void = () => undefined
  const coordinator = sessionRefresh.createSessionRefreshCoordinator(() =>
    new Promise((resolve) => { release = resolve }) as never)
  const first = coordinator.refresh(actor("account-a"))
  await assert.rejects(coordinator.refresh(actor("account-b")), /refresh your session safely/)
  const cancelled = coordinator.cancelAndWait()
  release(actor("account-a"))
  await cancelled
  await assert.rejects(first, (error: unknown) => sessionRefresh.isSessionRefreshCancelled(error))
})
