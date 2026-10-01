import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import {
  createConnectionManager,
  REALTIME_OUTBOUND_HARD_LIMIT_BYTES,
  REALTIME_OUTBOUND_SOFT_LIMIT_BYTES,
  REALTIME_OUTBOUND_SUSTAINED_MS,
  REALTIME_SLOW_CONSUMER_CLOSE_CODE
} from "./connectionManager"
import {
  MAX_REALTIME_FANOUT_USER_TARGETS,
  splitRealtimeFanoutTarget,
  validateRealtimeFanoutMessage,
  type RealtimeFanout,
  type RealtimeFanoutHandler,
  type RealtimeFanoutMessage
} from "./realtimeFanout"
import { createPostgresRealtimeFanout } from "../db/postgresRealtimeFanout"

const CHAT_EVENT = {
  type: "chat.message_received",
  payload: {
    messageId: "message_1",
    threadId: "thread_1",
    senderUserId: "user_sender",
    body: "hello",
    sentAt: "2026-09-30T10:00:00.000Z"
  }
} as unknown as ServerEvent

const PRESENCE_EVENT = {
  type: "presence.nearby",
  payload: { roomId: "room_1", userId: "user_sender", nearbyUsers: [] }
} as unknown as ServerEvent

const REACTION_EVENT = {
  type: "reaction.received",
  payload: { roomId: "room_1", actorUserId: "user_sender", reaction: "wave", createdAt: "2026-09-30T10:00:00.000Z" }
} as unknown as ServerEvent

function createSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as string[],
    closes: [] as number[],
    terminated: 0,
    send(value: string) { this.sent.push(value) },
    close(code: number) { this.closes.push(code); this.readyState = 2 },
    terminate() { this.terminated += 1; this.readyState = 3 }
  }
}

function createProfile(userId: string): UserProfile {
  return {
    userId,
    displayName: userId,
    avatar: { avatarId: `avatar_${userId}`, presetId: "starter" }
  } as unknown as UserProfile
}

function sentTypes(socket: ReturnType<typeof createSocket>): string[] {
  return socket.sent.map((value) => (JSON.parse(value) as ServerEvent).type)
}

test("the default slow-consumer limits are ordered and bounded", () => {
  assert.ok(REALTIME_OUTBOUND_SOFT_LIMIT_BYTES < REALTIME_OUTBOUND_HARD_LIMIT_BYTES)
  assert.ok(REALTIME_OUTBOUND_HARD_LIMIT_BYTES <= 4 * 1024 * 1024)
  assert.ok(REALTIME_OUTBOUND_SUSTAINED_MS > 0)
  assert.equal(REALTIME_SLOW_CONSUMER_CLOSE_CODE, 1013)
})

test("a backed-up socket sheds transient events but still receives chat delivery", () => {
  const manager = createConnectionManager()
  const socket = createSocket()
  manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })

  socket.bufferedAmount = REALTIME_OUTBOUND_SOFT_LIMIT_BYTES + 1
  manager.sendToUser("user_a", PRESENCE_EVENT)
  manager.sendToUser("user_a", REACTION_EVENT)
  manager.sendToUser("user_a", CHAT_EVENT)
  assert.deepEqual(sentTypes(socket), ["chat.message_received"])
  assert.deepEqual(socket.closes, [])

  socket.bufferedAmount = 0
  manager.sendToUser("user_a", PRESENCE_EVENT)
  assert.deepEqual(sentTypes(socket), ["chat.message_received", "presence.nearby"])
})

test("a backed-up socket sheds superseded avatar steps but keeps the authoritative room snapshot", () => {
  const manager = createConnectionManager()
  const socket = createSocket()
  const connection = manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })
  const avatar = { userId: "user_a", x: .5, y: .7, present: true, revision: 2 }
  const moved = { type: "mini_room.avatar_moved", payload: { miniRoomId: "room", epoch: "e",
    participantUserIds: ["user_a", "user_b"], avatar } } as ServerEvent
  const snapshot = { type: "mini_room.motion_snapshot", payload: { miniRoomId: "room", epoch: "e",
    participantUserIds: ["user_a", "user_b"], avatars: [avatar, { ...avatar, userId: "user_b" }] } } as ServerEvent
  socket.bufferedAmount = REALTIME_OUTBOUND_SOFT_LIMIT_BYTES + 1
  manager.sendToConnection(connection.connectionId, moved)
  manager.sendToConnection(connection.connectionId, snapshot)
  assert.deepEqual(sentTypes(socket), ["mini_room.motion_snapshot"])
})

