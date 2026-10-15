import assert from "node:assert/strict"
import test from "node:test"
import { MAX_SHARED_ROOM_DECOR_ITEMS, sharedRoomDecorSnapshotSchema } from "@blumi/contracts"
import { createPostgresMiniRoomRepository } from "../db/postgresMiniRoomRepository"
import { createOmittedItemsWarning, readSharedDecor } from "./sharedDecorSnapshot"

const ACTIVE = (itemId: string) => itemId.startsWith("active_")

function storedRow(itemIds: readonly string[]) {
  return {
    ownerUserId: "owner-1",
    revision: 3,
    capturedAt: "2026-10-15T10:00:00.000Z",
    source: "inviter",
    decor: {
      schemaVersion: 3,
      geometryVersion: "room_v2",
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: itemIds.map((itemId, index) => ({
        instanceId: `i${index}`, itemId, x: 0.5, y: 0.5, rotation: "front"
      }))
    }
  }
}

const idsOf = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}_${index}`)

test("a stored room with active items plus carried retired items is still readable", () => {
  const result = readSharedDecor(storedRow([...idsOf(60, "active"), ...idsOf(5, "retired")]), ACTIVE)
  assert.equal(result.snapshot.decor.placedItems.length, 60)
  assert.equal(result.omittedItemCount, 0)
  assert.equal(sharedRoomDecorSnapshotSchema.safeParse(result.snapshot).success, true)
})

test("more active items than the wire cap are bounded in stored order and the omitted count is reported", () => {
  const result = readSharedDecor(storedRow([...idsOf(60, "active"), ...idsOf(5, "active_late")]), ACTIVE)
  assert.equal(result.snapshot.decor.placedItems.length, MAX_SHARED_ROOM_DECOR_ITEMS)
  assert.equal(result.snapshot.decor.placedItems[0]?.itemId, "active_0")
  assert.equal(result.snapshot.decor.placedItems.at(-1)?.itemId, "active_59")
  assert.equal(result.omittedItemCount, 5)
  assert.equal(sharedRoomDecorSnapshotSchema.safeParse(result.snapshot).success, true)
})

test("a stored row with thousands of placements still reads, bounded to the wire cap", () => {
  const result = readSharedDecor(storedRow([...idsOf(1100, "retired"), ...idsOf(70, "active")]), ACTIVE)
  assert.equal(result.snapshot.decor.placedItems.length, MAX_SHARED_ROOM_DECOR_ITEMS)
  assert.equal(result.omittedItemCount, 10)
  assert.equal(sharedRoomDecorSnapshotSchema.safeParse(result.snapshot).success, true)
})

test("the omitted-items warning is logged once per room per interval and carries only a count", () => {
  let clock = 0
  const logged: unknown[][] = []
  const warn = createOmittedItemsWarning({ intervalMs: 1000, now: () => clock, warn: (...args) => logged.push(args) })
  warn("room-1", 5)
  warn("room-1", 5)
  warn("room-2", 3)
  assert.equal(logged.length, 2)
  clock = 1500
  warn("room-1", 5)
  assert.equal(logged.length, 3)
  assert.equal(JSON.stringify(logged).includes("room-"), false)
  warn("room-3", 0)
  assert.equal(logged.length, 3)
})

test("findMiniRoom returns a room whose stored decor holds 65 placements without throwing", async () => {
  const row = {
    mini_room_id: "room-1", lobby_room_id: "lobby-1",
    participant_a_user_id: "owner-1", participant_b_user_id: "guest-1",
    livekit_room_name: "room-1", started_at: "2026-10-15T10:00:00.000Z",
    shared_decor: storedRow([...idsOf(60, "room_v3_bed_blumi_starter"), ...idsOf(5, "room_v2_cozy_bed")])
  }
  const repository = createPostgresMiniRoomRepository({ query: async () => ({ rows: [row] }) })
  const room = await repository.findMiniRoom("room-1")
  assert.ok(room?.sharedDecor)
  assert.ok(room.sharedDecor.decor.placedItems.length <= MAX_SHARED_ROOM_DECOR_ITEMS)
  assert.equal(sharedRoomDecorSnapshotSchema.safeParse(room.sharedDecor).success, true)
})
