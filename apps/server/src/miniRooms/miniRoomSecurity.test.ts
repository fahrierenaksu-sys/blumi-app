import assert from "node:assert/strict"
import test from "node:test"
import type { UserProfile } from "@blumi/contracts"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createChatService } from "../chat/chatService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService, type SafetyService } from "../safety/safetyService"
import { createMiniRoomService } from "./miniRoomService"

// Room-claim safety on the live chat-invite path: one room per invite, never
// two overlapping active rooms for one person, and a busy participant's other
// invite ends cancelled.

const NOW = new Date("2026-07-14T09:00:00.000Z")
const ADA = profile("security_ada", "Ada")
const BORA = profile("security_bora", "Bora")
const CARA = profile("security_cara", "Cara")

async function createHarness(wrapSafety: (safety: SafetyService) => SafetyService = (safety) => safety) {
  const chatService = createChatService()
  const service = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService: wrapSafety(createSafetyService()),
    chatService,
    livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never,
    idFactory: (() => {
      let index = 0
      return () => `security_${++index}`
    })()
  })
  async function thread(sender: UserProfile, recipient: UserProfile): Promise<string> {
    const threadId = `thread_${sender.userId}_${recipient.userId}`
    await chatService.createThread({
      threadId,
      miniRoomId: `match_${sender.userId}_${recipient.userId}`,
      participantUserIds: [sender.userId, recipient.userId],
      participants: [
        { userId: sender.userId, displayName: sender.displayName },
        { userId: recipient.userId, displayName: recipient.displayName }
      ]
    })
    return threadId
  }
  async function invite(sender: UserProfile, recipient: UserProfile): Promise<string> {
    const created = await service.createChatInvite({
      threadId: await thread(sender, recipient), senderProfile: sender, recipientProfile: recipient
    }, NOW)
    return created.invite.inviteId
  }
  function accept(inviteId: string, sender: UserProfile, recipient: UserProfile) {
    return service.decideChatInvite({
      inviteId, actorUserId: recipient.userId, senderProfile: sender, recipientProfile: recipient, status: "accepted"
    }, NOW)
  }
  return { service, invite, accept }
}

test("concurrent accepts of one chat invite open exactly one room", async () => {
  const harness = await createHarness()
  const inviteId = await harness.invite(ADA, BORA)

  const attempts = await Promise.allSettled([
    harness.accept(inviteId, ADA, BORA),
    harness.accept(inviteId, ADA, BORA),
    harness.accept(inviteId, ADA, BORA)
  ])

  const rooms = new Set(attempts.flatMap((attempt) =>
    attempt.status === "fulfilled" && attempt.value.miniRoom ? [attempt.value.miniRoom.miniRoomId] : []))
  assert.equal(rooms.size, 1, "every successful accept names the same single room")
  const active = await harness.service.findActiveMiniRoomForUser(BORA.userId)
  assert.ok(active && rooms.has(active.miniRoomId))
  assert.equal((await harness.service.findActiveMiniRoomForUser(ADA.userId))?.miniRoomId, active.miniRoomId)
})

test("concurrent accepts of two invites sharing a person leave one active room and cancel the other invite", async () => {
  const harness = await createHarness()
  const fromAda = await harness.invite(ADA, BORA)
  const fromCara = await harness.invite(CARA, BORA)

  const attempts = await Promise.allSettled([
    harness.accept(fromAda, ADA, BORA),
    harness.accept(fromCara, CARA, BORA)
  ])

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1)
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1)
  const statuses = await Promise.all([fromAda, fromCara].map(async (inviteId) =>
    (await harness.service.repository.findInvite(inviteId))?.status))
  assert.deepEqual([...statuses].sort(), ["accepted", "cancelled"])
  const winnerSender = statuses[0] === "accepted" ? ADA : CARA
  const loserSender = statuses[0] === "accepted" ? CARA : ADA
  const bora = await harness.service.findActiveMiniRoomForUser(BORA.userId)
  assert.ok(bora?.participantUserIds.includes(winnerSender.userId))
  assert.equal(await harness.service.findActiveMiniRoomForUser(loserSender.userId), null)
})

test("accepting while the inviter is already in another room is refused, cancels the invite and opens nothing", async () => {
  const harness = await createHarness()
  const pending = await harness.invite(ADA, BORA)
  const other = await harness.invite(ADA, CARA)
  const existing = await harness.accept(other, ADA, CARA)
  assert.ok(existing.miniRoom)

  await assert.rejects(
    harness.accept(pending, ADA, BORA),
    (error: unknown) => (error as { code?: string }).code === "PARTICIPANT_BUSY"
  )

  assert.equal((await harness.service.repository.findInvite(pending))?.status, "cancelled")
  assert.equal((await harness.service.findActiveMiniRoomForUser(ADA.userId))?.miniRoomId, existing.miniRoom.miniRoomId)
  assert.equal(await harness.service.findActiveMiniRoomForUser(BORA.userId), null)
})

test("a failure after the room claim leaves one durable room that a retried accept returns", async () => {
  let failNextRecheck = false
  let checks = 0
  const harness = await createHarness((safety) => ({
    ...safety,
    async hasBlockBetween(...args: Parameters<SafetyService["hasBlockBetween"]>) {
      checks += 1
      // The first check runs before the claim; the second is the post-claim re-check.
      if (failNextRecheck && checks === 2) throw new Error("block lookup unavailable")
      return safety.hasBlockBetween(...args)
    }
  }))
  const inviteId = await harness.invite(ADA, BORA)
  checks = 0
  failNextRecheck = true

  await assert.rejects(harness.accept(inviteId, ADA, BORA), /block lookup unavailable/)

  failNextRecheck = false
  const active = await harness.service.findActiveMiniRoomForUser(BORA.userId)
  assert.ok(active, "the claimed room is durable, not half-created")
  const retried = await harness.accept(inviteId, ADA, BORA)
  assert.equal(retried.miniRoom?.miniRoomId, active.miniRoomId, "a retry returns the same room instead of a second one")
  assert.equal((await harness.service.findActiveMiniRoomForUser(ADA.userId))?.miniRoomId, active.miniRoomId)
})

function profile(userId: string, displayName: string): UserProfile {
  return {
    userId,
    displayName,
    avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
  }
}
