import assert from "node:assert/strict"
import test from "node:test"
import { requestAccountReauthTarget } from "./accountReauthPhone"
import {
  createPendingPhoneChangeSessionWatcher,
  createPendingPhoneChangeStore,
  PENDING_PHONE_CHANGE_CONFIRMABLE_MS,
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

test("past its TTL the record is still offered for the server to confirm, but not past the confirmable age", async () => {
  const store = memoryStore()
  let nowMs = 1_000
  const pending = createPendingPhoneChangeStore(store, () => nowMs)
  await pending.remember("user-fake-1", FAKE_PHONE)
  nowMs += PENDING_PHONE_CHANGE_TTL_MS

  assert.equal(await pending.readOrigin("user-fake-1", { pastTtl: true }), FAKE_PHONE)
  assert.equal(await pending.readOrigin("user-fake-2", { pastTtl: true }), null, "never another user's")
  await pending.remember("user-fake-1", FAKE_PHONE)
  nowMs += PENDING_PHONE_CHANGE_CONFIRMABLE_MS
  assert.equal(await pending.readOrigin("user-fake-1", { pastTtl: true }), null)
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

/** Like the server: names the account phone only back to a client that sent it. */
function fakeServer(accountPhone: string | null) {
  const sent: Array<string | undefined> = []
  return {
    sent,
    requestChallenge: async (knownPhone: string | undefined) => {
      sent.push(knownPhone)
      const challenge = { challengeId: `fake-challenge-${sent.length}`, expiresAt: "2999-01-01T00:05:00.000Z" }
      if (accountPhone === null) return challenge // an older server
      return knownPhone === accountPhone
        ? { ...challenge, targetPhoneNumber: accountPhone }
        : { ...challenge, targetPhoneNumberWithheld: true as const }
    }
  }
}

test("re-authentication texts the phone the server confirms and drops a saved original it disagrees with", async () => {
  const store = memoryStore()
  const pending = createPendingPhoneChangeStore(store)
  await pending.remember("user-fake-1", FAKE_PHONE)
  const server = fakeServer(FAKE_NEW_PHONE)

  const target = await requestAccountReauthTarget({
    userId: "user-fake-1", pending, firebasePhone: () => FAKE_NEW_PHONE, requestChallenge: server.requestChallenge
  })

  assert.equal(target.phoneNumber, FAKE_NEW_PHONE)
  assert.equal(target.challenge.challengeId, "fake-challenge-2", "the confirmed challenge is the one used")
  assert.deepEqual(server.sent, [FAKE_PHONE, FAKE_NEW_PHONE])
  assert.equal(store.values.size, 0, "the change landed, so the saved original is stale")
})

test("a saved original that the server confirms is kept while the change is still open", async () => {
  const store = memoryStore()
  const pending = createPendingPhoneChangeStore(store)
  await pending.remember("user-fake-1", FAKE_PHONE)
  const server = fakeServer(FAKE_PHONE)

  const target = await requestAccountReauthTarget({
    userId: "user-fake-1", pending, firebasePhone: () => FAKE_NEW_PHONE, requestChallenge: server.requestChallenge
  })

  assert.equal(target.phoneNumber, FAKE_PHONE, "never Firebase's new phone while the account kept the old one")
  assert.deepEqual(server.sent, [FAKE_PHONE])
  assert.equal(store.values.size, 1)
})

test("a phone verified earlier in the flow is offered first", async () => {
  const pending = createPendingPhoneChangeStore(memoryStore())
  const server = fakeServer(FAKE_PHONE)

  const target = await requestAccountReauthTarget({
    userId: "user-fake-1", pending, verifiedPhone: FAKE_PHONE, firebasePhone: () => FAKE_NEW_PHONE,
    requestChallenge: server.requestChallenge
  })

  assert.equal(target.phoneNumber, FAKE_PHONE)
  assert.deepEqual(server.sent, [FAKE_PHONE])
})

test("with no phone the server confirms, none is used and nothing is guessed", async () => {
  const pending = createPendingPhoneChangeStore(memoryStore())
  const server = fakeServer(FAKE_PHONE)

  const isSignInRequired = (error: unknown) => (error as { code?: string }).code === "reauth_sign_in_required"
  await assert.rejects(
    requestAccountReauthTarget({
      userId: "user-fake-1", pending, firebasePhone: () => null, requestChallenge: server.requestChallenge
    }),
    isSignInRequired
  )
  await assert.rejects(
    requestAccountReauthTarget({
      userId: "user-fake-1", pending, firebasePhone: () => FAKE_NEW_PHONE, requestChallenge: server.requestChallenge
    }),
    isSignInRequired
  )

  assert.deepEqual(server.sent, [undefined, FAKE_NEW_PHONE], "only phones the device already holds are sent")
})

test("an older server that names no phone falls back to the saved original within its TTL, then Firebase", async () => {
  const store = memoryStore()
  let nowMs = 1_000
  const pending = createPendingPhoneChangeStore(store, () => nowMs)
  const server = fakeServer(null)
  const resolve = async () => (await requestAccountReauthTarget({
    userId: "user-fake-1", pending, firebasePhone: () => FAKE_NEW_PHONE, requestChallenge: server.requestChallenge
  })).phoneNumber
  assert.equal(await resolve(), FAKE_NEW_PHONE)
  await pending.remember("user-fake-1", FAKE_PHONE)
  assert.equal(await resolve(), FAKE_PHONE)
  nowMs += PENDING_PHONE_CHANGE_TTL_MS
  assert.equal(await resolve(), FAKE_NEW_PHONE, "an unconfirmed original past its TTL is never texted")
})
