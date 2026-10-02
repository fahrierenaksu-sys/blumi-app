import assert from "node:assert/strict"
import test from "node:test"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { createSafetyService } from "../safety/safetyService"
import {
  createChatMessageDeliveryService,
  MAX_CHAT_DELIVERY_ATTEMPTS,
  TRANSIENT_RETRY_HORIZON_MS,
  type ChatDeliveryDeadLetter
} from "./chatMessageDeliveryService"
import { createChatService } from "./chatService"

async function fixture(poisonMessageId: string) {
  const ids = ["message_poison", "message_after"]
  const chatService = createChatService({ idFactory: () => ids.shift()! })
  await chatService.createThread({
    threadId: "thread_private",
    miniRoomId: "room_private",
    participantUserIds: ["user_sender", "user_recipient"],
    participants: [
      { userId: "user_sender", displayName: "Ada" },
      { userId: "user_recipient", displayName: "Bora" }
    ]
  })
  const delivered: string[] = []
  const pushed: string[] = []
  const deadLetters: ChatDeliveryDeadLetter[] = []
  let failures = 0
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_users: string[], event: { payload: { messageId: string } }) {
        if (event.payload.messageId === poisonMessageId) {
          failures += 1
          throw new TypeError("private body secret words")
        }
        delivered.push(event.payload.messageId)
      },
      hasUserConnections: () => false
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser(_userId: string, push: { data: { messageId: string } }) { pushed.push(push.data.messageId) }
    } as unknown as NotificationService,
    reportError: () => {},
    reportDeadLetter: (event) => { deadLetters.push(event) }
  })
  return { chatService, delivery, delivered, pushed, deadLetters, failures: () => failures }
}

