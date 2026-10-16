import assert from "node:assert/strict"
import test from "node:test"
import type { UserProfile } from "@blumi/contracts"
import {
  createAvatarSelection,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { createChatService } from "./chat/chatService"
import { createConnectionService } from "./connections/connectionService"
import { createLivekitTokenService } from "./miniRooms/livekitTokenService"
import { createMiniRoomService } from "./miniRooms/miniRoomService"
import {
  createInMemoryMiniRoomRepository,
  type MiniRoomRepository
} from "./miniRooms/miniRoomRepository"
import { createPresenceService } from "./presence/presenceService"
import { createReactionService } from "./reactions/reactionService"
import { createRoomService } from "./rooms/roomService"
import { createSafetyService } from "./safety/safetyService"
import { ECONOMY_REWARD_COINS, createEconomyService } from "./economy/economyService"
import type { EconomyService } from "./economy/economyService"

const AFTER_ONE_ROOM_REWARD = 1250 + ECONOMY_REWARD_COINS.room_complete

test("a room opened from a chat invite rewards a qualifying stay once and ends once", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)

  assert.equal(accepted.decision.status, "accepted")
  assert.ok(accepted.miniRoom)
  assert.equal(
    accepted.mediaSessions?.user_a.miniRoomId,
    accepted.miniRoom.miniRoomId
  )
  assert.deepEqual(accepted.participants, [
    {
      userId: "user_a",
      displayName: "Ada",
      avatar: profile(
        "user_a",
        "Ada",
        "avatar_v2_body_default"
      ).avatar
    },
    {
      userId: "user_b",
      displayName: "Bora",
      avatar: profile(
        "user_b",
        "Bora",
        "avatar_v2_body_male_light"
      ).avatar
    }
  ])

  await assert.rejects(
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_c",
      now
    ),
    /not available/i
  )

  enterBoth(services, accepted.miniRoom.miniRoomId, now)
  const rewardEligibleEnd = new Date(now.getTime() + 120_000)
  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    rewardEligibleEnd
  )
  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal((await services.economyService.getInventory("user_a")).coins, AFTER_ONE_ROOM_REWARD)
  assert.equal((await services.economyService.getInventory("user_b")).coins, AFTER_ONE_ROOM_REWARD)

  const duplicateEnd = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_b",
    new Date(rewardEligibleEnd.getTime() + 1_000)
  )
  assert.equal(duplicateEnd, null)
  assert.equal((await services.economyService.getInventory("user_a")).coins, AFTER_ONE_ROOM_REWARD)
  assert.equal((await services.economyService.getInventory("user_b")).coins, AFTER_ONE_ROOM_REWARD)
  assert.equal(await services.miniRoomService.findActiveMiniRoomForUser("user_a"), null)
})

test("mini rooms shorter than two minutes do not grant economy rewards", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  enterBoth(services, accepted.miniRoom.miniRoomId, now)

  await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date(now.getTime() + 119_999)
  )

  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("a room reward failure never keeps the room open and still credits the other participant", async () => {
  const economyService = createEconomyService()
  const failingEconomyService: EconomyService = {
    ...economyService,
    async grantEventReward(userId, ...rest) {
      if (userId === "user_a") throw new Error("Reward ledger is temporarily unavailable.")
      return economyService.grantEventReward(userId, ...rest)
    }
  }
  const services = createRealtimeCoreServices(failingEconomyService)
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  enterBoth(services, accepted.miniRoom.miniRoomId, now)

  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date(now.getTime() + 120_000)
  )

  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal(await services.miniRoomService.findActiveMiniRoomForUser("user_a"), null)
  assert.equal((await economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await economyService.getInventory("user_b")).coins, AFTER_ONE_ROOM_REWARD)
})

