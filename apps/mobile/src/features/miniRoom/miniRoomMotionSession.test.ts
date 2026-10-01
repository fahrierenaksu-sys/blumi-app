import assert from "node:assert/strict"
import test from "node:test"
import type { MiniRoomAvatarMotion, ServerEvent } from "@blumi/contracts"
import { createMiniRoomMotionSession, type MiniRoomMotionState } from "./miniRoomMotionSession"

function createFixture() {
  const sent: any[] = [], states: MiniRoomMotionState[] = []
  const timers = new Map<number, { run: () => void; delay: number }>()
  let time = 1000, timerId = 0
  const session = createMiniRoomMotionSession({ miniRoomId: "room", localUserId: "a", partnerUserId: "b",
    send: event => { sent.push(event); return true }, update: state => states.push(state), now: () => time,
    schedule: (callback, delay) => { timers.set(++timerId, { run: callback, delay }); return timerId as any },
    cancel: timer => { timers.delete(timer as unknown as number) } })
  const fire = () => {
    const [id, timer] = [...timers.entries()][0]!
    timers.delete(id)
    timer.run()
  }
  return { session, sent, states, timers, fire, advance: (ms: number) => { time += ms } }
}

const avatar = (userId: string, patch: Partial<MiniRoomAvatarMotion> = {}): MiniRoomAvatarMotion =>
  ({ userId, x: userId === "a" ? .38 : .62, y: .76, present: true, revision: 1, ...patch })
const snapshot = (avatars: MiniRoomAvatarMotion[], epoch = "e"): ServerEvent => ({ type: "mini_room.motion_snapshot",
  payload: { miniRoomId: "room", epoch, participantUserIds: ["a", "b"], avatars } })
const moved = (value: MiniRoomAvatarMotion): ServerEvent => ({ type: "mini_room.avatar_moved",
  payload: { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"], avatar: value } })

test("motion sends immediately, coalesces rapid retargets, rejects stale updates and never replays offline moves", () => {
  const f = createFixture()
  f.session.connect()
  assert.equal(f.session.move({ x: .5, y: .7 }), false, "await authoritative scene snapshot")
  f.session.receive(snapshot([avatar("a"), avatar("b")]))
  assert.equal(f.session.move({ x: .5, y: .7 }), true)
  assert.equal(f.sent.at(-1).type, "mini_room.move")
  f.session.move({ x: .52, y: .7 }); f.session.move({ x: .54, y: .7 })
  assert.equal(f.sent.filter(e => e.type === "mini_room.move").length, 1)
  f.advance(200); f.fire()
  assert.equal(f.sent.at(-1).payload.x, .54)
  f.session.receive(moved(avatar("b", { x: .6, y: .7, revision: 3 })))
  const count = f.states.length
  f.session.receive(moved(avatar("b", { x: .1, y: .7, revision: 2 })))
  assert.equal(f.states.length, count)
  f.session.disconnect()
  assert.equal(f.session.move({ x: .7, y: .7 }), false)
  assert.equal(f.timers.size, 0)
  assert.equal(f.states.at(-1)!.partnerPresent, false)
})

test("the latest state always carries the partner's newest step, even when this phone's echo follows it", () => {
  // React may render only the last of several updates delivered in one burst.
  // The echo of this phone's own step must not replace the partner's step.
  const f = createFixture()
  f.session.connect()
  f.session.receive(snapshot([avatar("a"), avatar("b")]))
  f.session.receive(moved(avatar("b", { x: .6, y: .7, revision: 2 })))
  f.session.receive(moved(avatar("a", { x: .45, y: .72, revision: 2 })))
  const latest = f.states.at(-1)!
  assert.deepEqual(latest.avatars.find(entry => entry.userId === "b"), avatar("b", { x: .6, y: .7, revision: 2 }))
  assert.equal(latest.snapKey, f.states[0]!.snapKey, "incremental steps never re-snap")
  assert.equal(latest.partnerPresent, true)
})

test("each join snapshot gets a new snap key, and a snapshot before this socket joined does not start movement", () => {
  const f = createFixture()
  f.session.connect()
  // The partner entered first: this socket's avatar is not present yet, so the
  // server would ignore a step from it.
  f.session.receive(snapshot([avatar("a", { present: false, revision: 0 }), avatar("b")]))
  assert.equal(f.session.move({ x: .5, y: .7 }), false)
  f.session.receive(snapshot([avatar("a", { revision: 1 }), avatar("b")]))
  assert.equal(f.session.move({ x: .5, y: .7 }), true)
  const firstKey = f.states.at(-1)!.snapKey
  f.session.disconnect()
  f.session.connect()
  f.session.receive(snapshot([avatar("a", { revision: 4 }), avatar("b", { revision: 4 })], "restarted"))
  assert.notEqual(f.states.at(-1)!.snapKey, firstKey)
})

test("a lost scene entry is retried until the snapshot arrives, and never after leaving", () => {
  const f = createFixture()
  const entries = () => f.sent.filter(event => event.type === "mini_room.scene_enter").length
  f.session.connect()
  assert.equal(entries(), 1)
  f.fire()
  assert.equal(entries(), 2, "an unanswered entry is sent again")
  f.fire()
  assert.equal(entries(), 3)
  f.session.receive(snapshot([avatar("a"), avatar("b")]))
  assert.equal(f.timers.size, 0, "the snapshot ends the retries")
  f.session.leave()
  f.session.connect()
  assert.equal(f.timers.size, 1)
  f.session.leave()
  assert.equal(f.timers.size, 0, "leaving cancels a pending retry")
  assert.equal(entries(), 4)
})
