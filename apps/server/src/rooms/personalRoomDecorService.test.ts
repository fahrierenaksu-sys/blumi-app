import assert from "node:assert/strict"
import test from "node:test"
import {
  createPersonalRoomDecorService
} from "./personalRoomDecorService"
import { createInMemoryPersonalRoomDecorRepository, type PersonalRoomDecorSnapshot } from "./personalRoomDecorRepository"

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

// M5 (Phase 2 review): during the 2.5D cutover the TestFlight client still sends retired ids (its starter bed is
// room_v2_cozy_bed). The server leaves a retired id out instead of refusing the whole save; held and unknown ids
// are still refused, and no item outside the active catalog is ever placed, owned or not.
test("the default room catalog leaves out a retired id and refuses a held or unknown one", async () => {
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_cozy_bed", "room_v3_sofa_japon_cream", "room_v9_unknown"]
  })
  const saved = await service.save("user_1", {
    expectedRevision: 0,
    decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], itemId: "room_v2_cozy_bed" }] }
  })
  assert.equal(saved.kind, "saved")
  if (saved.kind !== "saved") return
  assert.deepEqual(saved.snapshot.decor.placedItems, [])
  assert.equal(saved.strippedItemCount, 1)
  assert.deepEqual((await service.repository.get("user_1"))?.decor.placedItems, [])
  for (const itemId of ["room_v3_sofa_japon_cream", "room_v9_unknown"]) {
    await assert.rejects(
      service.save("user_1", {
        expectedRevision: saved.snapshot.revision,
        decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], itemId }] }
      }),
      /not available/i
    )
  }
})

test("an old client's room save keeps its owned active items and drops only the retired bed", async () => {
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush"
  })
  const result = await service.save("user_1", {
    expectedRevision: 0,
    decor: {
      ...DECOR,
      placedItems: [
        DECOR.placedItems[0],
        { ...DECOR.placedItems[0], instanceId: "bed-1", itemId: "room_v2_cozy_bed" }
      ]
    }
  })
  assert.equal(result.kind, "saved")
  if (result.kind !== "saved") return
  assert.deepEqual(result.snapshot.decor.placedItems.map((item) => item.itemId), ["room_v2_chair_blush"])
  assert.equal(result.strippedItemCount, 1)
})

test("leaving out a retired item never lets an unowned active item through", async () => {
  const service = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => [],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush"
  })
  await assert.rejects(
    service.save("user_1", {
      expectedRevision: 0,
      decor: {
        ...DECOR,
        placedItems: [
          DECOR.placedItems[0],
          { ...DECOR.placedItems[0], instanceId: "bed-1", itemId: "room_v2_cozy_bed" }
        ]
      }
    }),
    /do not own/i
  )
  assert.equal(await service.repository.get("user_1"), null)
})

// M5 round 3 (fresh review MEDIUM-2): the read hides a user's stored retired placements, so a client never sends
// them back. A save must carry them over untouched in storage, never render them and never treat them as owned.
const STORED_RETIRED_PLACEMENTS = [
  { instanceId: "table-old", itemId: "room_v2_table_round", x: 0.31, y: 0.64, rotation: "left" as const, depth: 2 },
  { instanceId: "bench-old", itemId: "universal_bench_a", x: 0.7, y: 0.8, rotation: "front" as const, width: 1.5 }
]

async function createServiceWithStoredRetiredRoom() {
  const repository = createInMemoryPersonalRoomDecorRepository()
  const stored = await repository.save({
    userId: "user_1",
    expectedRevision: 0,
    decor: { ...DECOR, placedItems: [DECOR.placedItems[0], ...STORED_RETIRED_PLACEMENTS] },
    updatedAt: "2026-09-01T00:00:00.000Z"
  })
  assert.equal(stored.kind, "saved")
  const service = createPersonalRoomDecorService({
    repository,
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush", "room_v2_table_round", "universal_bench_a"],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush"
  })
  return service
}

const storedRetired = async (service: ReturnType<typeof createPersonalRoomDecorService>) =>
  (await service.repository.get("user_1"))?.decor.placedItems.filter((item) => item.itemId !== "room_v2_chair_blush")

test("an old client's save keeps the stored retired placements unchanged in storage", async () => {
  const service = await createServiceWithStoredRetiredRoom()
  const read = await service.get("user_1")
  assert.ok(read)
  assert.deepEqual(read.decor.placedItems.map((item) => item.itemId), ["room_v2_chair_blush"])

  // the TestFlight client adds its starter bed (retired) to what it was shown
  const result = await service.save("user_1", {
    expectedRevision: read.revision,
    decor: {
      ...read.decor,
      placedItems: [...read.decor.placedItems, { ...DECOR.placedItems[0], instanceId: "bed-1", itemId: "room_v2_cozy_bed" }]
    }
  })
  assert.equal(result.kind, "saved")
  if (result.kind !== "saved") return
  assert.equal(result.strippedItemCount, 1)
  assert.deepEqual(await storedRetired(service), STORED_RETIRED_PLACEMENTS)
  // never handed back or drawn
  assert.deepEqual(result.snapshot.decor.placedItems.map((item) => item.itemId), ["room_v2_chair_blush"])
  assert.deepEqual((await service.get("user_1"))?.decor.placedItems.map((item) => item.itemId), ["room_v2_chair_blush"])
})

