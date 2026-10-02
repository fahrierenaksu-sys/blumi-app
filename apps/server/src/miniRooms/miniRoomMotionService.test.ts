import assert from "node:assert/strict"
import test from "node:test"
import { createMiniRoomMotionService, MINI_ROOM_MOTION_RESYNC_DELAY_MS } from "./miniRoomMotionService"

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
  assert.deepEqual(events.at(-1).users, ["ca", "cb"])
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
  // Invalidation removes the scene: the socket is no longer in it, so the move
  // is ignored without a lookup, and entering again is refused for the pair.
  await service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .5, y: .7 })
  await assert.rejects(service.enter("ca", "a", "room"))
  await service.move("ca", "a", { miniRoomId: "room", sequence: 3, x: .5, y: .7 })
  blocked = false
  room.endedAt = new Date().toISOString()
  await assert.rejects(service.enter("ca", "a", "room"))
  assert.equal(events.length, 0)
})

test("a seat move is relayed with its hotspot even where the seat overhangs the walkable floor", async () => {
  // A chair turned to face the back wall near the front edge puts its seat at
  // y≈0.93, below the floor polygon (y ≤ 0.9). The mobile planner accepts that
  // seat; rejecting it here left the partner's phone showing the sitter standing.
  const events: any[] = []
  const room = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const service = createMiniRoomMotionService({ findRoom: async () => room as any,
    hasBlockBetween: async () => false, emit: (_, event) => events.push(event) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  events.length = 0
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .4, y: .93, hotspotId: "chair:front_edge" })
  assert.equal(events.length, 1)
  assert.equal(events[0].payload.avatar.hotspotId, "chair:front_edge")
  await service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .4, y: .93 })
  assert.equal(events.length, 1, "a plain walk target must still be on the floor")
  // A claimed seat far from the floor (a wall, a corner) is refused, whatever its id.
  for (const [sequence, point] of [[3, { x: .02, y: .02 }], [4, { x: .5, y: .2 }], [5, { x: .98, y: .98 }]] as const) {
    await service.move("ca", "a", { miniRoomId: "room", sequence, ...point, hotspotId: "invented:seat" })
  }
  assert.equal(events.length, 1)
})