async function settle() {
  for (let index = 0; index < 5; index += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

test("a message that keeps failing is dead-lettered and stops holding its thread back", async () => {
  const { delivery, delivered, pushed, deadLetters, failures } = await fixture("message_poison")
  await delivery.sendMessage({ senderUserId: "user_sender", threadId: "thread_private", body: "private body secret words" })
  await delivery.sendMessage({ senderUserId: "user_sender", threadId: "thread_private", body: "the next one" })
  await settle()
  // The live fan-out goes ahead of the outbox, so open sockets already have
  // the later message; its outbox job (push) waits behind the failing one.
  assert.deepEqual(delivered, ["message_after"])
  assert.equal(pushed.length, 0, "the later outbox job waits behind the failing one")

  let clock = Date.now()
  for (let round = 0; round < MAX_CHAT_DELIVERY_ATTEMPTS + 3 && !pushed.includes("message_after"); round += 1) {
    clock += 61_000
    await delivery.dispatchDue(new Date(clock))
    await settle()
  }
  assert.equal(failures(), MAX_CHAT_DELIVERY_ATTEMPTS)
  // The outbox worker fans the later message out again when its own job runs
  // after the dead letter; clients merge by message ID, so that is harmless.
  assert.deepEqual([...new Set(delivered)], ["message_after"], "the poison message never reaches a socket")
  assert.deepEqual(pushed, ["message_after"])
  assert.deepEqual(deadLetters, [{ reason: "attempts_exhausted", attempts: MAX_CHAT_DELIVERY_ATTEMPTS, errorKind: "TypeError", count: 1 }])

  // Terminal: never claimed again.
  await delivery.dispatchDue(new Date(clock + 3_600_000))
  await settle()
  assert.equal(failures(), MAX_CHAT_DELIVERY_ATTEMPTS)
})

test("a job whose lease keeps running out is dead-lettered on its next claim", async () => {
  const { chatService, delivery, deadLetters } = await fixture("none")
  await chatService.sendMessage("user_sender", "thread_private", "stuck")
  // Each claim without completion stands for a dispatcher that died mid-delivery.
  let clock = Date.now()
  for (let attempt = 0; attempt < MAX_CHAT_DELIVERY_ATTEMPTS; attempt += 1) {
    clock += 31_000
    assert.equal((await chatService.repository.claimDeliveries({ now: new Date(clock), limit: 10, leaseMs: 30_000 })).length, 1)
  }
  clock += 31_000
  await delivery.dispatchDue(new Date(clock))
  await settle()
  assert.deepEqual(deadLetters, [{ reason: "lease_exhausted", attempts: MAX_CHAT_DELIVERY_ATTEMPTS + 1, errorKind: "LeaseExpired", count: 1 }])
  assert.deepEqual(await chatService.repository.claimDeliveries({ now: new Date(clock + 3_600_000), limit: 10, leaseMs: 30_000 }), [])
})

test("the default dead-letter log line carries no IDs or message text", async (t) => {
  const lines: string[] = []
  t.mock.method(console, "error", (line: unknown) => { lines.push(String(line)) })
  const ids = ["message_poison"]
  const chatService = createChatService({ idFactory: () => ids.shift()! })
  await chatService.createThread({
    threadId: "thread_private", miniRoomId: "room_private",
    participantUserIds: ["user_sender", "user_recipient"],
    participants: [{ userId: "user_sender", displayName: "Ada" }, { userId: "user_recipient", displayName: "Bora" }]
  })
  await chatService.sendMessage("user_sender", "thread_private", "private body secret words")
  const delivery = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(),
    connectionManager: { async sendToUsersDurably() { throw new Error("private body secret words") }, hasUserConnections: () => false } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  let clock = Date.now()
  for (let round = 0; round < MAX_CHAT_DELIVERY_ATTEMPTS + 1; round += 1) {
    clock += 61_000
    await delivery.dispatchDue(new Date(clock))
    await settle()
  }
  const metric = lines.filter((line) => line.includes("chat_delivery_dead_letter"))
  assert.equal(metric.length, 1)
  assert.deepEqual(JSON.parse(metric[0]!), { metric: "chat_delivery_dead_letter", reason: "attempts_exhausted",
    attempts: MAX_CHAT_DELIVERY_ATTEMPTS, errorKind: "Error", count: 1 })
  for (const secret of ["message_poison", "thread_private", "user_sender", "user_recipient", "private body"]) {
    assert.equal(lines.join("\n").includes(secret), false, secret)
  }
})

async function outageFixture() {
  const ids = ["message_in_outage"]
  const chatService = createChatService({ idFactory: () => ids.shift()! })
  await chatService.createThread({
    threadId: "thread_private", miniRoomId: "room_private",
    participantUserIds: ["user_sender", "user_recipient"],
    participants: [{ userId: "user_sender", displayName: "Ada" }, { userId: "user_recipient", displayName: "Bora" }]
  })
  await chatService.sendMessage("user_sender", "thread_private", "sent during an outage")
  const state = { outage: true, failures: 0, pushed: [] as string[], deadLetters: [] as ChatDeliveryDeadLetter[] }
  const delivery = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably() {
        if (!state.outage) return
        state.failures += 1
        // node-postgres when the pool cannot hand out a connection in time.
        throw new Error("timeout exceeded when trying to connect")
      },
      hasUserConnections: () => false
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser(_userId: string, push: { data: { messageId: string } }) { state.pushed.push(push.data.messageId) }
    } as unknown as NotificationService,
    reportError: () => {},
    reportDeadLetter: (event) => { state.deadLetters.push(event) }
  })
  return { delivery, state }
}

test("a transient outage longer than the attempt budget does not dead-letter its messages", async () => {
  const { delivery, state } = await outageFixture()
  let clock = Date.now()
  for (let round = 0; round < MAX_CHAT_DELIVERY_ATTEMPTS * 2; round += 1) {
    clock += 61_000
    await delivery.dispatchDue(new Date(clock))
    await settle()
  }
  assert.ok(state.failures > MAX_CHAT_DELIVERY_ATTEMPTS)
  assert.deepEqual(state.deadLetters, [])
  state.outage = false
  clock += 61_000
  await delivery.dispatchDue(new Date(clock))
  await settle()
  assert.deepEqual(state.pushed, ["message_in_outage"])
})

test("transient failures count again past the retry horizon, so nothing retries forever", async () => {
  const { delivery, state } = await outageFixture()
  let clock = Date.now() + TRANSIENT_RETRY_HORIZON_MS
  for (let round = 0; round < MAX_CHAT_DELIVERY_ATTEMPTS + 1; round += 1) {
    clock += 61_000
    await delivery.dispatchDue(new Date(clock))
    await settle()
  }
  assert.equal(state.failures, MAX_CHAT_DELIVERY_ATTEMPTS)
  assert.deepEqual(state.deadLetters, [{ reason: "attempts_exhausted", attempts: MAX_CHAT_DELIVERY_ATTEMPTS, errorKind: "Error", count: 1 }])
  assert.deepEqual(state.pushed, [])
})
