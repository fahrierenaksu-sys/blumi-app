import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, toAvatarLoadoutV2 } from "@blumi/domain"
import { projectChatThreadForAvatarRead } from "../routes/threadRoutes"

const THREAD: ChatThread = {
  threadId: "thread_projection",
  miniRoomId: "room_projection",
  participantUserIds: ["user_a", "user_b"],
  participants: [
    {
      userId: "user_a",
      displayName: "A",
      avatar: {
        presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
        revision: 2,
        loadout: toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)
      }
    },
    { userId: "user_b", displayName: "B" }
  ],
  createdAt: "2026-08-11T10:00:00.000Z"
}

test("chat thread projection keeps canonical storage but returns V1 to legacy readers", () => {
  const projected = projectChatThreadForAvatarRead(THREAD, false)

  assert.equal(projected.participants[0].avatar?.loadout.schemaVersion, 1)
  assert.equal(THREAD.participants[0].avatar?.loadout.schemaVersion, 2)
  assert.notEqual(projected, THREAD)
  assert.notEqual(projected.participants, THREAD.participants)
})

test("chat thread projection returns V2 only to resolved V2 readers", () => {
  const projected = projectChatThreadForAvatarRead(THREAD, true)

  assert.equal(projected.participants[0].avatar?.loadout.schemaVersion, 2)
  assert.notEqual(projected.participants[0].avatar, THREAD.participants[0].avatar)
})
