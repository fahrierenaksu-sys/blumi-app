import assert from "node:assert/strict"
import test from "node:test"
import { createMiniRoomMotionSession } from "./miniRoomMotionSession"

test("motion sends immediately, coalesces rapid retargets, rejects stale updates and never replays offline moves", () => {
  const sent: any[] = [], states: any[] = [], timers: (() => void)[] = []
  let time = 1000
  const session = createMiniRoomMotionSession({ miniRoomId: "room", localUserId: "a", partnerUserId: "b",
    send: event => { sent.push(event); return true }, update: state => states.push(state), now: () => time,
    schedule: callback => { timers.push(callback); return callback as any }, cancel: () => { timers.length = 0 } })
  session.connect()
  assert.equal(session.move({ x: .5, y: .7 }), false, "await authoritative scene snapshot")
  session.receive({ type: "mini_room.motion_snapshot", payload: { miniRoomId: "room", epoch: "e",
    participantUserIds: ["a", "b"], avatars: [
      { userId: "a", x: .38, y: .76, present: true, revision: 1 },
      { userId: "b", x: .62, y: .76, present: true, revision: 1 }] } })
  assert.equal(session.move({ x: .5, y: .7 }), true)
  assert.equal(sent.at(-1).type, "mini_room.move")
  session.move({ x: .52, y: .7 }); session.move({ x: .54, y: .7 })
  assert.equal(sent.filter(e => e.type === "mini_room.move").length, 1)
  time += 200; timers.shift()!()
  assert.equal(sent.at(-1).payload.x, .54)
  const moved: any = { type: "mini_room.avatar_moved", payload: { miniRoomId: "room", epoch: "e",
    participantUserIds: ["a", "b"], avatar: { userId: "b", x: .6, y: .7, present: true, revision: 3 } } }
  session.receive(moved)
  const count = states.length
  session.receive({ ...moved, payload: { ...moved.payload, avatar: { ...moved.payload.avatar, revision: 2 } } })
  assert.equal(states.length, count)
  session.disconnect()
  assert.equal(session.move({ x: .7, y: .7 }), false)
  assert.equal(timers.length, 0)
  assert.equal(states.at(-1).partnerPresent, false)
})