test("a backed-up socket sheds cumulative receipt updates before chat delivery", () => {
  const manager = createConnectionManager()
  const socket = createSocket()
  manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })
  const receipt = {
    type: "chat.receipt_updated",
    payload: {
      threadId: "thread_1",
      userId: "user_sender",
      participantUserIds: ["user_a", "user_sender"],
      deliveredUpTo: { sentAt: "2026-09-30T10:00:00.000Z", messageId: "message_1" }
    }
  } as unknown as ServerEvent

  socket.bufferedAmount = REALTIME_OUTBOUND_SOFT_LIMIT_BYTES + 1
  manager.sendToUser("user_a", receipt)
  manager.sendToUser("user_a", CHAT_EVENT)
  assert.deepEqual(sentTypes(socket), ["chat.message_received"])

  socket.bufferedAmount = 0
  manager.sendToUser("user_a", receipt)
  assert.deepEqual(sentTypes(socket), ["chat.message_received", "chat.receipt_updated"])
})

test("a socket that stays above the soft limit for the sustained window is closed with 1013 and terminated", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  let clock = 0
  const manager = createConnectionManager({
    now: () => clock,
    outboundBuffer: { softLimitBytes: 100, hardLimitBytes: 1_000, sustainedMs: 5_000 }
  })
  const socket = createSocket()
  const other = createSocket()
  manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })
  manager.addConnection({ socket: other as never, profile: createProfile("user_b") })

  socket.bufferedAmount = 500
  manager.sendToUsers(["user_a", "user_b"], CHAT_EVENT)
  clock = 4_999
  manager.sendToUsers(["user_a", "user_b"], CHAT_EVENT)
  assert.deepEqual(socket.closes, [], "a short burst is tolerated")

  // Draining below the soft limit resets the window.
  socket.bufferedAmount = 0
  manager.sendToUser("user_a", CHAT_EVENT)
  socket.bufferedAmount = 500
  clock = 6_000
  manager.sendToUser("user_a", CHAT_EVENT)
  clock = 10_999
  manager.sendToUser("user_a", CHAT_EVENT)
  assert.deepEqual(socket.closes, [])

  clock = 11_000
  manager.sendToUsers(["user_a", "user_b"], CHAT_EVENT)
  assert.deepEqual(socket.closes, [1013])
  assert.equal(socket.sent.length, 5, "nothing is written once the socket is judged too slow")
  assert.equal(other.sent.length, 3, "other sockets are unaffected")
  assert.deepEqual(other.closes, [])

  manager.sendToUser("user_a", CHAT_EVENT)
  assert.equal(socket.sent.length, 5, "a closing socket receives nothing")
  context.mock.timers.tick(999)
  assert.equal(socket.terminated, 0)
  context.mock.timers.tick(1)
  assert.equal(socket.terminated, 1)
})

test("crossing the hard limit closes the socket immediately", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const manager = createConnectionManager({ outboundBuffer: { softLimitBytes: 100, hardLimitBytes: 1_000 } })
  const socket = createSocket()
  const connection = manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })
  socket.bufferedAmount = 1_001
  manager.sendToConnection(connection.connectionId, CHAT_EVENT)
  assert.deepEqual(socket.closes, [REALTIME_SLOW_CONSUMER_CLOSE_CODE])
  assert.equal(socket.sent.length, 0)
  manager.removeConnection(connection.connectionId)
  context.mock.timers.tick(1_000)
  assert.equal(socket.terminated, 0, "removing the connection cancels its termination timer")
})

test("the slow-consumer policy also applies after asynchronous delivery authorization", async () => {
  const manager = createConnectionManager({ outboundBuffer: { softLimitBytes: 100, hardLimitBytes: 1_000 } })
  manager.setDeliveryAuthorization(async () => true)
  const socket = createSocket()
  manager.addConnection({ socket: socket as never, profile: createProfile("user_a") })
  socket.bufferedAmount = 500
  manager.sendToUser("user_a", PRESENCE_EVENT)
  manager.sendToUser("user_a", CHAT_EVENT)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(sentTypes(socket), ["chat.message_received"])
})

