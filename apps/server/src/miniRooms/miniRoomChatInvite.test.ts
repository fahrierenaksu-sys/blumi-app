import assert from "node:assert/strict"
import test from "node:test"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { UserProfile } from "@blumi/contracts"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"
import { createInMemoryPersonalRoomDecorRepository } from "../rooms/personalRoomDecorRepository"

test("accepted shared room freezes inviter decor at acceptance, not invite creation or later edits", async () => {
  const decor = createInMemoryPersonalRoomDecorRepository()
  const harness = await createHarness((userId) => decor.get(userId))
  const now = new Date("2026-07-21T10:00:00.000Z")
  const layout = (roomShellId: string) => ({ schemaVersion: 3, geometryVersion: "room_v2", roomShellId, placedItems: [] })
  await decor.save({ userId: harness.sender.userId, expectedRevision: 0, decor: layout("before"), updatedAt: now.toISOString() })
  await decor.save({ userId: harness.recipient.userId, expectedRevision: 0, decor: layout("recipient"), updatedAt: now.toISOString() })
  const created = await harness.service.createChatInvite({ threadId: harness.threadId, senderProfile: harness.sender, recipientProfile: harness.recipient }, now)
  await decor.save({ userId: harness.sender.userId, expectedRevision: 1, decor: layout("at-accept"), updatedAt: now.toISOString() })
  const accepted = await harness.service.decideChatInvite({ inviteId: created.invite.inviteId, actorUserId: harness.recipient.userId,
    senderProfile: harness.sender, recipientProfile: harness.recipient, status: "accepted" }, now)
  assert.equal(accepted.miniRoom?.sharedDecor?.decor.roomShellId, "at-accept")
  assert.equal(accepted.miniRoom?.sharedDecor?.revision, 2)
  await decor.save({ userId: harness.sender.userId, expectedRevision: 2, decor: layout("after"), updatedAt: now.toISOString() })
  const rejoined = await harness.service.repository.findMiniRoom(accepted.miniRoom!.miniRoomId)
  assert.equal(rejoined?.sharedDecor?.decor.roomShellId, "at-accept")
  assert.deepEqual(rejoined?.sharedDecor, accepted.miniRoom?.sharedDecor)
})

test("chat room invites are durable, do not require lobby presence, and allow only one pending invite per thread", async () => {
  const harness = await createHarness()
  const now = new Date("2026-07-21T10:00:00.000Z")

  const first = await harness.service.createChatInvite({
    threadId: harness.threadId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient
  }, now)
  const repeated = await harness.service.createChatInvite({
    threadId: harness.threadId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient
  }, new Date("2026-07-21T10:01:00.000Z"))

  assert.equal(first.created, true)
  assert.equal(repeated.created, false)
  assert.equal(repeated.invite.inviteId, first.invite.inviteId)
  assert.equal(first.invite.sourceThreadId, harness.threadId)
  assert.equal(first.invite.senderSpotId, undefined)
  assert.equal(first.invite.expiresAt, "2026-07-21T10:10:00.000Z")
  assert.equal(
    (await harness.service.listChatInvites(harness.sender.userId, harness.threadId, now)).length,
    1
  )
})

test("accepting the same chat room invite is idempotent and claims exactly one room", async () => {
  const harness = await createHarness()
  const now = new Date("2026-07-21T10:00:00.000Z")
  const created = await harness.service.createChatInvite({
    threadId: harness.threadId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient
  }, now)

  const first = await harness.service.decideChatInvite({
    inviteId: created.invite.inviteId,
    actorUserId: harness.recipient.userId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient,
    status: "accepted"
  }, now)
  const repeated = await harness.service.decideChatInvite({
    inviteId: created.invite.inviteId,
    actorUserId: harness.recipient.userId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient,
    status: "accepted"
  }, new Date("2026-07-21T10:00:01.000Z"))

  assert.equal(first.invite.status, "accepted")
  assert.equal(first.miniRoom?.sourceThreadId, harness.threadId)
  assert.equal(repeated.miniRoom?.miniRoomId, first.miniRoom?.miniRoomId)
  assert.equal(
    (await harness.service.listChatInvites(
      harness.sender.userId,
      harness.threadId,
      now
    ))[0]?.roomSessionId,
    first.miniRoom?.miniRoomId
  )
  assert.equal(
    (await harness.service.findActiveMiniRoomForUser(harness.sender.userId))?.miniRoomId,
    first.miniRoom?.miniRoomId
  )

  await harness.safetyService.blockUser(harness.sender.userId, harness.recipient.userId)
  await assert.rejects(
    harness.service.decideChatInvite({
      inviteId: created.invite.inviteId,
      actorUserId: harness.recipient.userId,
      senderProfile: harness.sender,
      recipientProfile: harness.recipient,
      status: "accepted"
    }, new Date("2026-07-21T10:01:30.000Z")),
    /not available/
  )

  await harness.service.leaveMiniRoom(
    first.miniRoom!.miniRoomId,
    harness.sender.userId,
    new Date("2026-07-21T10:02:00.000Z")
  )
  await assert.rejects(
    harness.service.decideChatInvite({
      inviteId: created.invite.inviteId,
      actorUserId: harness.recipient.userId,
      senderProfile: harness.sender,
      recipientProfile: harness.recipient,
      status: "accepted"
    }, new Date("2026-07-21T10:03:00.000Z")),
    /not available/
  )
})

test("chat room invites expire durably and blocked pairs fail closed", async () => {
  const harness = await createHarness()
  const now = new Date("2026-07-21T10:00:00.000Z")
  const created = await harness.service.createChatInvite({
    threadId: harness.threadId,
    senderProfile: harness.sender,
    recipientProfile: harness.recipient
  }, now)

  await assert.rejects(
    harness.service.decideChatInvite({
      inviteId: created.invite.inviteId,
      actorUserId: harness.recipient.userId,
      senderProfile: harness.sender,
      recipientProfile: harness.recipient,
      status: "accepted"
    }, new Date("2026-07-21T10:10:00.000Z")),
    /expired/
  )
  assert.equal(
    (await harness.service.repository.findInvite(created.invite.inviteId))?.status,
    "expired"
  )

  await harness.safetyService.blockUser(harness.sender.userId, harness.recipient.userId)
  await assert.rejects(
    harness.service.createChatInvite({
      threadId: harness.threadId,
      senderProfile: harness.sender,
      recipientProfile: harness.recipient
    }, new Date("2026-07-21T10:11:00.000Z")),
    /not available/
  )
})

async function createHarness(getPersonalRoomDecor?: Parameters<typeof createMiniRoomService>[0]["getPersonalRoomDecor"]) {
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const mediaCredential = ["test", "media", "fixture"].join("-")
  const service = createMiniRoomService({
    getPersonalRoomDecor,
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: mediaCredential }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `chat_invite_${++index}`
    })()
  })
  const sender = profile("sender_user", "Ada")
  const recipient = profile("recipient_user", "Bora")
  const threadId = "thread_match_mutual"
  await chatService.createThread({
    threadId,
    miniRoomId: "match_mutual",
    participantUserIds: [sender.userId, recipient.userId],
    participants: [
      { userId: sender.userId, displayName: sender.displayName },
      { userId: recipient.userId, displayName: recipient.displayName }
    ]
  })
  return { service, safetyService, sender, recipient, threadId }
}

function profile(userId: string, displayName: string): UserProfile {
  return {
    userId,
    displayName,
    avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
  }
}
