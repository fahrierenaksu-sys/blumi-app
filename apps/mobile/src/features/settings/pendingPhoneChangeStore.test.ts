import assert from "node:assert/strict"
import test from "node:test"
import { resolveAccountReauthPhone } from "./accountReauthPhone"
import {
  createPendingPhoneChangeSessionWatcher,
  createPendingPhoneChangeStore,
  PENDING_PHONE_CHANGE_STORAGE_KEY,
  PENDING_PHONE_CHANGE_TTL_MS,
  type PendingPhoneChangeKeyValueStore
} from "./pendingPhoneChangeStore"

const FAKE_PHONE = "+900000000001"

function memoryStore(): PendingPhoneChangeKeyValueStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value) },
    removeItem: async (key) => { values.delete(key) }
  }
}

test("the original phone is returned only to the user who started the change", async () => {
  const store = memoryStore()
  const pending = createPendingPhoneChangeStore(store)
  await pending.remember("user-fake-1", FAKE_PHONE)

  assert.equal(await pending.readOrigin("user-fake-1"), FAKE_PHONE)
  assert.equal(await pending.readOrigin("user-fake-2"), null, "an account switch does not inherit it")
  assert.equal(store.values.has(PENDING_PHONE_CHANGE_STORAGE_KEY), false, "and the other user's record is dropped")
})

test("an expired or malformed record is dropped", async () => {
  const store = memoryStore()
  let nowMs = 1_000
  const pending = createPendingPhoneChangeStore(store, () => nowMs)
  await pending.remember("user-fake-1", FAKE_PHONE)
  nowMs += PENDING_PHONE_CHANGE_TTL_MS

  assert.equal(await pending.readOrigin("user-fake-1"), null)
  assert.equal(store.values.size, 0)

  store.values.set(PENDING_PHONE_CHANGE_STORAGE_KEY, "{not json")
  assert.equal(await pending.readOrigin("user-fake-1"), null)
  assert.equal(store.values.size, 0)
})

test("unavailable secure storage never breaks the flow and never logs the number", async () => {
  const failing: PendingPhoneChangeKeyValueStore = {
    getItem: async () => { throw new Error(`keychain error ${FAKE_PHONE}`) },
    setItem: async () => { throw new Error(`keychain error ${FAKE_PHONE}`) },
    removeItem: async () => { throw new Error(`keychain error ${FAKE_PHONE}`) }
  }
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    const pending = createPendingPhoneChangeStore(failing)
    await pending.remember("user-fake-1", FAKE_PHONE)
    assert.equal(await pending.readOrigin("user-fake-1"), null)
    await pending.clear()
  } finally {
    console.warn = originalWarn
  }
  assert.ok(warnings.length > 0)
  assert.doesNotMatch(warnings.join("\n"), /\+?900000000001|user-fake-1|keychain/)
})

const FAKE_NEW_PHONE = "+900000000002"

test("restoring the stored session at start-up keeps the record; every later session change drops it", () => {
  let clears = 0
  const watcher = createPendingPhoneChangeSessionWatcher(async () => { clears += 1 })
  watcher.observe(null, false) // still restoring
  watcher.observe("user-fake-1", true) // stored session restored
  assert.equal(clears, 0)
  watcher.observe("user-fake-1", true)
  assert.equal(clears, 0, "a re-render of the same session keeps it")
  watcher.observe(null, true) // sign-out or forced reset
  assert.equal(clears, 1)
  watcher.observe("user-fake-1", true) // a new sign-in
  assert.equal(clears, 2)
  watcher.observe("user-fake-2", true) // another account
  assert.equal(clears, 3)
})

test("a start-up whose stored session was refused still drops the record at the next sign-in", () => {
  let clears = 0
  const watcher = createPendingPhoneChangeSessionWatcher(async () => { clears += 1 })
  watcher.observe(null, true) // the restored session was refused (401) before it was published
  watcher.observe("user-fake-1", true)
  assert.equal(clears, 1)
})

test("re-authentication texts the phone the server names and drops a saved original it disagrees with", async () => {
  const store = memoryStore()
  const pending = createPendingPhoneChangeStore(store)
  await pending.remember("user-fake-1", FAKE_PHONE)

  const phone = await resolveAccountReauthPhone({
    userId: "user-fake-1", serverPhone: FAKE_NEW_PHONE, pending, firebasePhone: () => FAKE_PHONE
  })

  assert.equal(phone, FAKE_NEW_PHONE)
  assert.equal(store.values.size, 0, "the change landed, so the saved original is stale")
})

test("a saved original that matches the server is kept while the change is still open", async () => {
  const store = memoryStore()
  const pending = createPendingPhoneChangeStore(store)
  await pending.remember("user-fake-1", FAKE_PHONE)

  const phone = await resolveAccountReauthPhone({
    userId: "user-fake-1", serverPhone: FAKE_PHONE, pending, firebasePhone: () => FAKE_NEW_PHONE
  })

  assert.equal(phone, FAKE_PHONE, "never Firebase's new phone while the account kept the old one")
  assert.equal(store.values.size, 1)
})

test("an older server that names no phone falls back to the saved original, then Firebase", async () => {
  const pending = createPendingPhoneChangeStore(memoryStore())
  const resolve = () => resolveAccountReauthPhone({
    userId: "user-fake-1", serverPhone: undefined, pending, firebasePhone: () => FAKE_NEW_PHONE
  })
  assert.equal(await resolve(), FAKE_NEW_PHONE)
  await pending.remember("user-fake-1", FAKE_PHONE)
  assert.equal(await resolve(), FAKE_PHONE)
})