test("fanout targets above the receiver limit are split into bounded chunks without loss", () => {
  const userIds = Array.from({ length: 250 }, (_, index) => `user_${index}`)
  const chunks = splitRealtimeFanoutTarget({ kind: "users", userIds })
  assert.deepEqual(chunks.map((chunk) => chunk.kind === "users" ? chunk.userIds.length : 0), [100, 100, 50])
  assert.deepEqual(chunks.flatMap((chunk) => chunk.kind === "users" ? [...chunk.userIds] : []), userIds)
  assert.deepEqual(splitRealtimeFanoutTarget({ kind: "users", userIds: userIds.slice(0, 100) }).length, 1)
  assert.deepEqual(splitRealtimeFanoutTarget({ kind: "room", roomId: "room_1" }), [{ kind: "room", roomId: "room_1" }])
})

function createValidatingFanout(): RealtimeFanout & { published: RealtimeFanoutMessage[] } {
  const handlers = new Set<RealtimeFanoutHandler>()
  const published: RealtimeFanoutMessage[] = []
  return {
    published,
    async publish(message) {
      published.push(message)
      // Same wire path as PostgreSQL LISTEN receivers: JSON, then validation.
      const received: unknown = JSON.parse(JSON.stringify(message))
      if (!validateRealtimeFanoutMessage(received)) return
      await Promise.all([...handlers].map((handler) => handler(received)))
    },
    async subscribe(handler) {
      handlers.add(handler)
      return async () => { handlers.delete(handler) }
    }
  }
}

for (const durable of [false, true]) {
  test(`${durable ? "durable" : "best-effort"} delivery to more than ${MAX_REALTIME_FANOUT_USER_TARGETS} users reaches every remote recipient`, async () => {
    const fanout = createValidatingFanout()
    const sender = createConnectionManager({ fanout, instanceId: "sender" })
    const receiver = createConnectionManager({ fanout, instanceId: "receiver" })
    await receiver.startFanout()
    const userIds = Array.from({ length: 205 }, (_, index) => `user_${index}`)
    const sockets = userIds.map((userId) => {
      const socket = createSocket()
      receiver.addConnection({ socket: socket as never, profile: createProfile(userId) })
      return socket
    })
    if (durable) await sender.sendToUsersDurably(userIds, CHAT_EVENT)
    else sender.sendToUsers(userIds, CHAT_EVENT)
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(fanout.published.map((message) =>
      message.target.kind === "users" ? message.target.userIds.length : 0), [100, 100, 5])
    assert.ok(fanout.published.every((message) => validateRealtimeFanoutMessage(JSON.parse(JSON.stringify(message)))))
    assert.ok(sockets.every((socket) => socket.sent.length === 1), "no recipient is silently dropped")
    await sender.closeFanout()
    await receiver.closeFanout()
  })
}

test("a durable send fails when any chunk fails so the outbox retries", async () => {
  let calls = 0
  const manager = createConnectionManager({
    fanout: {
      async publish() { calls += 1; if (calls === 2) throw new Error("notify failed") },
      async subscribe() { return async () => {} }
    }
  })
  const userIds = Array.from({ length: 150 }, (_, index) => `user_${index}`)
  await assert.rejects(manager.sendToUsersDurably(userIds, CHAT_EVENT), /notify failed/)
  assert.equal(calls, 2)
})

test("the PostgreSQL publisher rejects an unsplit oversized users target instead of losing it", async () => {
  const queries: string[] = []
  const fanout = createPostgresRealtimeFanout({
    async query(text: string) { queries.push(text); return {} },
    async connect() { throw new Error("not used") }
  })
  const userIds = Array.from({ length: MAX_REALTIME_FANOUT_USER_TARGETS + 1 }, (_, index) => `user_${index}`)
  await assert.rejects(
    fanout.publish({ origin: "sender", target: { kind: "users", userIds }, event: CHAT_EVENT }),
    /too large; split it/
  )
  await fanout.publish({ origin: "sender", target: { kind: "users", userIds: userIds.slice(0, 100) }, event: CHAT_EVENT })
  assert.equal(queries.length, 1)
})
