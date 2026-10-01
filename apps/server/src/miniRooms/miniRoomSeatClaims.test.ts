import assert from "node:assert/strict"
import test from "node:test"
import { parseServerEvent } from "@blumi/contracts"
import { createMiniRoomMotionService } from "./miniRoomMotionService"

const SEAT = "chair-1:front_edge"

function createRoom(options: { findRoom?: (id: string) => Promise<any> } = {}) {
  const deliveries: { connectionIds: string[]; event: any }[] = []
  const service = createMiniRoomMotionService({
    findRoom: options.findRoom ?? (async (id) => ({ miniRoomId: id, participantUserIds: ["a", "b"] })),
    hasBlockBetween: async () => false,
    emit: (connectionIds, event) => deliveries.push({ connectionIds: [...connectionIds].sort(), event })
  })
  const last = (type: string) => [...deliveries].reverse().find(({ event }) => event.type === type)?.event
  const avatarOf = (userId: string) =>
    last("mini_room.motion_snapshot").payload.avatars.find((avatar: any) => avatar.userId === userId)
  return { service, deliveries, last, avatarOf }
}

test("two simultaneous claims of one seat: the first to reach the room wins, the second is refused on both phones", async () => {
  const f = createRoom()
  await f.service.enter("ca", "a", "room")
  await f.service.enter("cb", "b", "room")
  f.deliveries.length = 0
  await Promise.all([
    f.service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT }),
    f.service.move("cb", "b", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  ])
  const [winner, loser] = f.deliveries.map(({ event }) => event.payload.avatar)
  assert.deepEqual(f.deliveries.map(({ connectionIds }) => connectionIds), [["ca", "cb"], ["ca", "cb"]],
    "both phones receive both authoritative records")
  assert.equal(winner.userId, "a")
  assert.equal(winner.hotspotId, SEAT)
  assert.equal(loser.userId, "b")
  assert.equal(loser.hotspotId, undefined, "the loser never appears seated")
  assert.equal(loser.deniedHotspotId, SEAT)
  for (const { event } of f.deliveries) assert.equal(parseServerEvent(event).kind, "valid")
})

test("claims made while the room check is pending are decided in arrival order", async () => {
  let release: (() => void) | undefined
  let gated = false
  const gate = new Promise<void>(resolve => { release = resolve })
  let clock = 0
  const deliveries: any[] = []
  const service = createMiniRoomMotionService({ now: () => clock,
    findRoom: async (id) => { if (gated) await gate; return { miniRoomId: id, participantUserIds: ["a", "b"] } as any },
    hasBlockBetween: async () => false, emit: (_, event) => deliveries.push(event) })
  await service.enter("ca", "a", "room")
  await service.enter("cb", "b", "room")
  clock += 11_000; gated = true
  const second = service.move("cb", "b", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  const first = service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  release!()
  await Promise.all([first, second])
  const moved = deliveries.filter(event => event.type === "mini_room.avatar_moved").map(event => event.payload.avatar)
  assert.equal(moved[0].userId, "b")
  assert.equal(moved[0].hotspotId, SEAT)
  assert.equal(moved[1].deniedHotspotId, SEAT)
})

test("a seat is released when its holder stands, leaves the scene or loses the socket, and the room ending forgets it", async () => {
  const f = createRoom()
  await f.service.enter("ca", "a", "room")
  await f.service.enter("cb", "b", "room")
  const claim = (connectionId: string, userId: string, sequence: number) =>
    f.service.move(connectionId, userId, { miniRoomId: "room", sequence, x: .5, y: .57, hotspotId: SEAT })

  // Stand up: a walk without the hotspot frees the seat.
  await claim("ca", "a", 1)
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .5, y: .7 })
  await claim("cb", "b", 1)
  assert.equal(f.last("mini_room.avatar_moved").payload.avatar.hotspotId, SEAT)

  // Scene exit (background): the absent holder is no longer seated anywhere.
  f.service.disconnect("cb", "room")
  assert.equal(f.avatarOf("b").present, false)
  assert.equal(f.avatarOf("b").hotspotId, undefined)
  await claim("ca", "a", 3)
  assert.equal(f.last("mini_room.avatar_moved").payload.avatar.hotspotId, SEAT)

  // Socket close releases it too.
  await f.service.enter("cb2", "b", "room")
  f.service.disconnect("ca")
  await claim("cb2", "b", 1)
  assert.equal(f.last("mini_room.avatar_moved").payload.avatar.hotspotId, SEAT)

  // Room end: the cached scene and every claim are dropped.
  f.service.invalidate("room")
  await f.service.enter("ca", "a", "room")
  assert.equal(f.avatarOf("b").hotspotId, undefined)
  assert.equal(f.avatarOf("a").hotspotId, undefined)
})