test("an accepted room pays nothing when only one participant entered it", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  services.miniRoomService.recordSceneEntry?.(accepted.miniRoom.miniRoomId, "user_b", now)

  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_b",
    new Date(now.getTime() + 11 * 60 * 60 * 1000)
  )

  assert.equal(ended?.endedByUserId, "user_b")
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("a room with no remembered scene entries (a server restart) ends and pays nothing", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)

  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date(now.getTime() + 60 * 60 * 1000)
  )

  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal(await services.miniRoomService.findActiveMiniRoomForUser("user_a"), null)
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("a failing reward-day anchor never makes leaving throw or keeps the room open", async () => {
  const durableRepository = createInMemoryMiniRoomRepository()
  const failingAnchorRepository: MiniRoomRepository = {
    ...durableRepository,
    async anchorMiniRoomCompletion() {
      throw new Error("Room completion anchor is temporarily unavailable.")
    }
  }
  const services = createRealtimeCoreServices(undefined, failingAnchorRepository)
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  enterBoth(services, accepted.miniRoom.miniRoomId, now)

  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_b",
    new Date(now.getTime() + 120_000)
  )

  assert.equal(ended?.endedByUserId, "user_b")
  assert.equal(await services.miniRoomService.findActiveMiniRoomForUser("user_b"), null)
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("the shared stay is timed from the later participant's entry", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  const roomId = accepted.miniRoom.miniRoomId
  services.miniRoomService.recordSceneEntry?.(roomId, "user_a", now)
  const partnerEnteredAt = new Date(now.getTime() + 10 * 60 * 1000)
  services.miniRoomService.recordSceneEntry?.(roomId, "user_b", partnerEnteredAt)

  const tooEarly = await services.miniRoomService.leaveMiniRoom(roomId, "user_a", new Date(partnerEnteredAt.getTime() + 119_000))

  assert.equal(tooEarly?.endedByUserId, "user_a")
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("an end write failure keeps the original reward day across a midnight retry", async () => {
  const durableRepository = createInMemoryMiniRoomRepository()
  let shouldFailEnd = true
  const retryableRepository: MiniRoomRepository = {
    ...durableRepository,
    async endMiniRoom(...args) {
      if (shouldFailEnd) {
        shouldFailEnd = false
        throw new Error("Room completion write is temporarily unavailable.")
      }
      return durableRepository.endMiniRoom(...args)
    }
  }
  const services = createRealtimeCoreServices(undefined, retryableRepository)
  const now = new Date("2026-07-14T23:57:59.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  enterBoth(services, accepted.miniRoom.miniRoomId, now)

  await assert.rejects(
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_a",
      new Date("2026-07-14T23:59:59.000Z")
    ),
    /temporarily unavailable/i
  )
  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date("2026-07-15T00:00:01.000Z")
  )

  assert.equal(ended?.endedAt, "2026-07-15T00:00:01.000Z")
  assert.equal((await services.economyService.getInventory("user_a")).coins, AFTER_ONE_ROOM_REWARD)
  assert.equal((await services.economyService.getInventory("user_b")).coins, AFTER_ONE_ROOM_REWARD)
})

test("concurrent qualifying leaves credit each participant exactly once", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-07-14T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)
  enterBoth(services, accepted.miniRoom.miniRoomId, now)
  const endedAt = new Date(now.getTime() + 120_000)

  const leaveResults = await Promise.all([
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_a",
      endedAt
    ),
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_b",
      endedAt
    )
  ])
  const terminalPayloads = leaveResults.filter(
    (result) => result !== null
  )

  assert.equal(terminalPayloads.length, 1)
  assert.equal(leaveResults.filter((result) => result === null).length, 1)
  assert.equal((await services.economyService.getInventory("user_a")).coins, AFTER_ONE_ROOM_REWARD)
  assert.equal((await services.economyService.getInventory("user_b")).coins, AFTER_ONE_ROOM_REWARD)
})

