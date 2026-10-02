import assert from "node:assert/strict"
import test from "node:test"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"

test("pair separation cancels pending invites, ends active rooms, and releases participant claims", async () => {
  const chatService = createChatService()
  const service = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService: createSafetyService(),
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `id_${++index}`
    })()
  })
  const now = new Date("2026-07-21T10:00:00.000Z")
  const profileA = { userId: "user_a", displayName: "Ada", avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0) }
  const profileB = { userId: "user_b", displayName: "Bora", avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0) }
  const threadId = "thread_separation"
  await chatService.createThread({
    threadId,
    miniRoomId: "match_separation",
    participantUserIds: [profileA.userId, profileB.userId],
    participants: [
      { userId: profileA.userId, displayName: profileA.displayName },
      { userId: profileB.userId, displayName: profileB.displayName }
    ]
  })
  const created = await service.createChatInvite({ threadId, senderProfile: profileA, recipientProfile: profileB }, now)
  const accepted = await service.decideChatInvite({
    inviteId: created.invite.inviteId,
    actorUserId: profileB.userId,
    senderProfile: profileA,
    recipientProfile: profileB,
    status: "accepted"
  }, now)
  assert.ok(accepted.miniRoom)
  await service.repository.saveInvite({
    inviteId: "invite_pending",
    senderUserId: "user_a",
    recipientUserId: "user_b",
    sourceThreadId: threadId,
    status: "pending",
    createdAt: now.toISOString()
  })

  const ended = await service.separateUserPair("user_a", "user_b", now)

  assert.equal(ended.length, 1)
  assert.equal(ended[0]?.miniRoomId, accepted.miniRoom.miniRoomId)
  assert.equal((await service.repository.findInvite("invite_pending"))?.status, "cancelled")
  assert.equal(await service.findActiveMiniRoomForUser("user_a"), null)
  assert.equal(await service.findActiveMiniRoomForUser("user_b"), null)
})
