import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import { createConnectionManager } from "./connectionManager"
import {
  createRealtimeAuthorizationCache,
  type RealtimeAuthorizationIdentity
} from "./realtimeAuthorizationCache"

// A delivery whose authorization check started before a revocation may have
// read pre-revocation state. Its answer must never put an event on the socket
// of a revoked session; a session that is still valid keeps its delivery.
const EVENT = {
  type: "presence.nearby",
  payload: { roomId: "room_test", userId: "user_peer", nearbyUsers: [] }
} as unknown as ServerEvent

function createSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as string[],
    send(value: string) { this.sent.push(value) },
    close() { this.readyState = 2 },
    terminate() { this.readyState = 3 }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function setUp(answers: Array<Promise<boolean>>) {
  const checked: RealtimeAuthorizationIdentity[] = []
  const cache = createRealtimeAuthorizationCache({
    check(identity) {
      checked.push(identity)
      const next = answers.shift()
      if (!next) throw new Error("unexpected extra authorization check")
      return next
    }
  })
  const manager = createConnectionManager()
  manager.setDeliveryAuthorization((connection) => cache.authorize({
    userId: connection.userId,
    sessionFamilyId: connection.sessionFamilyId!
  }))
  const socket = createSocket()
  manager.addConnection({
    socket: socket as never,
    profile: { userId: "user_test", displayName: "Test" } as unknown as UserProfile,
    sessionFamilyId: "family_test"
  })
  return { cache, manager, socket, checked }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test("a check that started before a revocation never delivers to the revoked session", async () => {
  const preRevocationRead = deferred<boolean>()
  const { cache, manager, socket, checked } = setUp([preRevocationRead.promise, Promise.resolve(false)])

  manager.sendToUser("user_test", EVENT)
  await settle()
  assert.equal(checked.length, 1, "the delivery check is in flight")
  cache.invalidate({ kind: "user", userId: "user_test" })
  preRevocationRead.resolve(true)
  await settle()

  assert.equal(socket.sent.length, 0, "no event written from a pre-revocation answer")
  assert.equal(checked.length, 2, "the stale answer was checked again")
  assert.equal(cache.size(), 0)
})

test("a still-valid session keeps its delivery after a revocation elsewhere for the same person", async () => {
  const preRevocationRead = deferred<boolean>()
  const { cache, manager, socket, checked } = setUp([preRevocationRead.promise, Promise.resolve(true)])

  manager.sendToUser("user_test", EVENT)
  await settle()
  cache.invalidate({ kind: "user", userId: "user_test" })
  preRevocationRead.resolve(true)
  await settle()

  assert.equal(socket.sent.length, 1, "the re-check confirmed this session")
  assert.equal(checked.length, 2)
})

test("an everyone revocation also discards in-flight answers", async () => {
  const preRevocationRead = deferred<boolean>()
  const { cache, manager, socket } = setUp([preRevocationRead.promise, Promise.resolve(false)])

  manager.sendToUser("user_test", EVENT)
  await settle()
  cache.invalidate({ kind: "all" })
  preRevocationRead.resolve(true)
  await settle()

  assert.equal(socket.sent.length, 0)
})
