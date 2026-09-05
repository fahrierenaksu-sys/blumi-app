import assert from "node:assert/strict"
import test from "node:test"
import type { UserProfile } from "@blumi/contracts"
import {
  createAvatarSelection,
  DEFAULT_FEMALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { createChatService } from "../chat/chatService"
import { createLivekitTokenService } from "./livekitTokenService"
import { createMiniRoomService } from "./miniRoomService"
import {
  createInMemoryMiniRoomRepository,
  createInMemoryMiniRoomStore
} from "./miniRoomRepository"
import { createPresenceService } from "../presence/presenceService"
import { PUBLIC_LOBBY_ROOM_ID, createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"

test("native Blumi Room sessions can publish only microphone tracks", () => {
  const token = createLivekitTokenService({
    livekitUrl: "wss://livekit.blumi.test",
    apiKey: "test-key",
    apiSecret: "test-secret"
  }).createMediaSession({
    miniRoom: {
      miniRoomId: "room_voice_only",
      lobbyRoomId: "thread_voice_only",
      participantUserIds: ["user_one", "user_two"],
      livekitRoomName: "blumi-room-voice-only"
    },
    userId: "user_one",
    now: new Date("2026-07-21T12:00:00.000Z")
  })

  const [, encodedPayload] = token.token.split(".")
  assert.ok(encodedPayload)
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    video: { canPublish: boolean; canPublishSources?: string[] }
  }

  assert.equal(payload.video.canPublish, true)
  assert.deepEqual(payload.video.canPublishSources, ["microphone"])
})

test("a pending invite can create at most one mini room under concurrent accepts", async () => {
  const presenceService = createPresenceService({
    roomService: createRoomService()
  })
  const service = createMiniRoomService({
    presenceService,
    safetyService: createSafetyService(),
    chatService: createChatService(),
    livekitTokenService: createLivekitTokenService()
  })
  const now = new Date("2026-07-14T09:00:00.000Z")
  const sender = profile("sender_user", "Ada")
  const recipient = profile("recipient_user", "Bora")
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: sender,
    initialSpotId: "seat-left"
  }, now)
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: recipient,
    initialSpotId: "seat-right"
  }, now)
  const invite = await service.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: sender,
    recipientUserId: recipient.userId
  }, now)

  const attempts = await Promise.allSettled([
    service.decideInvite({
      inviteId: invite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now),
    service.decideInvite({
      inviteId: invite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now)
  ])

  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1
  )
  assert.equal(
    attempts.filter((attempt) => attempt.status === "rejected").length,
    1
  )
})

test("different invites cannot create overlapping active mini rooms concurrently", async () => {
  const presenceService = createPresenceService({
    roomService: createRoomService()
  })
  const service = createMiniRoomService({
    presenceService,
    safetyService: createSafetyService(),
    chatService: createChatService(),
    livekitTokenService: createLivekitTokenService()
  })
  const now = new Date("2026-07-14T09:00:00.000Z")
  const sender = profile("sender_user", "Ada")
  const recipient = profile("recipient_user", "Bora")
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: sender,
    initialSpotId: "seat-left"
  }, now)
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: recipient,
    initialSpotId: "seat-right"
  }, now)
  const [firstInvite, secondInvite] = await Promise.all([
    service.createInvite({
      roomId: PUBLIC_LOBBY_ROOM_ID,
      senderProfile: sender,
      recipientUserId: recipient.userId
    }, now),
    service.createInvite({
      roomId: PUBLIC_LOBBY_ROOM_ID,
      senderProfile: sender,
      recipientUserId: recipient.userId
    }, now)
  ])

  const attempts = await Promise.allSettled([
    service.decideInvite({
      inviteId: firstInvite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now),
    service.decideInvite({
      inviteId: secondInvite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now)
  ])

  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1
  )
  assert.equal(
    attempts.filter((attempt) => attempt.status === "rejected").length,
    1
  )
  assert.ok(await service.findActiveMiniRoomForUser(sender.userId))
  assert.ok(await service.findActiveMiniRoomForUser(recipient.userId))
  const inviteStatuses = await Promise.all([
    service.repository.findInvite(firstInvite.inviteId),
    service.repository.findInvite(secondInvite.inviteId)
  ])
  assert.deepEqual(
    inviteStatuses.map((invite) => invite?.status).sort(),
    ["accepted", "cancelled"]
  )
})

