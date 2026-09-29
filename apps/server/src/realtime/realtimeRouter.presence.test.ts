import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import type { RoomLayout, ServerEvent, UserProfile } from "@blumi/contracts"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, getNearbyUsers } from "@blumi/domain"
import type { WebSocket } from "ws"
import { createChatService } from "../chat/chatService"
import type { ConnectionService } from "../connections/connectionService"
import { createPostgresSafetyRepository } from "../db/postgresSafetyRepository"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import { createNotificationService } from "../notifications/notificationService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createConnectionManager } from "./connectionManager"
import { createRealtimeRouter } from "./realtimeRouter"

const BLOCKS = [
  ["user_0", "user_1"],
  ["user_1", "user_0"], // Both directions must still produce one blocked peer.
  ["user_2", "user_0"],
  ["user_3", "outside_room"],
  ["unrelated_a", "unrelated_b"]
] as const

async function createHarness(context: TestContext, count = 6) {
  const queries: { sql: string; values?: readonly unknown[] }[] = []
  let failLookup = false
  const safetyService = createSafetyService({ repository: createPostgresSafetyRepository({
    async query(sql, values) {
      queries.push({ sql, values })
      if (failLookup) throw new Error("block lookup unavailable")
      const viewer = values?.[0]
      const candidates = values?.[1]
      if (Array.isArray(candidates)) {
        assert.match(sql, /blocked_user_id = ANY\(\$2::text\[\]\)/)
        assert.match(sql, /actor_user_id = ANY\(\$2::text\[\]\)/)
        const peers = new Set(candidates)
        const blocked = BLOCKS.flatMap(([actor, target]) =>
          actor === viewer && peers.has(target) ? [target] :
            target === viewer && peers.has(actor) ? [actor] : [])
        return { rows: [...new Set(blocked)].map(blocked_user_id => ({ blocked_user_id })) }
      }
      return { rows: BLOCKS.filter(([actor, target]) => actor === viewer && target === candidates)
        .map(([actor_user_id, blocked_user_id]) => ({
          actor_user_id, blocked_user_id, created_at: "2026-09-29T12:00:00.000Z"
        })) }
    }
  }) })
  const roomService = createRoomService()
  const layout: RoomLayout = {
    roomId: "publication-test",
    proximityRadius: 1000,
    spots: Array.from({ length: count }, (_, index) => ({
      spotId: `spot_${index}`, kind: "seat", x: index * 20, y: 0
    }))
  }
  await roomService.repository.saveLayout(layout)
  const presenceService = createPresenceService({ roomService })
  const manager = createConnectionManager()
  const deliveries = new Map<string, ServerEvent[]>()
  const now = new Date()
  function connect(userId: string) {
    const profile: UserProfile = { userId, displayName: userId, avatar: {
      presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
      loadout: {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds]
      }, revision: 1
    } }
    const events: ServerEvent[] = []
    deliveries.set(userId, events)
    const connection = manager.addConnection({ profile, socket: {
      readyState: 1,
      send(body: string) { events.push(JSON.parse(body) as ServerEvent) }
    } as WebSocket })
    manager.joinRoom(connection.connectionId, layout.roomId)
    return { connection, profile }
  }
  for (let index = 0; index < count; index += 1) {
    const { profile } = connect(`user_${index}`)
    await presenceService.repository.savePresence({
      roomId: layout.roomId, userId: profile.userId, displayName: profile.displayName,
      avatar: { presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
        loadout: {
          ...DEFAULT_FEMALE_AVATAR_LOADOUT,
          accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds]
        }, revision: 1 },
      spotId: `spot_${index}`, inMiniRoom: index === 4,
      joinedAt: now.toISOString(), updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString()
    })
  }
  const departed = connect("departed").connection
  const snapshotSpy = context.mock.method(presenceService, "createSnapshot")
  const nearbySpy = context.mock.method(presenceService, "listNearbyUsers")
  const layoutSpy = context.mock.method(roomService, "getOrCreateLayout")
  const router = createRealtimeRouter({
    connectionManager: manager, presenceService, safetyService,
    chatService: createChatService(), notificationService: createNotificationService(),
    reactionService: createReactionService(),
    // These dependencies are never called by room.leave/publication.
    miniRoomService: {} as MiniRoomService,
    connectionService: {} as ConnectionService
  })
  return { queries, safetyService, layout, presenceService, deliveries,
    snapshotSpy, nearbySpy, layoutSpy,
    failLookup() { failLookup = true },
    publish: () => router.handleClientEvent(departed, {
      type: "room.leave", payload: { roomId: layout.roomId }
    }) }
}

