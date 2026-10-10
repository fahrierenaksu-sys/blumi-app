import assert from "node:assert/strict"
import test from "node:test"
import {
  createPersonalRoomDecorService
} from "./personalRoomDecorService"

const DECOR = {
  schemaVersion: 3,
  geometryVersion: "room_v2",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{
    instanceId: "chair-1",
    itemId: "room_v2_chair_blush",
    x: 0.5,
    y: 0.72,
    rotation: "front" as const
  }]
}

// A stand-in active room catalog: these tests are about revisions and validation, not about which art is live.
const TEST_ACTIVE_ROOM_ITEM_IDS = new Set([
  "room_v2_chair_blush",
  "room_v2_table_round",
  "room_v2_cozy_bed"
])
const isTestActiveRoomItemId = (itemId: string) => TEST_ACTIVE_ROOM_ITEM_IDS.has(itemId)

function createService() {
  return createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => [
      "room_v2_chair_blush",
      "room_v2_table_round"
    ],
    isActiveRoomItemId: isTestActiveRoomItemId
  })
}

test("personal room decor saves with optimistic revisions and immutable reads", async () => {
  const service = createService()

  assert.equal(await service.get("user_1"), null)
  const first = await service.save("user_1", {
    expectedRevision: 0,
    decor: DECOR
  }, new Date("2026-07-26T12:00:00.000Z"))
  assert.equal(first.kind, "saved")
  if (first.kind !== "saved") return
  assert.equal(first.snapshot.revision, 1)

  const stale = await service.save("user_1", {
    expectedRevision: 0,
    decor: {
      ...DECOR,
      placedItems: [{ ...DECOR.placedItems[0], x: 0.6 }]
    }
  })
  assert.equal(stale.kind, "conflict")
  if (stale.kind !== "conflict") return
  assert.equal(stale.current.revision, 1)

  const loaded = await service.get("user_1")
  assert.ok(loaded)
  loaded.decor.placedItems[0]!.x = 0.1
  assert.equal((await service.get("user_1"))?.decor.placedItems[0]?.x, 0.5)
})

test("only a successful room revision requests a showcase snapshot", async () => {
  const publishedRevisions: number[] = []
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"],
    isActiveRoomItemId: isTestActiveRoomItemId,
    roomSnapshotService: {
      async publishForRoomSave(room) {
        publishedRevisions.push(room.revision)
        return {
          userId: room.userId,
          roomRevision: room.revision,
          assetKey: `asset-${room.revision}`,
          mimeType: "image/webp",
          rendererVersion: "test",
          body: Buffer.from("snapshot"),
          isPublic: false,
          headline: null,
          updatedAt: room.updatedAt
        }
      },
      async getLatestForUser() { return null },
      async findByAssetKey() { return null },
      async setVisibilityForRoom() { return null }
    }
  })

  await service.save("user_1", { expectedRevision: 0, decor: DECOR })
  await service.save("user_1", { expectedRevision: 0, decor: DECOR })

  assert.deepEqual(publishedRevisions, [1])
})

test("personal room decor rejects unowned, duplicate, and invalid placement data", async () => {
  const service = createService()

  await assert.rejects(
    service.save("user_1", {
      expectedRevision: 0,
      decor: {
        ...DECOR,
        placedItems: [{
          ...DECOR.placedItems[0],
          itemId: "room_v2_cozy_bed"
        }]
      }
    }),
    /do not own/i
  )

  await assert.rejects(
    service.save("user_1", {
      expectedRevision: 0,
      decor: {
        ...DECOR,
        placedItems: [
          DECOR.placedItems[0],
          { ...DECOR.placedItems[0], x: 1.4 }
        ]
      }
    }),
    /placement/i
  )
})

