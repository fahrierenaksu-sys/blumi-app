import assert from "node:assert/strict"
import test from "node:test"
import {
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
