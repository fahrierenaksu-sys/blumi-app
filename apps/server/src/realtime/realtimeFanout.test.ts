import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createConnectionManager } from "./connectionManager"
import {
  createInMemoryRealtimeFanout,
  type RealtimeFanout,
  validateRealtimeFanoutMessage,
  type RealtimeFanoutMessage
} from "./realtimeFanout"

const EVENT = {
  type: "connection.matched",
  payload: {
    miniRoomId: "room_1",
    participantUserIds: ["user_1", "user_2"],
    matchedAt: "2026-07-22T10:00:00.000Z"
  }
} as unknown as ServerEvent

test("fanout close drains an ordinary asynchronous publish before unsubscribing", async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const steps: string[] = []
  const manager = createConnectionManager({ fanout: {
    async publish() { steps.push("publish-start"); await gate; steps.push("publish-end") },
    async subscribe() { return async () => { steps.push("unsubscribe") } }
  } })
  await manager.startFanout()
  manager.sendToUser("user", EVENT)
  let closed = false
  const closing = manager.closeFanout().then(() => { closed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, false)
  assert.deepEqual(steps, ["publish-start"])
  release()
  await closing
  assert.deepEqual(steps, ["publish-start", "publish-end", "unsubscribe"])
})

test("in-memory realtime fanout delivers immutable subscriptions and supports unsubscribe", async () => {
  const fanout = createInMemoryRealtimeFanout()
  const received: RealtimeFanoutMessage[] = []
  const unsubscribe = await fanout.subscribe((message) => {
    received.push(message)
  })
  const message: RealtimeFanoutMessage = {
    origin: "instance_1",
    target: { kind: "users", userIds: ["user_1", "user_2"] },
    event: EVENT
  }

  await fanout.publish(message)
  await unsubscribe()
  await fanout.publish({
    ...message,
    origin: "instance_2"
  })

  assert.equal(received.length, 1)
  assert.deepEqual(received[0], message)
  assert.notEqual(received[0], message)
})

test("in-memory realtime fanout clones nested event payloads", async () => {
  const fanout = createInMemoryRealtimeFanout()
  let received: RealtimeFanoutMessage | undefined
  await fanout.subscribe((message) => {
    received = message
    ;(message.event.payload as unknown as { miniRoomId: string }).miniRoomId = "mutated"
  })
  const message: RealtimeFanoutMessage = {
    origin: "instance_1",
    target: { kind: "user", userId: "user_1" },
    event: EVENT
  }

  await fanout.publish(message)

  assert.ok(received)
  assert.equal(
    (message.event.payload as unknown as { miniRoomId: string }).miniRoomId,
    "room_1"
  )
})

test("connection managers deliver user and room events across instances without echoing", async () => {
  const fanout = createInMemoryRealtimeFanout()
  const first = createConnectionManager({ fanout, instanceId: "instance_1" })
  const second = createConnectionManager({ fanout, instanceId: "instance_2" })
  const userSocket = createSocket()
  const roomSocket = createSocket()
  second.addConnection({
    socket: userSocket as never,
    profile: createProfile("user_2") as never
  })
  const roomConnection = second.addConnection({
    socket: roomSocket as never,
    profile: createProfile("user_3") as never
  })
  second.joinRoom(roomConnection.connectionId, "lobby")

  await first.startFanout()
  await second.startFanout()
  first.sendToUser("user_2", EVENT)
  first.broadcastRoom("lobby", EVENT)
  await Promise.resolve()

  assert.equal(userSocket.sent.length, 1)
  assert.equal(roomSocket.sent.length, 1)
  assert.equal(userSocket.sent[0], JSON.stringify(EVENT))
  assert.equal(roomSocket.sent[0], JSON.stringify(EVENT))

  await second.closeFanout()
  first.sendToUser("user_2", EVENT)
  await Promise.resolve()
  assert.equal(userSocket.sent.length, 1)
})

test("connection manager reports fanout publish failures", async () => {
  const failure = new Error("fanout unavailable")
  const errors: unknown[] = []
  const fanout: RealtimeFanout = {
    async publish() {
      throw failure
    },
    async subscribe() {
      return async () => undefined
    }
  }
  const manager = createConnectionManager({
    fanout,
    reportFanoutError: (error) => errors.push(error)
  })

  manager.sendToUser("user_1", EVENT)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(errors, [failure])
})