test("a participant claim loser cancels the invite without creating another room", async () => {
  const store = createInMemoryMiniRoomStore()
  const repository = createInMemoryMiniRoomRepository(store)
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const service = createMiniRoomService({
    repository,
    presenceService,
    safetyService: createSafetyService(),
    chatService: createChatService(),
    livekitTokenService: createLivekitTokenService()
  })
  const now = new Date("2026-07-14T09:00:00.000Z")
  const sender = profile("sender_claim_loser", "Ada")
  const recipient = profile("recipient_claim_loser", "Bora")
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: sender,
    initialSpotId: "seat-left"
  }, now)
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: recipient,
    initialSpotId: "seat-right"
  }, now)
  const invite = await service.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: sender,
    recipientUserId: recipient.userId
  }, now)
  store.miniRooms.set("preexisting_room", {
    miniRoomId: "preexisting_room",
    lobbyRoomId: PUBLIC_LOBBY_ROOM_ID,
    participantUserIds: [sender.userId, "other_user"],
    livekitRoomName: "blumi-preexisting",
    startedAt: now.toISOString()
  })

  await assert.rejects(
    service.decideInvite({
      inviteId: invite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now),
    /no longer available/
  )

  assert.equal((await repository.findInvite(invite.inviteId))?.status, "cancelled")
  assert.equal(
    (await repository.findActiveMiniRoomForUser(sender.userId))?.miniRoomId,
    "preexisting_room"
  )
  assert.equal(await repository.findActiveMiniRoomForUser(recipient.userId), null)
})

test("post-claim setup failure rolls back invite, room, claims, and busy presence", async () => {
  const repository = createInMemoryMiniRoomRepository()
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const chatService = createChatService()
  const service = createMiniRoomService({
    repository,
    presenceService,
    safetyService: createSafetyService(),
    chatService: {
      ...chatService,
      async createThread() {
        throw new Error("chat setup unavailable")
      }
    },
    livekitTokenService: createLivekitTokenService()
  })
  const now = new Date("2026-07-14T09:00:00.000Z")
  const sender = profile("sender_rollback", "Ada")
  const recipient = profile("recipient_rollback", "Bora")
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: sender,
    initialSpotId: "seat-left"
  }, now)
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: recipient,
    initialSpotId: "seat-right"
  }, now)
  const invite = await service.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: sender,
    recipientUserId: recipient.userId
  }, now)

  await assert.rejects(
    service.decideInvite({
      inviteId: invite.inviteId,
      actorProfile: recipient,
      status: "accepted"
    }, now),
    /chat setup unavailable/
  )

  assert.equal((await repository.findInvite(invite.inviteId))?.status, "cancelled")
  assert.equal(await repository.findActiveMiniRoomForUser(sender.userId), null)
  assert.equal(await repository.findActiveMiniRoomForUser(recipient.userId), null)
  assert.equal(
    (await presenceService.findUserPresence(
      PUBLIC_LOBBY_ROOM_ID,
      sender.userId,
      now
    ))?.inMiniRoom,
    false
  )
  assert.equal(
    (await presenceService.findUserPresence(
      PUBLIC_LOBBY_ROOM_ID,
      recipient.userId,
      now
    ))?.inMiniRoom,
    false
  )
})

function profile(userId: string, displayName: string): UserProfile {
  return {
    userId,
    displayName,
    avatar: {
      ...createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0),
      presetId: "avatar_v2_body_default"
    }
  }
}
