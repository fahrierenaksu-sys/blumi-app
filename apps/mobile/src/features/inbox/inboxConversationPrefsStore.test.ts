import assert from "node:assert/strict"
import { createRequire, Module } from "node:module"
import test from "node:test"

const testRequire = createRequire(__filename)
const storage = new Map<string, string>()
let failReads = false
const asyncStoragePath = testRequire.resolve("@react-native-async-storage/async-storage")
const asyncStorageModule = new Module(asyncStoragePath)
asyncStorageModule.filename = asyncStoragePath
asyncStorageModule.loaded = true
asyncStorageModule.exports = {
  getItem: async (key: string) => {
    if (failReads) throw new Error("storage unavailable")
    return storage.get(key) ?? null
  },
  setItem: async (key: string, value: string) => { storage.set(key, value) },
  removeItem: async (key: string) => { storage.delete(key) }
}
testRequire.cache[asyncStoragePath] = asyncStorageModule

const store = testRequire("./inboxConversationPrefsStore") as typeof import("./inboxConversationPrefsStore")
const model = testRequire("./inboxConversationPrefsModel") as typeof import("./inboxConversationPrefsModel")
const flush = () => new Promise((resolve) => setImmediate(resolve))
const NOW = new Date("2026-10-02T11:00:00.000Z")

test("pins are stored and read per account; another account on the phone never sees them", async () => {
  storage.clear()
  store.resetInboxConversationPrefsForTests()
  await store.hydrateInboxConversationPrefs("account-a")
  await store.hydrateInboxConversationPrefs("account-b")
  store.updateInboxConversationPrefs("account-a", (prefs) => model.pinConversation(prefs, "thread-1", NOW))
  await flush()
  assert.equal(model.isConversationPinned(store.getInboxConversationPrefs("account-a"), "thread-1"), true)
  assert.equal(model.isConversationPinned(store.getInboxConversationPrefs("account-b"), "thread-1"), false)
  const keyA = store.getInboxConversationPrefsStorageKey("account-a")
  assert.ok(storage.has(keyA))
  assert.equal(storage.has(store.getInboxConversationPrefsStorageKey("account-b")), false)
  assert.notEqual(keyA, store.getInboxConversationPrefsStorageKey("account-b"))

  // A fresh launch reads them back for the same account only.
  store.resetInboxConversationPrefsForTests()
  await store.hydrateInboxConversationPrefs("account-a")
  await store.hydrateInboxConversationPrefs("account-b")
  assert.equal(model.isConversationPinned(store.getInboxConversationPrefs("account-a"), "thread-1"), true)
  assert.equal(model.isConversationPinned(store.getInboxConversationPrefs("account-b"), "thread-1"), false)
})

test("a change made before the stored value loads is kept on top of it", async () => {
  storage.clear()
  store.resetInboxConversationPrefsForTests()
  storage.set(store.getInboxConversationPrefsStorageKey("account-a"), model.serializeInboxConversationPrefs(
    model.pinConversation(model.EMPTY_INBOX_CONVERSATION_PREFS, "stored", NOW)
  ))
  store.updateInboxConversationPrefs("account-a", (prefs) => model.deleteConversationForMe(prefs, {
    threadId: "early", createdAt: "2026-10-02T09:00:00.000Z"
  }))
  await store.hydrateInboxConversationPrefs("account-a")
  await flush()
  const prefs = store.getInboxConversationPrefs("account-a")
  assert.equal(model.isConversationPinned(prefs, "stored"), true)
  assert.equal(prefs.deletedThrough.early, "2026-10-02T09:00:00.000Z")
  assert.deepEqual(model.parseInboxConversationPrefs(storage.get(store.getInboxConversationPrefsStorageKey("account-a")) ?? null), prefs)
})

test("unreadable storage starts empty and still keeps this session's changes", async () => {
  storage.clear()
  store.resetInboxConversationPrefsForTests()
  failReads = true
  try {
    await store.hydrateInboxConversationPrefs("account-a")
  } finally {
    failReads = false
  }
  let notified = 0
  const unsubscribe = store.subscribeToInboxConversationPrefs("account-a", () => { notified += 1 })
  store.updateInboxConversationPrefs("account-a", (prefs) => model.pinConversation(prefs, "thread-9", NOW))
  unsubscribe()
  assert.equal(notified, 1)
  assert.equal(model.isConversationPinned(store.getInboxConversationPrefs("account-a"), "thread-9"), true)
  assert.throws(() => store.getInboxConversationPrefsStorageKey("  "), /owner is required/)
})