test("a new client's save keeps the stored retired placements and draws only its own items", async () => {
  const drawn: string[][] = []
  const repository = (await createServiceWithStoredRetiredRoom()).repository
  const service = createPersonalRoomDecorService({
    repository,
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush",
    roomSnapshotService: {
      async publishForRoomSave(room: PersonalRoomDecorSnapshot) {
        drawn.push(room.decor.placedItems.map((item) => item.itemId))
        return null as never
      }
    } as never
  })
  const result = await service.save("user_1", {
    expectedRevision: 1,
    decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], x: 0.4 }] }
  })
  assert.equal(result.kind, "saved")
  assert.deepEqual(await storedRetired(service), STORED_RETIRED_PLACEMENTS)
  assert.deepEqual(drawn, [["room_v2_chair_blush"]])
})

test("carried retired placements grant nothing and never let a refused item through", async () => {
  const service = await createServiceWithStoredRetiredRoom()
  // a client cannot re-place a stored retired id as a new placement: it is left out like any retired id
  const resent = await service.save("user_1", {
    expectedRevision: 1,
    decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], instanceId: "table-new", itemId: "room_v2_table_round", x: 0.1 }] }
  })
  assert.equal(resent.kind, "saved")
  if (resent.kind !== "saved") return
  assert.deepEqual(resent.snapshot.decor.placedItems, [])
  assert.deepEqual(await storedRetired(service), STORED_RETIRED_PLACEMENTS)
  // held/unknown and unowned items are still refused, and a refused save leaves the row as it was
  const unowned = createPersonalRoomDecorService({
    repository: service.repository,
    getOwnedRoomItemIds: async () => [],
    isActiveRoomItemId: (itemId) => itemId === "room_v2_chair_blush"
  })
  await assert.rejects(unowned.save("user_1", { expectedRevision: 2, decor: DECOR }), /do not own/i)
  await assert.rejects(
    service.save("user_1", {
      expectedRevision: 2,
      decor: { ...DECOR, placedItems: [{ ...DECOR.placedItems[0], itemId: "room_v9_unknown" }] }
    }),
    /not available/i
  )
  assert.equal((await service.repository.get("user_1"))?.revision, 2)
  assert.deepEqual(await storedRetired(service), STORED_RETIRED_PLACEMENTS)
})

test("a revision conflict never hands stored retired placements to the client", async () => {
  const service = await createServiceWithStoredRetiredRoom()
  const stale = await service.save("user_1", { expectedRevision: 0, decor: DECOR })
  assert.equal(stale.kind, "conflict")
  if (stale.kind !== "conflict") return
  assert.deepEqual(stale.current.decor.placedItems.map((item) => item.itemId), ["room_v2_chair_blush"])
})

// Phase 2 closing review M3 and L2: a held (pricing-pending) item that the user owns and had placed is not active,
// so the read hides it and no client sends it back. A save must keep its stored placement exactly as it was, never
// show it, never grant it, and never refuse or reshuffle a save the user did not change for its sake.
const HELD_CHAIR_PLACEMENT = { instanceId: "chair-1", itemId: "room_v2_chair_blush", x: 0.22, y: 0.66, rotation: "right" as const }
const ACTIVE_TABLE_PLACEMENT = { instanceId: "table-1", itemId: "room_v2_table_round", x: 0.5, y: 0.7, rotation: "front" as const }

async function createServiceWithStoredHeldChair(rawOwned: readonly string[] = ["room_v2_chair_blush", "room_v2_table_round"]) {
  const repository = createInMemoryPersonalRoomDecorRepository()
  const stored = await repository.save({
    userId: "user_1",
    expectedRevision: 0,
    decor: { ...DECOR, placedItems: [HELD_CHAIR_PLACEMENT, ACTIVE_TABLE_PLACEMENT] },
    updatedAt: "2026-09-01T00:00:00.000Z"
  })
  assert.equal(stored.kind, "saved")
  return createPersonalRoomDecorService({
    repository,
    // the economy read projects held items out of ownership, the stored inventory row still holds them
    getOwnedRoomItemIds: async () => ["room_v2_table_round"],
    getStoredOwnedRoomItemIds: async () => rawOwned,
    isActiveRoomItemId: (itemId) => itemId === "room_v2_table_round"
  })
}

