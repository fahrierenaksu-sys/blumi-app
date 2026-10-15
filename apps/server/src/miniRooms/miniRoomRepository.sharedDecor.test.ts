import assert from "node:assert/strict"
import test from "node:test"
import { MAX_SHARED_ROOM_DECOR_ITEMS } from "@blumi/contracts"
import { createInMemoryMiniRoomRepository } from "./miniRoomRepository"
import type { PersonalRoomDecorSnapshot } from "../rooms/personalRoomDecorRepository"

const place = (itemId: string, index: number) => ({
  instanceId: `i${index}`, itemId, x: 0.5, y: 0.5, rotation: "front" as const
})

// Production copies the host's stored row at accept time and projects it on every read; the in-memory repository
// must do the same so tests see the same retired filtering and the same 60-item cap.
test("the in-memory repository reads a shared room with retired items filtered and the wire cap applied", async () => {
  const itemIds = [
    "room_v2_cozy_bed", // retired (legacy registry)
    ...Array.from({ length: 70 }, (_, index) => `room_v3_bed_blumi_starter_${index}`)
  ]
  const stored: PersonalRoomDecorSnapshot = {
    userId: "host", revision: 4, updatedAt: "2026-10-15T10:00:00.000Z",
    decor: { schemaVersion: 3, geometryVersion: "room_v2", roomShellId: "room_v2_shell_blumi_world_v1", placedItems: itemIds.map(place) }
  }
  const repository = createInMemoryMiniRoomRepository(undefined, async () => stored, (itemId) => itemId.startsWith("room_v3_"))
  const now = "2026-10-15T10:00:00.000Z"
  await repository.createOrFindPendingChatInvite({
    inviteId: "invite-1", senderUserId: "host", recipientUserId: "guest", status: "pending", sourceThreadId: "thread-1",
    createdAt: now, expiresAt: "2026-10-16T10:00:00.000Z"
  } as never, new Date(now))
  const accepted = await repository.acceptPendingInvite({
    inviteId: "invite-1", decidedAt: now,
    miniRoom: { miniRoomId: "room-1", lobbyRoomId: "lobby-1", participantUserIds: ["host", "guest"], livekitRoomName: "room-1", startedAt: now }
  } as never)
  assert.equal(accepted, "accepted")
  const room = await repository.findMiniRoom("room-1")
  const items = room?.sharedDecor?.decor.placedItems ?? []
  assert.equal(items.length, MAX_SHARED_ROOM_DECOR_ITEMS)
  assert.equal(items.some((item) => item.itemId === "room_v2_cozy_bed"), false)
})