test("connection manager deduplicates concurrent fanout startup and closes once", async () => {
  let subscribeCalls = 0
  let resolveSubscribe: ((unsubscribe: () => Promise<void>) => void) | undefined
  let closeCalls = 0
  const fanout: RealtimeFanout = {
    async publish() {},
    async subscribe() {
      subscribeCalls += 1
      return new Promise((resolve) => {
        resolveSubscribe = resolve
      })
    }
  }
  const manager = createConnectionManager({ fanout })

  const firstStart = manager.startFanout()
  const secondStart = manager.startFanout()
  assert.equal(subscribeCalls, 1)
  resolveSubscribe?.(async () => {
    closeCalls += 1
  })
  await Promise.all([firstStart, secondStart])
  await manager.closeFanout()

  assert.equal(closeCalls, 1)
})

test("read cursor fanout cannot target a different user or a public room", () => {
  const event = { type: "chat.thread_read", payload: { userId: "a", threadId: "thread", readAt: "2026-09-05T10:00:00Z" } }
  assert.equal(validateRealtimeFanoutMessage({ origin: "one", target: { kind: "user", userId: "a" }, event }), true)
  assert.equal(validateRealtimeFanoutMessage({ origin: "one", target: { kind: "user", userId: "b" }, event }), false)
  assert.equal(validateRealtimeFanoutMessage({ origin: "one", target: { kind: "room", roomId: "public" }, event }), false)
})

test("realtime fanout validation rejects unknown or incomplete server events", () => {
  const validMessage: RealtimeFanoutMessage = {
    origin: "instance_1",
    target: { kind: "user", userId: "user_1" },
    event: EVENT
  }

  assert.equal(validateRealtimeFanoutMessage(validMessage), true)
  assert.equal(validateRealtimeFanoutMessage({
    ...validMessage,
    event: { type: "unknown.event", payload: {} }
  }), false)
  assert.equal(validateRealtimeFanoutMessage({
    ...validMessage,
    event: { type: "connection.matched" }
  }), false)
  assert.equal(validateRealtimeFanoutMessage({
    ...validMessage,
    event: { type: "connection.matched", payload: {} }
  }), false)
})

function createSocket(): {
  readyState: number
  sent: string[]
  closeCode?: number
  close(code: number): void
  send(value: string): void
} {
  return {
    readyState: 1,
    sent: [] as string[],
    close(code: number) { this.closeCode = code; this.readyState = 3 },
    send(value: string) {
      this.sent.push(value)
    }
  }
}

test("remote fanout delivery rechecks session authorization and rejects revoked families", async () => {
  const fanout = createInMemoryRealtimeFanout()
  const sender = createConnectionManager({ fanout, instanceId: "sender" })
  const recipient = createConnectionManager({ fanout, instanceId: "recipient" })
  const socket = createSocket()
  recipient.addConnection({ socket: socket as never, profile: createProfile("user_2") as never, sessionFamilyId: "family" })
  let allowed = true
  recipient.setDeliveryAuthorization(async (connection) => {
    assert.equal(connection.sessionFamilyId, "family")
    if (!allowed) connection.socket.close(4403, "Session revoked")
    return allowed
  })
  await sender.startFanout()
  await recipient.startFanout()
  try {
    sender.sendToUser("user_2", EVENT)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(socket.sent.length, 1)
    allowed = false
    sender.sendToUser("user_2", EVENT)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(socket.sent.length, 1)
    assert.equal(socket.closeCode, 4403)
  } finally {
    await sender.closeFanout()
    await recipient.closeFanout()
  }
})

test("slow outbound authorization has a bounded queue and fails closed", async () => {
  const manager = createConnectionManager()
  const socket = createSocket()
  manager.addConnection({ socket: socket as never, profile: createProfile("user_2") as never })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let checks = 0
  manager.setDeliveryAuthorization(async () => { checks += 1; await gate; return true })
  manager.sendToUser("user_2", EVENT)
  await Promise.resolve()
  for (let index = 0; index < 100; index += 1) manager.sendToUser("user_2", EVENT)
  assert.equal(checks, 1)
  assert.equal(socket.closeCode, 4429)
  release()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(socket.sent, [])
})

test("durable fanout rejects publisher failure so an outbox job can retry", async () => {
  const manager = createConnectionManager({ fanout: {
    async publish() { throw new Error("shared transport unavailable") },
    async subscribe() { return async () => {} }
  } })
  await assert.rejects(manager.sendToUsersDurably(["user_2"], EVENT), /shared transport unavailable/)
})

function createProfile(userId: string) {
  return {
    userId,
    displayName: "Mina",
    age: 24,
    bio: "",
    distanceLabel: "Nearby",
    vibeTags: [],
    signals: [],
    avatar: { presetId: "dusk" }
  }
}
