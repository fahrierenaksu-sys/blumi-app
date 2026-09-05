import assert from "node:assert/strict"
import test from "node:test"
import {
  flushPendingConnectionDecisions,
  queueConnectionDecision,
  type ConnectionDecisionOutboxStorage
} from "./connectionDecisionOutbox"

function createStorage(initial: Record<string, string> = {}): ConnectionDecisionOutboxStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    async getItem(key) { return values.get(key) ?? null },
    async setItem(key, value) { values.set(key, value) },
    async removeItem(key) { values.delete(key) }
  }
}

test("connection decisions persist per account and replace only the same room intent", async () => {
  const storage = createStorage()
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_a", partnerUserId: "bora", status: "saved" })
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_a", partnerUserId: "bora", status: "passed" })
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_b", partnerUserId: "cora", status: "saved" })
  const delivered: string[] = []
  await flushPendingConnectionDecisions(storage, "ada", async (intent) => { delivered.push(`${intent.miniRoomId}:${intent.status}`) })
  assert.deepEqual(delivered, ["room_a:passed", "room_b:saved"])
})

test("a failed durable delivery stays queued and another account cannot flush it", async () => {
  const storage = createStorage()
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_a", partnerUserId: "bora", status: "saved" })
  await flushPendingConnectionDecisions(storage, "bora", async () => { throw new Error("must not run") })
  const first = await flushPendingConnectionDecisions(storage, "ada", async () => { throw new Error("offline") })
  assert.equal(first.delivered, 0)
  assert.equal(first.pending, 1)
  const second = await flushPendingConnectionDecisions(storage, "ada", async () => undefined)
  assert.deepEqual(second, { delivered: 1, pending: 0, rejectedMiniRoomIds: [] })
})

test("corrupt or foreign persisted intents are discarded without delivering them", async () => {
  const storage = createStorage({
    "@blumi/connectionDecisionOutbox/v1:ada": JSON.stringify([
      { actorUserId: "bora", miniRoomId: "room_foreign", partnerUserId: "ada", status: "saved", queuedAt: "2026-07-22T12:00:00.000Z" },
      { actorUserId: "ada", miniRoomId: "", partnerUserId: "bora", status: "saved", queuedAt: "2026-07-22T12:00:00.000Z" },
      { actorUserId: "ada", miniRoomId: "room_invalid", partnerUserId: "bora", status: "later", queuedAt: "2026-07-22T12:00:00.000Z" },
      { actorUserId: "ada", miniRoomId: "room_bad_date", partnerUserId: "bora", status: "saved", queuedAt: "not-a-date" }
    ])
  })
  const result = await flushPendingConnectionDecisions(storage, "ada", async () => {
    throw new Error("invalid data must not deliver")
  })
  assert.deepEqual(result, { delivered: 0, pending: 0, rejectedMiniRoomIds: [] })
  assert.equal(storage.values.has("@blumi/connectionDecisionOutbox/v1:ada"), false)
})

test("invalid owners and decision statuses fail before writing a queue entry", async () => {
  const storage = createStorage()
  await assert.rejects(
    queueConnectionDecision(storage, {
      actorUserId: " ",
      miniRoomId: "room_a",
      partnerUserId: "bora",
      status: "saved"
    })
  )
  await assert.rejects(
    queueConnectionDecision(storage, {
      actorUserId: "ada",
      miniRoomId: "room_a",
      partnerUserId: "bora",
      status: "later" as never
    })
  )
  assert.equal(storage.values.size, 0)
})

test("a terminal delivery rejection is removed while transient failures remain queued", async () => {
  const storage = createStorage()
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_retry", partnerUserId: "bora", status: "saved" })
  await queueConnectionDecision(storage, { actorUserId: "ada", miniRoomId: "room_terminal", partnerUserId: "cora", status: "passed" })
  const result = await flushPendingConnectionDecisions(
    storage,
    "ada",
    async (intent) => {
      throw new Error(intent.miniRoomId)
    },
    (error) => error instanceof Error && error.message !== "room_terminal"
  )
  assert.deepEqual(result, { delivered: 0, pending: 1, rejectedMiniRoomIds: ["room_terminal"] })
  const delivered: string[] = []
  await flushPendingConnectionDecisions(storage, "ada", async (intent) => {
    delivered.push(intent.miniRoomId)
  })
  assert.deepEqual(delivered, ["room_retry"])
})
