import assert from "node:assert/strict"
import test from "node:test"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"
import { createMiniRoomMotionService } from "./miniRoomMotionService"

const profile = (userId: string, displayName: string): UserProfile => ({
  userId, displayName, avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
})

async function createHarness() {
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const service = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: "fixture" }) } as never,
    idFactory: (() => { let index = 0; return () => `late_join_${++index}` })()
  })
  const sender = profile("sender_user", "Ada")
  const recipient = profile("recipient_user", "Bora")
  const threadId = "thread_late_join"
  await chatService.createThread({
    threadId, miniRoomId: "match_late_join",
    participantUserIds: [sender.userId, recipient.userId],
    participants: [{ userId: sender.userId, displayName: sender.displayName }, { userId: recipient.userId, displayName: recipient.displayName }]
  })
  // The same wiring the realtime router uses between the room service and motion.
  const events: ServerEvent[] = []
  const motion = createMiniRoomMotionService({
    findRoom: (id) => service.findMiniRoom(id),
    hasBlockBetween: (a, b) => safetyService.hasBlockBetween(a, b),
    emit: (_ids, event) => events.push(event)
  })
  service.onRoomInvalidated?.((id) => motion.invalidate(id))
  service.onRoomReady?.((room) => motion.prime(room))
  return { service, safetyService, motion, events, sender, recipient, threadId }
}

test("a join that completes after the room closed cannot let anyone enter or move in it", async () => {
  // Arrange: an open shared room; the join's block check is held open.
  const h = await createHarness()
  const now = new Date("2026-10-14T10:00:00.000Z")
  const invite = await h.service.createChatInvite({ threadId: h.threadId, senderProfile: h.sender, recipientProfile: h.recipient }, now)
  const accepted = await h.service.decideChatInvite({ inviteId: invite.invite.inviteId, actorUserId: h.recipient.userId,
    senderProfile: h.sender, recipientProfile: h.recipient, status: "accepted" }, now)
  const miniRoomId = accepted.miniRoom!.miniRoomId
  let releaseJoin!: () => void
  const joinGate = new Promise<void>((resolve) => { releaseJoin = resolve })
  let joinReachedBlockCheck!: () => void
  const reachedBlockCheck = new Promise<void>((resolve) => { joinReachedBlockCheck = resolve })
  const realBlockCheck = h.safetyService.hasBlockBetween.bind(h.safetyService)
  let heldOnce = false
  h.safetyService.hasBlockBetween = async (a, b) => {
    const result = await realBlockCheck(a, b)
    if (!heldOnce) { heldOnce = true; joinReachedBlockCheck(); await joinGate }
    return result
  }

  // Act: join waits -> leave commits -> join completes.
  const join = h.service.joinChatRoom({ miniRoomId, actorUserId: h.sender.userId,
    senderProfile: h.sender, recipientProfile: h.recipient }, now)
  await reachedBlockCheck
  await h.service.leaveMiniRoom(miniRoomId, h.recipient.userId, new Date("2026-10-14T10:00:05.000Z"))
  releaseJoin()
  await join.catch(() => undefined)

  // Assert: entering is refused and a move is never relayed.
  await assert.rejects(h.motion.enter("conn_a", h.sender.userId, miniRoomId), /not available/)
  await h.motion.move("conn_a", h.sender.userId, { miniRoomId, sequence: 1, x: 0.5, y: 0.7 })
  assert.equal(h.events.filter((event) => event.type === "mini_room.avatar_moved").length, 0)
})

test("a join on a room that stays open still primes motion", async () => {
  const h = await createHarness()
  const now = new Date("2026-10-14T10:00:00.000Z")
  const invite = await h.service.createChatInvite({ threadId: h.threadId, senderProfile: h.sender, recipientProfile: h.recipient }, now)
  const accepted = await h.service.decideChatInvite({ inviteId: invite.invite.inviteId, actorUserId: h.recipient.userId,
    senderProfile: h.sender, recipientProfile: h.recipient, status: "accepted" }, now)
  const ready: string[] = []
  h.service.onRoomReady?.((room) => { ready.push(room.miniRoomId) })
  await h.service.joinChatRoom({ miniRoomId: accepted.miniRoom!.miniRoomId, actorUserId: h.sender.userId,
    senderProfile: h.sender, recipientProfile: h.recipient }, now)
  assert.deepEqual(ready, [accepted.miniRoom!.miniRoomId])
})