test("motion reaches only the sockets that entered the scene, never every device of both users", async () => {
  const deliveries: { connectionIds: string[]; type: string }[] = []
  const room = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const service = createMiniRoomMotionService({ findRoom: async () => room as any,
    hasBlockBetween: async () => false,
    emit: (connectionIds, event) => deliveries.push({ connectionIds: [...connectionIds].sort(), type: event.type }) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  deliveries.length = 0
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  assert.deepEqual(deliveries, [{ connectionIds: ["ca", "cb"], type: "mini_room.avatar_moved" }])
})

test("re-entering on the same socket never flashes the avatar as absent to the partner", async () => {
  const events: any[] = []
  const room = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const service = createMiniRoomMotionService({ findRoom: async () => room as any,
    hasBlockBetween: async () => false, emit: (_, event) => events.push(event) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  await service.move("ca", "a", { miniRoomId: "room", sequence: 3, x: .5, y: .7 })
  events.length = 0
  await service.enter("ca", "a", "room")
  assert.ok(events.length > 0, "the retried entry is answered with a snapshot")
  for (const event of events) {
    assert.equal(event.type, "mini_room.motion_snapshot")
    assert.equal(event.payload.avatars.find((avatar: any) => avatar.userId === "a").present, true)
  }
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .6, y: .7 })
  assert.equal(events.at(-1).payload.avatar?.x, .6, "a fresh entry restarts the socket's sequence")
})

test("a stranger's lookup of the same room cannot fail a participant's concurrent entry", async () => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const events: any[] = []
  const service = createMiniRoomMotionService({ findRoom: async () => {
    await gate
    return { miniRoomId: "room", participantUserIds: ["a", "b"] } as any
  }, hasBlockBetween: async () => false, emit: (_, event) => events.push(event) })
  const stranger = service.enter("cx", "x", "room")
  const participant = service.enter("ca", "a", "room")
  release!()
  await assert.rejects(stranger)
  await participant
  assert.equal(events.at(-1).payload.avatars.find((avatar: any) => avatar.userId === "a").present, true)
})

test("a move from a socket outside the scene costs no room lookup and creates no cached room", async () => {
  let lookups = 0
  const events: any[] = []
  const service = createMiniRoomMotionService({ findRoom: async () => {
    lookups++
    return { miniRoomId: "room", participantUserIds: ["a", "b"] } as any
  }, hasBlockBetween: async () => false, emit: (_, event) => events.push(event) })
  for (let sequence = 1; sequence <= 20; sequence++) {
    await service.move("ca", "a", { miniRoomId: `room-${sequence}`, sequence, x: .5, y: .7 })
  }
  assert.equal(lookups, 0)
  assert.equal(events.length, 0)
})

test("rooms looked up without an entered socket expire like idle rooms", async () => {
  let clock = 0
  const lookups: string[] = []
  const service = createMiniRoomMotionService({ now: () => clock, findRoom: async (id) => {
    lookups.push(id)
    return { miniRoomId: id, participantUserIds: ["a", "b"] } as any
  }, hasBlockBetween: async () => false, emit: () => undefined })
  // A stranger probing a real room caches it without a connection.
  await assert.rejects(service.enter("cx", "x", "probe"))
  clock += 61_000
  await service.enter("ca", "a", "other")
  await service.enter("ca", "a", "probe")
  assert.deepEqual(lookups, ["probe", "other", "probe"], "the probed room was evicted and checked again")
})

test("a due access re-check runs in the background while moves keep relaying, and an ended room stops them", async () => {
  let clock = 1_000_000
  let lookups = 0
  let release: (() => void) | undefined
  let gate: Promise<void> = Promise.resolve()
  const room: any = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const events: any[] = []
  const service = createMiniRoomMotionService({
    now: () => clock,
    findRoom: async () => { lookups++; await gate; return room },
    hasBlockBetween: async () => false,
    emit: (_, event) => events.push(event)
  })
  await service.enter("ca", "a", "room")
  events.length = 0
  lookups = 0
  gate = new Promise<void>(resolve => { release = resolve })
  clock += 10_000
  // The re-check is due but slow: the move is relayed without waiting for it.
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  assert.equal(events.length, 1)
  assert.equal(lookups, 1)
  await service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .52, y: .7 })
  assert.equal(lookups, 1, "one background check at a time")
  room.endedAt = new Date().toISOString()
  release!()
  await new Promise(resolve => setImmediate(resolve))
  // The failed check removed the scene, so the move is ignored without a lookup.
  await service.move("ca", "a", { miniRoomId: "room", sequence: 3, x: .5, y: .7 })
  assert.equal(lookups, 1)
  assert.equal(events.length, 2)
})

test("a decision is never trusted past the stale bound without a successful check", async () => {
  let clock = 1_000_000
  let failing = false
  const room: any = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const service = createMiniRoomMotionService({
    now: () => clock,
    findRoom: async () => { if (failing) throw new Error("database unavailable"); return room },
    hasBlockBetween: async () => false,
    emit: () => undefined
  })
  await service.enter("ca", "a", "room")
  failing = true
  clock += 59_999
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  clock += 1
  await assert.rejects(service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .5, y: .7 }))
})