test("personal room decor enforces the supported shell, schema, and canonical item geometry", async () => {
  const service = createService()

  for (const decor of [
    { ...DECOR, roomShellId: "room_v3_unpromoted_shell" },
    { ...DECOR, schemaVersion: 999 },
    { ...DECOR, geometryVersion: "future_geometry" },
    {
      ...DECOR,
      placedItems: [{ ...DECOR.placedItems[0], width: -0.2 }]
    },
    {
      ...DECOR,
      placedItems: [{ ...DECOR.placedItems[0], height: 50 }]
    },
    {
      ...DECOR,
      placedItems: [{ ...DECOR.placedItems[0], depth: -1 }]
    }
  ]) {
    await assert.rejects(
      service.save("user_1", { expectedRevision: 0, decor }),
      /room layout|placement/i
    )
  }
})

test("personal room decor canonicalizes omitted version metadata and rejects duplicate owned products", async () => {
  const service = createService()
  const { schemaVersion: _schemaVersion, geometryVersion: _geometryVersion, ...legacyDecor } =
    DECOR
  const saved = await service.save("user_1", {
    expectedRevision: 0,
    decor: legacyDecor
  })
  assert.equal(saved.kind, "saved")
  if (saved.kind !== "saved") return
  assert.equal(saved.snapshot.decor.schemaVersion, 3)
  assert.equal(saved.snapshot.decor.geometryVersion, "room_v2")

  await assert.rejects(
    service.save("user_2", {
      expectedRevision: 0,
      decor: {
        ...DECOR,
        placedItems: [
          DECOR.placedItems[0],
          {
            ...DECOR.placedItems[0],
            instanceId: "chair-2",
            x: 0.65
          }
        ]
      }
    }),
    /placement/i
  )
})

test("a stored room reads without legacy, unknown, held or unowned items and keeps its revision", async () => {
  const owned = new Set(["room_v2_chair_blush", "room_v2_table_round"])
  const active = new Set(["room_v2_chair_blush", "room_v2_table_round"])
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => [...owned],
    isActiveRoomItemId: (itemId) => active.has(itemId)
  })
  const saved = await service.save("user_1", {
    expectedRevision: 0,
    decor: {
      ...DECOR,
      placedItems: [
        DECOR.placedItems[0],
        { ...DECOR.placedItems[0], instanceId: "table-1", itemId: "room_v2_table_round", x: 0.3 }
      ]
    }
  })
  assert.equal(saved.kind, "saved")

  // The table is retired after the save and the chair is no longer owned: the stored row is untouched, the read
  // shows an empty room at the same revision, and a save with that revision succeeds.
  active.delete("room_v2_table_round")
  owned.delete("room_v2_chair_blush")
  const read = await service.get("user_1")
  assert.ok(read)
  assert.equal(read.revision, 1)
  assert.deepEqual(read.decor.placedItems, [])
  assert.equal(read.decor.roomShellId, "room_v2_shell_blumi_world_v1")
  const stored = await service.repository.get("user_1")
  assert.equal(stored?.decor.placedItems.length, 2)

  const next = await service.save("user_1", {
    expectedRevision: read.revision,
    decor: { ...read.decor, placedItems: [] }
  })
  assert.equal(next.kind, "saved")
})

test("saving refuses an item outside the active room catalog even when it is owned", async () => {
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush", "room_v3_sofa_japon_cream"],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush"
  })
  await assert.rejects(
    service.save("user_1", {
      expectedRevision: 0,
      decor: {
        ...DECOR,
        placedItems: [{ ...DECOR.placedItems[0], itemId: "room_v3_sofa_japon_cream" }]
      }
    }),
    /not available/i
  )
})

test("the default room catalog never accepts a retired, held or unknown room id", async () => {
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_cozy_bed", "room_v3_sofa_japon_cream", "room_v9_unknown"]
  })
  for (const itemId of ["room_v2_cozy_bed", "room_v3_sofa_japon_cream", "room_v9_unknown"]) {
    await assert.rejects(
      service.save("user_1", {
        expectedRevision: 0,
        decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], itemId }] }
      }),
      /not available/i
    )
  }
})
