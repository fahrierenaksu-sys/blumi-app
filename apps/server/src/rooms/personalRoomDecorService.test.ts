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

function createService() {
  return createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => [
      "room_v2_chair_blush",
      "room_v2_table_round"
    ]
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