test("a rejoin snapshot carries the current seat occupancy and the refused claim", async () => {
  const f = createRoom()
  await f.service.enter("ca", "a", "room")
  await f.service.enter("cb", "b", "room")
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  await f.service.move("cb", "b", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  f.deliveries.length = 0
  await f.service.enter("ca-retry", "a", "room")
  const snapshot = f.last("mini_room.motion_snapshot")
  assert.equal(parseServerEvent(snapshot).kind, "valid")
  assert.equal(f.avatarOf("a").hotspotId, SEAT)
  assert.equal(f.avatarOf("b").deniedHotspotId, SEAT)
  assert.equal(f.avatarOf("b").hotspotId, undefined)
})

test("the same user's own other device may re-claim the seat that user holds", async () => {
  const f = createRoom()
  await f.service.enter("ca", "a", "room")
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  await f.service.enter("ca2", "a", "room")
  await f.service.move("ca2", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  assert.equal(f.last("mini_room.avatar_moved").payload.avatar.hotspotId, SEAT)
})

test("500 rooms on one process keep their seats, deliveries and tie-breaks independent", async () => {
  const f = createRoom({ findRoom: async (id) => ({ miniRoomId: id, participantUserIds: [`${id}-a`, `${id}-b`] }) })
  const ids = Array.from({ length: 500 }, (_, index) => `room-${index}`)
  for (const id of ids) {
    await f.service.enter(`${id}-ca`, `${id}-a`, id)
    await f.service.enter(`${id}-cb`, `${id}-b`, id)
  }
  f.deliveries.length = 0
  // Even rooms: a claims first. Odd rooms: b claims first. Same seat id everywhere.
  await Promise.all(ids.flatMap((id, index) => {
    const order = index % 2 === 0 ? ["a", "b"] : ["b", "a"]
    return order.map(side => f.service.move(`${id}-c${side}`, `${id}-${side}`,
      { miniRoomId: id, sequence: 1, x: .5, y: .57, hotspotId: SEAT }))
  }))
  assert.equal(f.deliveries.length, 1000)
  for (const [index, id] of ids.entries()) {
    const own = f.deliveries.filter(({ event }) => event.payload.miniRoomId === id)
    assert.equal(own.length, 2)
    for (const { connectionIds } of own) assert.deepEqual(connectionIds, [`${id}-ca`, `${id}-cb`])
    const holder = own.find(({ event }) => event.payload.avatar.hotspotId === SEAT)!.event.payload.avatar.userId
    assert.equal(holder, `${id}-${index % 2 === 0 ? "a" : "b"}`)
  }
})

test("the same account entering on a second device takes the scene over; the older device is told and its steps are ignored", async () => {
  const f = createRoom()
  await f.service.enter("ca", "a", "room")
  await f.service.enter("cb", "b", "room")
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 1, x: .5, y: .57, hotspotId: SEAT })
  f.deliveries.length = 0
  await f.service.enter("ca-tablet", "a", "room")
  const superseded = f.deliveries.find(({ event }) => event.type === "mini_room.scene_superseded")!
  assert.deepEqual(superseded.connectionIds, ["ca"], "only the older device of that account is told")
  assert.equal(parseServerEvent(superseded.event).kind, "valid")
  const snapshots = f.deliveries.filter(({ event }) => event.type === "mini_room.motion_snapshot")
  assert.deepEqual(snapshots.at(-1)!.connectionIds, ["ca-tablet", "cb"])
  for (const { event } of snapshots) {
    const a = event.payload.avatars.find((avatar: any) => avatar.userId === "a")
    assert.equal(a.present, true, "the partner never sees the avatar flicker away")
    assert.equal(a.hotspotId, SEAT, "the takeover keeps the account's seat")
  }
  f.deliveries.length = 0
  await f.service.move("ca", "a", { miniRoomId: "room", sequence: 2, x: .6, y: .7 })
  assert.equal(f.deliveries.length, 0, "the replaced device no longer drives the avatar")
  await f.service.move("ca-tablet", "a", { miniRoomId: "room", sequence: 1, x: .6, y: .7 })
  assert.deepEqual(f.deliveries.at(-1)!.connectionIds, ["ca-tablet", "cb"])
  f.deliveries.length = 0
  f.service.disconnect("ca")
  assert.equal(f.deliveries.length, 0, "closing the replaced socket changes nothing for the room")
})