const storedItems = async (service: ReturnType<typeof createPersonalRoomDecorService>) =>
  (await service.repository.get("user_1"))?.decor.placedItems ?? []

test("a save keeps the stored placement of a held item the user owns and never shows or grants it", async () => {
  const service = await createServiceWithStoredHeldChair()
  const read = await service.get("user_1")
  assert.ok(read)
  assert.deepEqual(read.decor.placedItems.map((item) => item.itemId), ["room_v2_table_round"])

  const result = await service.save("user_1", {
    expectedRevision: read.revision,
    decor: { ...read.decor, placedItems: [{ ...ACTIVE_TABLE_PLACEMENT, x: 0.4 }] }
  })
  assert.equal(result.kind, "saved")
  if (result.kind !== "saved") return
  assert.deepEqual(await storedItems(service), [{ ...ACTIVE_TABLE_PLACEMENT, x: 0.4 }, HELD_CHAIR_PLACEMENT])
  assert.deepEqual(result.snapshot.decor.placedItems.map((item) => item.itemId), ["room_v2_table_round"])

  // sending the held item as a new placement is still refused: ownership never makes it placeable
  await assert.rejects(
    service.save("user_1", {
      expectedRevision: result.snapshot.revision,
      decor: { ...DECOR, placedItems: [HELD_CHAIR_PLACEMENT] }
    }),
    /not available/i
  )
  assert.deepEqual(await storedItems(service), [{ ...ACTIVE_TABLE_PLACEMENT, x: 0.4 }, HELD_CHAIR_PLACEMENT])
})

test("a stored placement of an item the user does not own is not carried over", async () => {
  const service = await createServiceWithStoredHeldChair(["room_v2_table_round"])
  const result = await service.save("user_1", { expectedRevision: 1, decor: { ...DECOR, placedItems: [ACTIVE_TABLE_PLACEMENT] } })
  assert.equal(result.kind, "saved")
  assert.deepEqual((await storedItems(service)).map((item) => item.itemId), ["room_v2_table_round"])
})

test("a new placement that reuses a carried placement's instanceId is kept under a unique id and the carried one is untouched", async () => {
  const service = await createServiceWithStoredHeldChair()
  const result = await service.save("user_1", {
    expectedRevision: 1,
    decor: { ...DECOR, placedItems: [{ ...ACTIVE_TABLE_PLACEMENT, instanceId: HELD_CHAIR_PLACEMENT.instanceId }] }
  })
  assert.equal(result.kind, "saved")
  if (result.kind !== "saved") return
  const items = await storedItems(service)
  assert.equal(new Set(items.map((item) => item.instanceId)).size, items.length)
  assert.deepEqual(items.find((item) => item.itemId === "room_v2_chair_blush"), HELD_CHAIR_PLACEMENT)
  assert.equal(items.find((item) => item.itemId === "room_v2_table_round")?.x, ACTIVE_TABLE_PLACEMENT.x)
  assert.deepEqual(result.snapshot.decor.placedItems.map((item) => item.itemId), ["room_v2_table_round"])
})

test("carried placements never make a valid save fail, even past the placement limit", async () => {
  const repository = createInMemoryPersonalRoomDecorRepository()
  const heldIds = Array.from({ length: 5 }, (_, index) => `held_item_${index}`)
  const activeIds = Array.from({ length: 60 }, (_, index) => `active_item_${index}`)
  const place = (itemId: string, index: number) => ({
    instanceId: `i-${itemId}`, itemId, x: (index % 10) / 10, y: 0.5, rotation: "front" as const
  })
  await repository.save({
    userId: "user_1",
    expectedRevision: 0,
    decor: { ...DECOR, placedItems: heldIds.map(place) },
    updatedAt: "2026-09-01T00:00:00.000Z"
  })
  const service = createPersonalRoomDecorService({
    repository,
    getOwnedRoomItemIds: async () => activeIds,
    getStoredOwnedRoomItemIds: async () => [...heldIds, ...activeIds],
    isActiveRoomItemId: (itemId) => itemId.startsWith("active_")
  })
  const result = await service.save("user_1", { expectedRevision: 1, decor: { ...DECOR, placedItems: activeIds.map(place) } })
  assert.equal(result.kind, "saved")
  const items = await storedItems(service)
  assert.equal(items.length, 65)
  assert.equal(new Set(items.map((item) => item.instanceId)).size, 65)
  // the 61st sent placement is still refused: the limit is only about what the client sends
  await assert.rejects(
    service.save("user_1", { expectedRevision: 2, decor: { ...DECOR, placedItems: [...activeIds, "active_extra"].map(place) } }),
    /up to 60/i
  )
})
