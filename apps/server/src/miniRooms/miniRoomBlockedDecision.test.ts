import assert from "node:assert/strict"
import test from "node:test"
import type { UserProfile } from "@blumi/contracts"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"

// PRD-4: a room invite must never be decided between users who block each
// other, in either direction. The block's pair separation normally cancels
// pending invites first; these tests cover an invite that is still pending when
// the decision arrives (separation failed, raced, or the block came from a path
// that does not separate). The decision fails closed, removes the invite, opens
// no room and sends the blocked party no event.

// The realtime router decides with the wall clock, so fixtures use it too.
const NOW = new Date()
const SENDER = profile("blocked_sender", "Ada")
const RECIPIENT = profile("blocked_recipient", "Bora")

const BLOCK_DIRECTIONS = [
  { label: "the inviter blocked the invitee", actor: SENDER, target: RECIPIENT },
  { label: "the invitee blocked the inviter", actor: RECIPIENT, target: SENDER }
] as const

for (const direction of BLOCK_DIRECTIONS) {
  for (const status of ["accepted", "declined"] as const) {
    test(`a chat room invite ${status} after ${direction.label} is refused as PAIR_BLOCKED and cancelled`, async () => {
      const harness = await createChatHarness()
      const created = await harness.service.createChatInvite({
        threadId: harness.threadId,
        senderProfile: SENDER,
        recipientProfile: RECIPIENT
      }, NOW)
      await harness.safetyService.blockUser(direction.actor.userId, direction.target.userId, NOW)

      await assert.rejects(
        harness.service.decideChatInvite({
          inviteId: created.invite.inviteId,
          actorUserId: RECIPIENT.userId,
          senderProfile: SENDER,
          recipientProfile: RECIPIENT,
          status
        }, NOW),
        (error: unknown) => (error as { code?: string }).code === "PAIR_BLOCKED"
      )

      assert.equal(
        (await harness.service.repository.findInvite(created.invite.inviteId))?.status,
        "cancelled"
      )
      assert.equal(await harness.service.findActiveMiniRoomForUser(RECIPIENT.userId), null)
    })
  }
}

async function createChatHarness() {
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const service = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `blocked_chat_${++index}`
    })()
  })
  const threadId = "thread_match_blocked_pair"
  await chatService.createThread({
    threadId,
    miniRoomId: "match_blocked_pair",
    participantUserIds: [SENDER.userId, RECIPIENT.userId],
    participants: [
      { userId: SENDER.userId, displayName: SENDER.displayName },
      { userId: RECIPIENT.userId, displayName: RECIPIENT.displayName }
    ]
  })
  return { service, safetyService, threadId }
}

function profile(userId: string, displayName: string): UserProfile {
  return {
    userId,
    displayName,
    avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
  }
}
