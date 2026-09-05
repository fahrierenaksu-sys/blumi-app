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
import { PUBLIC_LOBBY_ROOM_ID, createRoomService } from "./rooms/roomService"
import { createSafetyService } from "./safety/safetyService"
import { createEconomyService } from "./economy/economyService"
import type { EconomyService } from "./economy/economyService"

test("room and presence services assign, move, filter, and clean presence immutably", async () => {
  const roomService = createRoomService()
  const presenceService = createPresenceService({ roomService })
  const now = new Date("2026-06-28T10:00:00.000Z")

  const joinedA = await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: profile("user_a", "Ada"),
    initialSpotId: "seat-left"
  }, now)
  const joinedB = await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: profile("user_b", "Bora"),
    initialSpotId: "seat-left"
  }, now)

  assert.equal(joinedA.assignedSpotId, "seat-left")
  assert.notEqual(joinedB.assignedSpotId, "seat-left")
  assert.notEqual(joinedA.layout.spots, joinedB.layout.spots)

  await assert.rejects(
    presenceService.moveToSpot(
      PUBLIC_LOBBY_ROOM_ID,
      "user_b",
      "seat-left",
      now
    ),
    /not available/i
  )

  const moved = await presenceService.moveToSpot(
    PUBLIC_LOBBY_ROOM_ID,
    "user_a",
    "hotspot-window",
    now
  )
  assert.equal(
    moved.users.find((user) => user.userId === "user_a")?.spotId,
    "hotspot-window"
  )

  const nearby = await presenceService.listNearbyUsers(
    PUBLIC_LOBBY_ROOM_ID,
    "user_a",
    ["user_b"],
    now
  )
  assert.deepEqual(nearby, [])

  await presenceService.leaveRoom(PUBLIC_LOBBY_ROOM_ID, "user_a")
  assert.equal(
    await presenceService.findUserPresence(PUBLIC_LOBBY_ROOM_ID, "user_a", now),
    null
  )

  await assert.rejects(roomService.getOrCreateLayout("private-room"), /not available/i)
})

test("mini room lifecycle creates chat, media sessions, and clears busy presence", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  await joinPair(services.presenceService, now)

  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)

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
  assert.equal(
    await services.chatService.repository.findThread(
      `thread_${accepted.miniRoom.miniRoomId}`
    ).then((thread) => thread?.miniRoomId),
    accepted.miniRoom.miniRoomId
  )
  assert.equal(
    await services.presenceService.findUserPresence(
      PUBLIC_LOBBY_ROOM_ID,
      "user_a",
      now
    ).then((presence) => presence?.inMiniRoom),
    true
  )

  await assert.rejects(
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_c",
      now
    ),
    /not available/i
  )

  const rewardEligibleEnd = new Date(now.getTime() + 120_000)
  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    rewardEligibleEnd
  )
  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1275)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1275)

  const duplicateEnd = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_b",
    new Date(rewardEligibleEnd.getTime() + 1_000)
  )
  assert.equal(duplicateEnd, null)
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1275)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1275)
  assert.equal(
    await services.presenceService.findUserPresence(
      PUBLIC_LOBBY_ROOM_ID,
      "user_a",
      now
    ).then((presence) => presence?.inMiniRoom),
    false
  )
})

test("mini rooms shorter than two minutes do not grant economy rewards", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  await joinPair(services.presenceService, now)
  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)
  assert.ok(accepted.miniRoom)

  await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date(now.getTime() + 119_999)
  )

  assert.equal((await services.economyService.getInventory("user_a")).coins, 1250)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1250)
})

test("a transient room reward failure leaves the room retryable without double credit", async () => {
  const economyService = createEconomyService()
  let shouldFailReward = true
  const retryableEconomyService: EconomyService = {
    ...economyService,
    async grantEventReward(...args) {
      if (shouldFailReward) {
        shouldFailReward = false
        throw new Error("Reward ledger is temporarily unavailable.")
      }
      return economyService.grantEventReward(...args)
    }
  }
  const services = createRealtimeCoreServices(retryableEconomyService)
  const now = new Date("2026-06-28T10:00:00.000Z")
  await joinPair(services.presenceService, now)
  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)
  assert.ok(accepted.miniRoom)
  const endedAt = new Date(now.getTime() + 120_000)

  await assert.rejects(
    services.miniRoomService.leaveMiniRoom(
      accepted.miniRoom.miniRoomId,
      "user_a",
      endedAt
    ),
    /temporarily unavailable/i
  )
  assert.equal(
    (await services.miniRoomService.findMiniRoom(accepted.miniRoom.miniRoomId))
      ?.endedAt,
    undefined
  )

  const ended = await services.miniRoomService.leaveMiniRoom(
    accepted.miniRoom.miniRoomId,
    "user_a",
    new Date(endedAt.getTime() + 1_000)
  )

  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal((await economyService.getInventory("user_a")).coins, 1275)
  assert.equal((await economyService.getInventory("user_b")).coins, 1275)
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
  await joinPair(services.presenceService, now)
  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)
  assert.ok(accepted.miniRoom)

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
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1275)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1275)
})

test("concurrent qualifying leaves credit each participant exactly once", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-07-14T10:00:00.000Z")
  await joinPair(services.presenceService, now)
  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)
  assert.ok(accepted.miniRoom)
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
  assert.equal((await services.economyService.getInventory("user_a")).coins, 1275)
  assert.equal((await services.economyService.getInventory("user_b")).coins, 1275)
})

test("connection and reaction services validate decisions and reactions", async () => {
  const services = createRealtimeCoreServices()
  const now = new Date("2026-06-28T10:00:00.000Z")
  await joinPair(services.presenceService, now)
  const invite = await services.miniRoomService.createInvite({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    senderProfile: profile("user_a", "Ada"),
    recipientUserId: "user_b"
  }, now)
  const accepted = await services.miniRoomService.decideInvite({
    inviteId: invite.inviteId,
    actorProfile: profile("user_b", "Bora"),
    status: "accepted"
  }, now)
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
  const connectionService = createConnectionService({ miniRoomService, economyService })
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

async function joinPair(
  presenceService: ReturnType<typeof createPresenceService>,
  now: Date
): Promise<void> {
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: profile("user_a", "Ada", "avatar_v2_body_default"),
    initialSpotId: "seat-left"
  }, now)
  await presenceService.joinRoom({
    roomId: PUBLIC_LOBBY_ROOM_ID,
    profile: profile("user_b", "Bora", "avatar_v2_body_male_light"),
    initialSpotId: "seat-right"
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
