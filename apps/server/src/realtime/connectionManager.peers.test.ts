// Peer-aware fanout and the per-user index (2026-10-01). With one instance,
// every NOTIFY was a database round trip whose only listener was the sender.
import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import type { WebSocket } from "ws"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import { createConnectionManager } from "./connectionManager"
import type { RealtimeFanout, RealtimeFanoutMessage } from "./realtimeFanout"
import type { RealtimeFanoutControl } from "./realtimeFanoutControl"

const MOVE_EVENT = {
  type: "mini_room.avatar_moved",
  payload: {
    miniRoomId: "room_1",
    epoch: "epoch_1",
    participantUserIds: ["user_a", "user_b"],
    avatar: { userId: "user_a", x: 0.5, y: 0.7, present: true, revision: 1 }
  }
} as ServerEvent

function createSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as string[],
    send(value: string) { this.sent.push(value) },
    close() { this.readyState = 3 },
    terminate() { this.readyState = 3 }
  }
}

function profile(userId: string): UserProfile {
  return { userId, displayName: userId, avatar: { presetId: "starter" } } as unknown as UserProfile
}

function createFanout(peers: { value: boolean }) {
  const published: RealtimeFanoutMessage[] = []
  const revocations: RealtimeAccessRevocation[] = []
  const fanout: RealtimeFanout & RealtimeFanoutControl = {
    isHealthy: () => true,
    hasRemotePeers: () => peers.value,
    async publish(message) { published.push(message) },
    async subscribe() { return async () => {} },
    async publishAccessRevocation(revocation) { revocations.push(revocation) },
    subscribeAccessRevocations() { return () => {} }
  }
  return { fanout, published, revocations }
}

test("with no other instance listening, sends stay local and skip the NOTIFY round trip", async () => {
  const peers = { value: false }
  const { fanout, published } = createFanout(peers)
  const manager = createConnectionManager({ fanout })
  await manager.startFanout()
  const socket = createSocket()
  manager.addConnection({ socket: socket as unknown as WebSocket, profile: profile("user_b") })
  manager.sendToUsers(["user_a", "user_b"], MOVE_EVENT)
  manager.sendToUser("user_b", MOVE_EVENT)
  manager.broadcastRoom("room_1", MOVE_EVENT)
  await manager.sendToUsersDurably(["user_a", "user_b"], MOVE_EVENT)
  assert.equal(socket.sent.length, 3)
  assert.equal(published.length, 0)

  // Another instance appears: every send reaches it again.
  peers.value = true
  manager.sendToUsers(["user_a", "user_b"], MOVE_EVENT)
  await manager.sendToUsersDurably(["user_a"], MOVE_EVENT)
  assert.equal(published.length, 2)
  await manager.closeFanout()
})

test("a fanout without peer awareness keeps publishing everything", async () => {
  const published: RealtimeFanoutMessage[] = []
  const manager = createConnectionManager({
    fanout: {
      async publish(message) { published.push(message) },
      async subscribe() { return async () => {} }
    }
  })
  await manager.startFanout()
  manager.sendToUser("user_a", MOVE_EVENT)
  assert.equal(published.length, 1)
  await manager.closeFanout()
})

test("one event is encoded once for every recipient socket", async () => {
  const manager = createConnectionManager()
  const sockets = [createSocket(), createSocket(), createSocket()]
  for (const [index, socket] of sockets.entries()) {
    manager.addConnection({ socket: socket as unknown as WebSocket, profile: profile(index < 2 ? "user_a" : "user_b") })
  }
  const original = JSON.stringify
  let encodings = 0
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    encodings += 1
    return original(...args)
  }) as typeof JSON.stringify
  try {
    manager.sendToUsers(["user_a", "user_b"], MOVE_EVENT)
  } finally {
    JSON.stringify = original
  }
  assert.equal(encodings, 1)
  assert.deepEqual(sockets.map((socket) => socket.sent.length), [1, 1, 1])
  assert.equal(sockets[0]!.sent[0], original(MOVE_EVENT))
})

test("the per-user index follows connections as they come and go", () => {
  const manager = createConnectionManager()
  const first = createSocket()
  const second = createSocket()
  const a1 = manager.addConnection({ socket: first as unknown as WebSocket, profile: profile("user_a") })
  manager.addConnection({ socket: second as unknown as WebSocket, profile: profile("user_a") })
  assert.equal(manager.hasUserConnections("user_a"), true)
  assert.equal(manager.getUserConnections("user_a").length, 2)
  manager.removeConnection(a1.connectionId)
  manager.sendToUser("user_a", MOVE_EVENT)
  assert.equal(first.sent.length, 0)
  assert.equal(second.sent.length, 1)
  for (const connection of manager.getUserConnections("user_a")) manager.removeConnection(connection.connectionId)
  assert.equal(manager.hasUserConnections("user_a"), false)
  assert.deepEqual(manager.getUserConnections("user_a"), [])
})

test("local revocations are forwarded to other instances and failures are only reported", async () => {
  const { fanout, revocations } = createFanout({ value: true })
  const reported: unknown[] = []
  const manager = createConnectionManager({ fanout, reportFanoutError: (error) => reported.push(error) })
  await manager.publishAccessRevocation({ kind: "user", userId: "user_a" })
  assert.deepEqual(revocations, [{ kind: "user", userId: "user_a" }])
  fanout.publishAccessRevocation = async () => { throw new Error("notify failed") }
  await manager.publishAccessRevocation({ kind: "all" })
  assert.equal(reported.length, 1)
  await manager.closeFanout()
})