test("occupied rooms are re-checked on a timer, so a move after a quiet minute does not wait for the database", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] })
  let clock = 1_000_000
  let lookups = 0
  let gate: Promise<void> = Promise.resolve()
  const room: any = { miniRoomId: "room", participantUserIds: ["a", "b"] }
  const events: any[] = []
  const service = createMiniRoomMotionService({
    now: () => clock,
    findRoom: async () => { lookups++; await gate; return room },
    hasBlockBetween: async () => false,
    emit: (_, event) => events.push(event)
  })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  lookups = 0
  // Both avatars stand still for 70 s (2026-10-01: the next move used to wait
  // for a forced check, seconds under a busy pool).
  for (let elapsed = 0; elapsed < 70_000; elapsed += 5_000) {
    clock += 5_000
    t.mock.timers.tick(5_000)
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(lookups >= 6, "re-checked about every 10 s while occupied")
  gate = new Promise<void>(() => undefined)
  events.length = 0
  void service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(events.at(-1)?.type, "mini_room.avatar_moved", "relayed without waiting for a check")

  service.disconnect("ca")
  service.disconnect("cb")
  const checked = lookups
  clock += 30_000
  t.mock.timers.tick(30_000)
  assert.equal(lookups, checked, "an empty room is not re-checked")
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

test("a room just verified by its acceptance is entered without another lookup; ending it or time removes that shortcut", async () => {
  let clock = 0
  let lookups = 0
  const record = { miniRoomId: "room", participantUserIds: ["a", "b"] } as any
  const events: any[] = []
  const service = createMiniRoomMotionService({ now: () => clock,
    findRoom: async () => { lookups++; return record }, hasBlockBetween: async () => false,
    emit: (_, event) => events.push(event) })
  service.prime(record)
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  assert.equal(lookups, 0, "both phones join on the acceptance's own verification")
  assert.ok(events.at(-1).payload.avatars.every((avatar: any) => avatar.present))
  await assert.rejects(service.enter("cx", "x", "room"), "membership is still checked")

  service.prime(record)
  service.invalidate("room")
  await service.enter("ca", "a", "room")
  assert.equal(lookups, 1, "an ended or blocked room is looked up again")

  service.prime(record)
  clock += 10_000
  await service.enter("ca", "a", "room")
  assert.equal(lookups, 2, "a stale verification is not reused")
  service.prime({ ...record, endedAt: new Date(0).toISOString() })
  await service.enter("ca", "a", "room")
  assert.equal(lookups, 3, "an ended record is never primed")
})

test("a socket that missed a step is re-sent the current snapshot once, alone, after a short delay", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const events: any[] = []
  const room = { miniRoomId: "room", participantUserIds: ["a", "b"], endedAt: undefined }
  const service = createMiniRoomMotionService({ findRoom: async () => room as any,
    hasBlockBetween: async () => false, emit: (connections, event) => events.push({ connections, event }) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  await service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .7 })
  events.length = 0

  // "cb" dropped that step under backpressure; a burst of drops coalesces.
  service.resyncAfterDrop("cb", "room")
  service.resyncAfterDrop("cb", "room")
  await service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .55, y: .7 })
  service.resyncAfterDrop("cb", "room")
  assert.equal(events.filter(e => e.event.type === "mini_room.motion_snapshot").length, 0, "not sent synchronously")
  context.mock.timers.tick(MINI_ROOM_MOTION_RESYNC_DELAY_MS)
  const snapshots = events.filter(e => e.event.type === "mini_room.motion_snapshot")
  assert.equal(snapshots.length, 1)
  assert.deepEqual(snapshots[0].connections, ["cb"], "the partner's socket is not re-sent anything")
  const a = snapshots[0].event.payload.avatars.find((avatar: any) => avatar.userId === "a")
  assert.equal(a.x, .55, "the snapshot carries the latest target")
  assert.equal(a.revision, 3, "revisions are unchanged, so latest-wins still holds on the phone")

  // A socket that left, or was superseded by a newer device, gets nothing.
  service.resyncAfterDrop("cb", "room")
  service.disconnect("cb")
  service.resyncAfterDrop("ca", "room")
  await service.enter("ca2", "a", "room")
  service.resyncAfterDrop("unknown", "room")
  service.resyncAfterDrop("ca2", "other-room")
  events.length = 0
  context.mock.timers.tick(MINI_ROOM_MOTION_RESYNC_DELAY_MS)
  assert.deepEqual(events, [])
})
