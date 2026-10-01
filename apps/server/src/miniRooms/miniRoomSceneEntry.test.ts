/**
 * Scene entry races (2026-10-01, owner report "the partner's movement is not
 * live"). A scene entry waits for the room access check; whatever happened to
 * the socket meanwhile must win, and one phone's own reconnect must never
 * take the scene from itself.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { createMiniRoomMotionService } from "./miniRoomMotionService"

function createGatedRoom() {
  const deliveries: { connectionIds: string[]; event: any }[] = []
  let release: () => void = () => undefined
  let gate: Promise<void> | undefined
  const service = createMiniRoomMotionService({
    findRoom: async (id) => {
      if (gate) await gate
      return { miniRoomId: id, participantUserIds: ["a", "b"] } as any
    },
    hasBlockBetween: async () => false,
    emit: (connectionIds, event) => deliveries.push({ connectionIds: [...connectionIds].sort(), event })
  })
  return {
    service,
    deliveries,
    /** The next room checks wait until the returned function is called. */
    holdChecks() {
      gate = new Promise<void>(resolve => { release = () => { gate = undefined; resolve() } })
      return () => release()
    },
    lastSnapshot() {
      return [...deliveries].reverse().find(({ event }) => event.type === "mini_room.motion_snapshot")
    },
    supersededTo() {
      return deliveries.filter(({ event }) => event.type === "mini_room.scene_superseded").map(({ connectionIds }) => connectionIds)
    }
  }
}

const presenceOf = (snapshot: any, userId: string) =>
  snapshot.event.payload.avatars.find((avatar: any) => avatar.userId === userId).present

test("an entry whose socket closed during the room check never brings the avatar back as a ghost", async () => {
  const f = createGatedRoom()
  await f.service.enter("cb", "b", "room")
  // The room was not just primed, so this entry waits for the database.
  const release = f.holdChecks()
  const entering = f.service.enter("ca", "a", "room")
  // The phone's socket closes (background, network) before the check answers.
  f.service.disconnect("ca")
  release()
  await entering
  const snapshot = f.lastSnapshot()
  assert.ok(!snapshot || presenceOf(snapshot, "a") === false, "the partner never sees a closed socket's avatar as present")
  f.deliveries.length = 0
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  assert.deepEqual(f.deliveries, [], "a closed socket is not in the scene")
})

test("a scene exit sent while the entry was still being checked wins", async () => {
  const f = createGatedRoom()
  const release = f.holdChecks()
  const enteringB = f.service.enter("cb", "b", "room")
  const enteringA = f.service.enter("ca", "a", "room")
  // The person leaves the room screen at once (scene_exit on the same open socket).
  f.service.disconnect("ca", "room")
  release()
  await Promise.all([enteringA, enteringB])
  assert.equal(presenceOf(f.lastSnapshot(), "a"), false, "the partner does not see an avatar that already left")
  assert.deepEqual(f.lastSnapshot()!.connectionIds, ["cb"])
})

test("a later entry on the same socket still completes after an earlier one was cancelled", async () => {
  const f = createGatedRoom()
  await f.service.enter("cb", "b", "room")
  f.service.invalidate("room")
  const release = f.holdChecks()
  const first = f.service.enter("ca", "a", "room")
  f.service.disconnect("ca", "room")
  const retry = f.service.enter("ca", "a", "room")
  release()
  await Promise.all([first, retry])
  assert.equal(presenceOf(f.lastSnapshot(), "a"), true)
  assert.ok(f.lastSnapshot()!.connectionIds.includes("ca"))
})

test("one phone's late entry from its abandoned socket never supersedes the socket it uses now", async () => {
  const f = createGatedRoom()
  const phone = (order: number) => ({ key: "session-a", order })
  await f.service.enter("cb", "b", "room")
  // The reconnected socket (opened second) entered first; the old socket's
  // entry, delayed by its own authorization, arrives afterwards.
  await f.service.enter("ca-new", "a", "room", phone(2))
  await f.service.enter("ca-old", "a", "room", phone(1))
  assert.deepEqual(f.supersededTo(), [], "the phone is never told another device took over")
  f.deliveries.length = 0
  await f.service.move("ca-new", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  assert.equal(f.deliveries.at(-1)?.event.type, "mini_room.avatar_moved", "the current socket keeps driving the avatar")
  assert.deepEqual(f.deliveries.at(-1)!.connectionIds, ["ca-new", "cb"])
  f.deliveries.length = 0
  await f.service.move("ca-old", "a", { miniRoomId: "room", sequence: 2, x: .6, y: .7 })
  assert.deepEqual(f.deliveries, [], "the abandoned socket is not in the scene")
})

test("one phone's reconnected socket replaces its old one without a takeover notice", async () => {
  const f = createGatedRoom()
  const phone = (order: number) => ({ key: "session-a", order })
  await f.service.enter("cb", "b", "room")
  await f.service.enter("ca-old", "a", "room", phone(1))
  await f.service.enter("ca-new", "a", "room", phone(2))
  assert.deepEqual(f.supersededTo(), [])
  assert.deepEqual(f.lastSnapshot()!.connectionIds, ["ca-new", "cb"])
  // The old socket's close, processed later, changes nothing for the partner.
  f.deliveries.length = 0
  f.service.disconnect("ca-old")
  assert.deepEqual(f.deliveries, [])
})

test("another device of the same account still takes the scene over deliberately", async () => {
  const f = createGatedRoom()
  await f.service.enter("cb", "b", "room")
  await f.service.enter("ca-phone", "a", "room", { key: "session-phone", order: 5 })
  // A tablet signed in separately, with a socket opened earlier than the phone's.
  await f.service.enter("ca-tablet", "a", "room", { key: "session-tablet", order: 1 })
  assert.deepEqual(f.supersededTo(), [["ca-phone"]])
  assert.deepEqual(f.lastSnapshot()!.connectionIds, ["ca-tablet", "cb"])
})