test("connection and reaction services validate decisions and reactions", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  const accepted = await openChatRoom(services, now)
  assert.ok(accepted.miniRoom)

  const first = await services.connectionService.decide("user_a", {
    miniRoomId: accepted.miniRoom.miniRoomId,
    partnerUserId: "user_b",
    status: "saved"
  }, now)
  assert.equal(first.match, null)

  const second = await services.connectionService.decide("user_b", {
    miniRoomId: accepted.miniRoom.miniRoomId,
    partnerUserId: "user_a",
    status: "saved"
  }, now)
  assert.deepEqual(second.match?.participantUserIds, ["user_a", "user_b"])
  await services.connectionService.decide("user_b", {
    miniRoomId: accepted.miniRoom.miniRoomId,
    partnerUserId: "user_a",
    status: "saved"
  }, now)
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1300)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1300)

  const reaction = await services.reactionService.createReaction({
    roomId: accepted.miniRoom.miniRoomId,
    actorUserId: "user_a",
    targetUserId: "user_b",
    reaction: "heart"
  }, now)
  assert.equal(reaction.reaction, "heart")
  assert.equal(reaction.targetUserId, "user_b")

  await assert.rejects(
    services.reactionService.createReaction({
      roomId: accepted.miniRoom.miniRoomId,
      actorUserId: "user_a",
      reaction: "invalid"
    }, now),
    /valid reaction/i
  )
})

function createRealtimeCoreServices(
  providedEconomyService?: EconomyService,
  miniRoomRepository?: MiniRoomRepository
) {
  const roomService = createRoomService()
  const presenceService = createPresenceService({ roomService })
  const safetyService = createSafetyService()
  const chatService = createChatService()
  const economyService = providedEconomyService ?? createEconomyService()
  const miniRoomService = createMiniRoomService({
    repository: miniRoomRepository,
    presenceService,
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    economyService,
    idFactory: createSequenceIdFactory()
  })
  const connectionService = createConnectionService({ miniRoomService, safetyService, economyService })
  const reactionService = createReactionService({
    idFactory: createSequenceIdFactory("reaction")
  })
  return {
    roomService,
    presenceService,
    safetyService,
    chatService,
    miniRoomService,
    connectionService,
    economyService,
    reactionService
  }
}

/** Both participants' sockets entered the room scene (what the motion service reports). */
function enterBoth(services: ReturnType<typeof createRealtimeCoreServices>, miniRoomId: string, at: Date): void {
  for (const userId of ["user_a", "user_b"]) services.miniRoomService.recordSceneEntry?.(miniRoomId, userId, at)
}

async function openChatRoom(
  services: ReturnType<typeof createRealtimeCoreServices>,
  now: Date
) {
  const sender = profile("user_a", "Ada", "avatar_v2_body_default")
  const recipient = profile("user_b", "Bora", "avatar_v2_body_male_light")
  const threadId = "thread_match_user_a_user_b"
  await services.chatService.createThread({
    threadId,
    miniRoomId: "match_user_a_user_b",
    participantUserIds: [sender.userId, recipient.userId],
    participants: [
      { userId: sender.userId, displayName: sender.displayName },
      { userId: recipient.userId, displayName: recipient.displayName }
    ]
  }, now)
  const created = await services.miniRoomService.createChatInvite({
    threadId, senderProfile: sender, recipientProfile: recipient
  }, now)
  return services.miniRoomService.decideChatInvite({
    inviteId: created.invite.inviteId,
    actorUserId: recipient.userId,
    senderProfile: sender,
    recipientProfile: recipient,
    status: "accepted"
  }, now)
}

function profile(
  userId: string,
  displayName: string,
  presetId = "avatar_v2_body_default"
): UserProfile {
  const loadout = presetId === "avatar_v2_body_male_light"
    ? DEFAULT_MALE_AVATAR_LOADOUT
    : DEFAULT_FEMALE_AVATAR_LOADOUT
  return {
    userId,
    displayName,
    avatar: {
      ...createAvatarSelection(loadout, 0),
      presetId
    }
  }
}

function createSequenceIdFactory(prefix = "id"): () => string {
  let next = 0
  return () => `${prefix}_${++next}`
}
