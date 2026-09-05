import assert from "node:assert/strict"
import test from "node:test"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService, PUBLIC_LOBBY_ROOM_ID } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"

test("pair separation cancels pending invites, ends active rooms, and releases participant claims", async () => {
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const service = createMiniRoomService({
    presenceService,
    safetyService: createSafetyService(),
    chatService: createChatService(),
    livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `id_${++index}`
    })()
  })
  const now = new Date("2026-07-21T10:00:00.000Z")
  const profileA = { userId: "user_a", displayName: "Ada", avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0) }
  const profileB = { userId: "user_b", displayName: "Bora", avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0) }
  await presenceService.joinRoom({ roomId: PUBLIC_LOBBY_ROOM_ID, profile: profileA, initialSpotId: "seat-left" })
  await presenceService.joinRoom({ roomId: PUBLIC_LOBBY_ROOM_ID, profile: profileB, initialSpotId: "seat-right" })
  const activeInvite = await service.createInvite({ roomId: PUBLIC_LOBBY_ROOM_ID, senderProfile: profileA, recipientUserId: "user_b" }, now)
  const accepted = await service.decideInvite({ inviteId: activeInvite.inviteId, actorProfile: profileB, status: "accepted" }, now)
  await service.repository.saveInvite({
    inviteId: "invite_pending",
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderUserId: "user_a",
    recipientUserId: "user_b",
    senderSpotId: "spot_a",
    status: "pending",
    createdAt: now.toISOString()
  })

  const ended = await service.separateUserPair("user_a", "user_b", now)

  assert.equal(ended.length, 1)
  assert.equal(ended[0]?.miniRoomId, accepted.miniRoom?.miniRoomId)
  assert.equal((await service.repository.findInvite("invite_pending"))?.status, "cancelled")
  assert.equal(await service.findActiveMiniRoomForUser("user_a"), null)
  assert.equal((await presenceService.findUserPresence(PUBLIC_LOBBY_ROOM_ID, "user_a"))?.inMiniRoom, false)
})
