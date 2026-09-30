import assert from "node:assert/strict"
import test from "node:test"
import {
  createDiscoveryMatchCreatedReporter,
  DISCOVERY_MATCH_CREATED_MAX_IDS,
  getDiscoveryMatchCreatedStorageKey,
  type DiscoveryMatchCreatedDecision,
  type DiscoveryMatchCreatedStorage
} from "./discoveryMatchCreatedReporter"
import { getMatchCreatedProperties } from "./matchResultPresentation"

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const writes: { key: string; value: string }[] = []
  const storage: DiscoveryMatchCreatedStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push({ key, value })
      values.set(key, value)
    }
  }
  return { storage, values, writes }
}

function harness(options: {
  storage?: DiscoveryMatchCreatedStorage
  captureEnabled?: () => boolean
} = {}) {
  const memory = memoryStorage()
  const events: unknown[] = []
  const reporter = createDiscoveryMatchCreatedReporter({
    storage: options.storage ?? memory.storage,
    isCaptureEnabled: options.captureEnabled ?? (() => true),
    captureMatchCreated: (properties) => { events.push(properties) }
  })
  return { reporter, events, memory }
}

function matched(matchId: string, participants: [string, string] = ["me", "them"]): DiscoveryMatchCreatedDecision {
  // The full server match record; the reporter reads only the fields it needs.
  const match = { matchId, participantUserIds: participants, matchedAt: "2026-09-30T10:00:00.000Z" }
  return { matched: true, match }
}

const notMatched: DiscoveryMatchCreatedDecision = { matched: false, match: null }

test("a server-confirmed discovery match emits match_created once with the existing contract", async () => {
  const { reporter, events } = harness()

  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }), true)

  assert.deepEqual(events, [{ source: "discovery", mode: "production" }])
  const [properties] = events as Record<string, unknown>[]
  assert.deepEqual(Object.keys(properties).sort(), ["mode", "source"], "no new property keys")
})

test("a like the server did not confirm as a match emits nothing and stores nothing", async () => {
  const { reporter, events, memory } = harness()

  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: notMatched }), false)
  // A malformed response that claims a match without a server match record is not a match.
  assert.equal(await reporter.report({
    accountUserId: "me",
    mode: "production",
    result: { matched: true, match: null }
  }), false)
  assert.equal(await reporter.report({
    accountUserId: "me",
    mode: "production",
    result: { matched: false, match: matched("m-x").match }
  }), false)

  assert.deepEqual(events, [])
  assert.deepEqual(memory.writes, [])
})

test("a match record that does not include this account is never attributed to it", async () => {
  const { reporter, events } = harness()

  assert.equal(await reporter.report({
    accountUserId: "me",
    mode: "production",
    result: matched("m-1", ["someone", "else"])
  }), false)
  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("  ") }), false)
  assert.deepEqual(events, [])
})

test("retries of the same decision, including concurrent ones, emit once per match id", async () => {
  const { reporter, events } = harness()

  const concurrent = await Promise.all([
    reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }),
    reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") })
  ])
  const retried = await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") })

  assert.deepEqual(concurrent.filter(Boolean).length, 1)
  assert.equal(retried, false)
  assert.equal(events.length, 1)
  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-2") }), true)
  assert.equal(events.length, 2)
})

test("the dedupe survives an app restart through the persisted id set", async () => {
  const memory = memoryStorage()
  const first = harness({ storage: memory.storage })
  await first.reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") })

  const afterRestart = harness({ storage: memory.storage })
  assert.equal(await afterRestart.reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }), false)
  assert.deepEqual(afterRestart.events, [])

  // Only match ids are persisted, under an account-scoped key.
  const stored = JSON.parse(memory.values.get(getDiscoveryMatchCreatedStorageKey("me")) ?? "null")
  assert.deepEqual(stored, { version: 1, matchIds: ["m-1"] })
})

test("dedupe is per account: an account switch neither leaks nor suppresses another account's match", async () => {
  const { reporter, events, memory } = harness()

  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1", ["me", "them"]) }), true)
  // The other participant signs in on the same device: its own match is its own event.
  assert.equal(await reporter.report({ accountUserId: "them", mode: "production", result: matched("m-1", ["me", "them"]) }), true)
  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1", ["me", "them"]) }), false)
  assert.equal(await reporter.report({ accountUserId: "them", mode: "production", result: matched("m-1", ["me", "them"]) }), false)

  assert.equal(events.length, 2)
  assert.notEqual(getDiscoveryMatchCreatedStorageKey("me"), getDiscoveryMatchCreatedStorageKey("them"))
  assert.equal(memory.values.size, 2)
})

test("with analytics consent off nothing is emitted and nothing is stored", async () => {
  let consent = false
  const { reporter, events, memory } = harness({ captureEnabled: () => consent })

  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }), false)
  assert.deepEqual(events, [])
  assert.deepEqual(memory.writes, [])

  consent = true
  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-2") }), true)
  assert.deepEqual(events, [{ source: "discovery", mode: "production" }])
})

test("consent withdrawn while the id set loads suppresses the event", async () => {
  let consent = true
  let releaseRead: () => void = () => undefined
  const memory = memoryStorage()
  const { reporter, events } = harness({
    captureEnabled: () => consent,
    storage: {
      getItem: (key) => new Promise((resolveRead) => {
        releaseRead = () => { void memory.storage.getItem(key).then(resolveRead) }
      }),
      setItem: memory.storage.setItem
    }
  })

  const pending = reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") })
  consent = false
  releaseRead()
  assert.equal(await pending, false)
  assert.deepEqual(events, [])
})

test("storage failures degrade to in-memory dedupe without throwing", async () => {
  const { reporter, events } = harness({
    storage: {
      getItem: async () => { throw new Error("disk") },
      setItem: async () => { throw new Error("disk") }
    }
  })

  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }), true)
  assert.equal(await reporter.report({ accountUserId: "me", mode: "production", result: matched("m-1") }), false)
  assert.equal(events.length, 1)
})

test("corrupt stored data is ignored and the persisted set stays bounded", async () => {
  const memory = memoryStorage({ [getDiscoveryMatchCreatedStorageKey("me")]: "{not json" })
  const { reporter } = harness({ storage: memory.storage })

  for (let index = 0; index < DISCOVERY_MATCH_CREATED_MAX_IDS + 5; index += 1) {
    await reporter.report({ accountUserId: "me", mode: "production", result: matched(`m-${index}`) })
  }

  const stored = JSON.parse(memory.values.get(getDiscoveryMatchCreatedStorageKey("me")) ?? "null") as {
    matchIds: string[]
  }
  assert.equal(stored.matchIds.length, DISCOVERY_MATCH_CREATED_MAX_IDS)
  assert.equal(stored.matchIds.at(-1), `m-${DISCOVERY_MATCH_CREATED_MAX_IDS + 4}`)
  assert.equal(stored.matchIds.includes("m-0"), false, "the oldest ids are evicted first")
})

test("the mini-room path keeps its source and the MatchResult route (View match replay) still never emits", () => {
  assert.deepEqual(getMatchCreatedProperties("connection_modal", "production"), {
    source: "mini_room_mutual_save",
    mode: "production"
  })
  assert.equal(getMatchCreatedProperties("discovery_route", "production"), null)
})