test("six-user presence publication uses six block SQL reads with equivalent bidirectional flags and delivery", async (context) => {
  const harness = await createHarness(context)
  const snapshot = await harness.presenceService.createSnapshot(harness.layout.roomId)
  harness.snapshotSpy.mock.resetCalls()
  const expected = new Map<string, ReturnType<typeof getNearbyUsers>>()
  for (const viewer of snapshot.users) {
    const blocked: string[] = []
    for (const candidate of snapshot.users) {
      if (candidate.userId !== viewer.userId &&
        await harness.safetyService.hasBlockBetween(viewer.userId, candidate.userId)) blocked.push(candidate.userId)
    }
    expected.set(viewer.userId, getNearbyUsers(harness.layout, snapshot.users, viewer.userId, blocked))
  }
  assert.equal(expected.get("user_0")?.find(user => user.userId === "user_1")?.blocked, true)
  assert.equal(expected.get("user_0")?.find(user => user.userId === "user_2")?.blocked, true)
  assert.equal(expected.get("user_2")?.find(user => user.userId === "user_0")?.blocked, true)
  assert.equal(expected.get("user_0")?.find(user => user.userId === "user_3")?.blocked, false)
  assert.equal(harness.queries.length, 60, "old ordered-pair algorithm performs two SQL reads per pair")
  harness.queries.length = 0
  await harness.publish()
  context.diagnostic(`block SQL reads: old algorithm 60; router ${harness.queries.length}`)
  for (const user of snapshot.users) {
    const events = harness.deliveries.get(user.userId)!
    assert.equal(events.length, 2)
    assert.equal(events[0].type, "presence.snapshot")
    if (events[0].type === "presence.snapshot") assert.deepEqual(events[0].payload.users, snapshot.users)
    assert.deepEqual(events[1], { type: "presence.nearby", payload: {
      roomId: harness.layout.roomId, userId: user.userId, nearbyUsers: expected.get(user.userId)
    } })
  }
  assert.equal(harness.queries.length, 6)
  for (const query of harness.queries) {
    assert.ok(Array.isArray(query.values?.[1]))
    assert.deepEqual(query.values![1], snapshot.users
      .filter(user => user.userId !== query.values![0]).map(user => user.userId))
  }
  assert.equal(harness.snapshotSpy.mock.callCount(), 1)
  assert.equal(harness.nearbySpy.mock.callCount(), 6)
  assert.equal(harness.layoutSpy.mock.callCount(), 6)
  assert.deepEqual(harness.deliveries.get("departed")?.map(event => event.type), ["room.left"])
})

test("block lookup failure preserves snapshot broadcast and fails closed before nearby delivery", async (context) => {
  const harness = await createHarness(context)
  harness.failLookup()
  await assert.rejects(harness.publish(), /block lookup unavailable/)
  assert.equal(harness.nearbySpy.mock.callCount(), 0)
  for (let index = 0; index < 6; index += 1) {
    assert.deepEqual(harness.deliveries.get(`user_${index}`)?.map(event => event.type), ["presence.snapshot"])
  }
})

for (const count of [0, 1]) {
  test(`${count}-user publication performs no block SQL reads and retains nearby delivery`, async (context) => {
    const harness = await createHarness(context, count)
    await harness.publish()
    assert.equal(harness.queries.length, 0)
    assert.equal(harness.snapshotSpy.mock.callCount(), 1)
    assert.equal(harness.nearbySpy.mock.callCount(), count)
    if (count === 1) assert.deepEqual(harness.deliveries.get("user_0")?.[1], {
      type: "presence.nearby", payload: { roomId: harness.layout.roomId, userId: "user_0", nearbyUsers: [] }
    })
  })
}
