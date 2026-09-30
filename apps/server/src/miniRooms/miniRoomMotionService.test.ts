import assert from "node:assert/strict"
import test from "node:test"
import { createMiniRoomMotionService } from "./miniRoomMotionService"

test("room motion relays immediately, snapshots recover positions, and disconnect is per connection", async () => {
  const events: any[] = []
  const room = { miniRoomId: "room", participantUserIds: ["a", "b"], endedAt: undefined }
  const service = createMiniRoomMotionService({ findRoom: async () => room as any,
    hasBlockBetween: async () => false, emit: (users, event) => events.push({ users, event }) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  events.length = 0
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  assert.equal(events.at(-1).event.type, "mini_room.avatar_moved")
  assert.equal(events.at(-1).event.payload.avatar.x, .5)
  assert.deepEqual(events.at(-1).users, ["a", "b"])
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .6, y: .7 })
  assert.equal(events.length, 1, "stale sequence cannot rewind a target")
  await service.enter("ca2", "a", "room")
  assert.equal(events.at(-1).event.payload.avatars[0].x, .5)
  service.disconnect("ca")
  assert.equal(events.at(-1).event.payload.avatars[0].present, true)
  service.disconnect("ca2")
  assert.equal(events.at(-1).event.payload.avatars[0].present, false)
  service.disconnect("cb")
  await service.enter("ca3", "a", "room")
  assert.equal(events.at(-1).event.payload.avatars[0].x, .5, "brief loss of both sockets preserves the last target")
})

test("foreign actors, invalid points, ended rooms and blocked pairs never relay movement", async () => {
  let blocked = false
  const room: any = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const events: any[] = []
  const service = createMiniRoomMotionService({ findRoom: async () => room,
    hasBlockBetween: async () => blocked, emit: (_, event) => events.push(event) })
  await assert.rejects(service.enter("cx", "x", "room"))
  await service.enter("ca", "a", "room")
  events.length = 0
  for (const point of [{ x: NaN, y: .7 }, { x: 2, y: .7 }, { x: .1, y: .1 }]) {
    await service.move("ca", "a", { miniRoomId: "room", sequence: 1, ...point })
  }
  assert.equal(events.length, 0)
  blocked = true
  service.invalidate("room")
  await assert.rejects(service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .5, y: .7 }))
  blocked = false
  room.endedAt = new Date().toISOString()
  await assert.rejects(service.enter("ca", "a", "room"))
  assert.equal(events.length, 0)
})

test("concurrent scene entry shares one authorization lookup and invalidation cancels an in-flight entry", async () => {
  let lookups = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const events: any[] = []
  const service = createMiniRoomMotionService({ findRoom: async () => {
    lookups++; await gate
    return { miniRoomId: "room", participantUserIds: ["a", "b"] } as any
  }, hasBlockBetween: async () => false, emit: (_, event) => events.push(event) })
  const entering = Promise.all([service.enter("ca", "a", "room"), service.enter("cb", "b", "room")])
  release!()
  await entering
  assert.equal(lookups, 1)
  assert.ok(events.at(-1).payload.avatars.every((avatar: any) => avatar.present))
  const invalidating = service.enter("ca2", "a", "room")
  service.invalidate("room")
  await assert.rejects(invalidating)
})
