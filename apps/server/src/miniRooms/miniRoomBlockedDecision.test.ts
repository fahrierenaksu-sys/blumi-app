import assert from "node:assert/strict"
import test from "node:test"
import type { ClientEvent, ServerEvent, UserProfile } from "@blumi/contracts"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { WebSocket } from "ws"
import { createChatService } from "../chat/chatService"
import type { ConnectionService } from "../connections/connectionService"
import { createNotificationService } from "../notifications/notificationService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createRealtimeRouter } from "../realtime/realtimeRouter"
import { createRoomService, PUBLIC_LOBBY_ROOM_ID } from "../rooms/roomService"
import { createSafetyService, type SafetyService } from "../safety/safetyService"
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
    test(`a lobby invite ${status} after ${direction.label} is refused, cancelled, and opens no room`, async () => {
      const harness = await createLobbyHarness()
      const invite = await harness.createPendingInvite()
      await harness.safetyService.blockUser(direction.actor.userId, direction.target.userId, NOW)

      await assert.rejects(
        harness.service.decideInvite({
          inviteId: invite.inviteId,
          actorProfile: RECIPIENT,
          status
        }, NOW),
        /no longer available/
      )

      assert.equal((await harness.service.repository.findInvite(invite.inviteId))?.status, "cancelled")
      assert.equal(await harness.service.findActiveMiniRoomForUser(SENDER.userId), null)
      assert.equal(await harness.service.findActiveMiniRoomForUser(RECIPIENT.userId), null)
    })

    test(`mini_room.invite_decision ${status} after ${direction.label} delivers no decision or room event to either user`, async () => {
      const harness = await createLobbyHarness()
      const invite = await harness.createPendingInvite()
      await harness.safetyService.blockUser(direction.actor.userId, direction.target.userId, NOW)
      const router = harness.createRouter()

      await assert.rejects(
        router.handleClientEvent(harness.recipientConnection, {
          type: "mini_room.invite_decision",
          payload: { inviteId: invite.inviteId, status }
        } as ClientEvent),
        /no longer available/
      )

      for (const userId of [SENDER.userId, RECIPIENT.userId]) {
        const types = harness.deliveries.get(userId)?.map((event) => event.type) ?? []
        assert.deepEqual(
          types.filter((type) => type.startsWith("mini_room.") || type === "chat.thread_created"),
          [],
          `${userId} must receive no mini room event`
        )
      }
      assert.equal(await harness.service.findActiveMiniRoomForUser(RECIPIENT.userId), null)
    })
  }
}

test("a block that commits while a lobby accept is claiming the room rolls the room back", async () => {
  let blockChecks = 0
  const harness = await createLobbyHarness((safetyService) => ({
    ...safetyService,
    // The pre-claim check sees no block; the block commits during the claim.
    async hasBlockBetween() {
      blockChecks += 1
      return blockChecks > 1
    }
  }))
  const invite = await harness.createPendingInvite()

  await assert.rejects(
    harness.service.decideInvite({
      inviteId: invite.inviteId,
      actorProfile: RECIPIENT,
      status: "accepted"
    }, NOW),
    /no longer available/
  )

  assert.equal(blockChecks, 2)
  assert.equal((await harness.service.repository.findInvite(invite.inviteId))?.status, "cancelled")
  assert.equal(await harness.service.findActiveMiniRoomForUser(SENDER.userId), null)
  assert.equal(await harness.service.findActiveMiniRoomForUser(RECIPIENT.userId), null)
  assert.equal(
    (await harness.presenceService.findUserPresence(PUBLIC_LOBBY_ROOM_ID, RECIPIENT.userId, NOW))?.inMiniRoom,
    false
  )
})

test("an unblocked lobby decline still reaches both users", async () => {
  const harness = await createLobbyHarness()
  const invite = await harness.createPendingInvite()
  const router = harness.createRouter()

  await router.handleClientEvent(harness.recipientConnection, {
    type: "mini_room.invite_decision",
    payload: { inviteId: invite.inviteId, status: "declined" }
  } as ClientEvent)

  for (const userId of [SENDER.userId, RECIPIENT.userId]) {
    assert.deepEqual(
      harness.deliveries.get(userId)?.map((event) => event.type),
      ["mini_room.invite_decided"]
    )
  }
  assert.equal((await harness.service.repository.findInvite(invite.inviteId))?.status, "declined")
})

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

async function createLobbyHarness(
  wrapSafety: (safetyService: SafetyService) => SafetyService = (safetyService) => safetyService
) {
  const baseSafetyService = createSafetyService()
  const safetyService = wrapSafety(baseSafetyService)
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const chatService = createChatService()
  const service = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `blocked_decision_${++index}`
    })()
  })
  await presenceService.joinRoom({ roomId: PUBLIC_LOBBY_ROOM_ID, profile: SENDER, initialSpotId: "seat-left" }, NOW)
  await presenceService.joinRoom({ roomId: PUBLIC_LOBBY_ROOM_ID, profile: RECIPIENT, initialSpotId: "seat-right" }, NOW)

  const connectionManager = createConnectionManager()
  const deliveries = new Map<string, ServerEvent[]>()
  function connect(userProfile: UserProfile) {
    const events: ServerEvent[] = []
    deliveries.set(userProfile.userId, events)
    return connectionManager.addConnection({
      profile: userProfile,
      socket: {
        readyState: 1,
        send(body: string) { events.push(JSON.parse(body) as ServerEvent) }
      } as WebSocket
    })
  }
  connect(SENDER)
  const recipientConnection = connect(RECIPIENT)

  return {
    service,
    safetyService: baseSafetyService,
    presenceService,
    deliveries,
    recipientConnection,
    createPendingInvite: () => service.createInvite({
      roomId: PUBLIC_LOBBY_ROOM_ID,
      senderProfile: SENDER,
      recipientUserId: RECIPIENT.userId
    }, NOW),
    createRouter: () => createRealtimeRouter({
      connectionManager,
      presenceService,
      miniRoomService: service,
      // Not reached by mini_room.invite_decision.
      connectionService: {} as ConnectionService,
      reactionService: createReactionService(),
      chatService,
      safetyService,
      notificationService: createNotificationService(),
      // The production default denies the retired lobby; allow it here so the
      // decision reaches the service and its block check is what is under test.
      isPresenceRoomAllowed: (_actor, roomId) => roomId === PUBLIC_LOBBY_ROOM_ID
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
