import { randomUUID } from "node:crypto"
import type {
  MediaSessionToken,
  MiniRoom,
  MiniRoomEnded,
  MiniRoomInviteDecision,
  MiniRoomInviteDecisionStatus,
  MiniRoomParticipant,
  UserProfile
} from "@blumi/contracts"
import { canInviteUser } from "@blumi/domain"
import type { EconomyService } from "../economy/economyService"
import type { ChatService } from "../chat/chatService"
import type { PresenceService } from "../presence/presenceService"
import type { SafetyService } from "../safety/safetyService"
import { type LivekitTokenService } from "./livekitTokenService"
import {
  createInMemoryMiniRoomRepository,
  type MiniRoomInviteRecord,
  type MiniRoomRecord,
  type MiniRoomRepository
} from "./miniRoomRepository"

const LEGACY_INVITE_TTL_MS = 30_000
const CHAT_INVITE_TTL_MS = 10 * 60 * 1000

export class ChatRoomInviteError extends Error {
  constructor(
    readonly code:
      | "INVITE_NOT_AVAILABLE"
      | "INVITE_EXPIRED"
      | "INVITE_FORBIDDEN"
      | "PARTICIPANT_BUSY"
      | "PAIR_BLOCKED",
    message: string
  ) {
    super(message)
    this.name = "ChatRoomInviteError"
  }
}

export interface MiniRoomService {
  repository: MiniRoomRepository
  createInvite(input: CreateInviteInput, now?: Date): Promise<MiniRoomInviteRecord>
  decideInvite(
    input: DecideInviteInput,
    now?: Date
  ): Promise<MiniRoomInviteDecisionResult>
  createChatInvite(
    input: CreateChatRoomInviteInput,
    now?: Date
  ): Promise<CreateChatRoomInviteResult>
  listChatInvites(
    userId: string,
    threadId: string,
    now?: Date
  ): Promise<MiniRoomInviteRecord[]>
  decideChatInvite(
    input: DecideChatRoomInviteInput,
    now?: Date
  ): Promise<ChatRoomInviteDecisionResult>
  cancelChatInvite(
    input: CancelChatRoomInviteInput,
    now?: Date
  ): Promise<MiniRoomInviteRecord>
  joinChatRoom(
    input: JoinChatRoomInput,
    now?: Date
  ): Promise<ChatRoomJoinResult>
  leaveMiniRoom(
    miniRoomId: string,
    endedByUserId: string,
    now?: Date
  ): Promise<MiniRoomEnded | null>
  findActiveMiniRoomForUser(userId: string): Promise<MiniRoomRecord | null>
  findMiniRoom(miniRoomId: string): Promise<MiniRoomRecord | null>
  separateUserPair(
    actorUserId: string,
    otherUserId: string,
    now?: Date
  ): Promise<MiniRoomEnded[]>
}

export interface CreateInviteInput {
  roomId: string
  senderProfile: UserProfile
  recipientUserId: string
}

export interface DecideInviteInput {
  inviteId: string
  actorProfile: UserProfile
  status: Exclude<MiniRoomInviteDecisionStatus, "cancelled">
}

export interface MiniRoomInviteDecisionResult {
  decision: MiniRoomInviteDecision
  miniRoom?: MiniRoom
  mediaSessions?: Record<string, MediaSessionToken>
  participants?: [MiniRoomParticipant, MiniRoomParticipant]
}

export interface CreateChatRoomInviteInput {
  threadId: string
  senderProfile: UserProfile
  recipientProfile: UserProfile
}

export interface CreateChatRoomInviteResult {
  invite: MiniRoomInviteRecord
  created: boolean
}

export interface DecideChatRoomInviteInput {
  inviteId: string
  actorUserId: string
  senderProfile: UserProfile
  recipientProfile: UserProfile
  status: Exclude<MiniRoomInviteDecisionStatus, "cancelled">
}

export interface ChatRoomInviteDecisionResult {
  invite: MiniRoomInviteRecord
  decision: MiniRoomInviteDecision
  miniRoom?: MiniRoom
  mediaSessions?: Record<string, MediaSessionToken>
  participants?: [MiniRoomParticipant, MiniRoomParticipant]
}

export interface CancelChatRoomInviteInput {
  inviteId: string
  actorUserId: string
}

export interface JoinChatRoomInput {
  miniRoomId: string
  actorUserId: string
  senderProfile: UserProfile
  recipientProfile: UserProfile
}

export interface ChatRoomJoinResult {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
  participants: [MiniRoomParticipant, MiniRoomParticipant]
}

export interface CreateMiniRoomServiceOptions {
  getPersonalRoomDecor?: (userId: string) => Promise<import("../rooms/personalRoomDecorRepository").PersonalRoomDecorSnapshot | null>
  repository?: MiniRoomRepository
  presenceService: PresenceService
  safetyService: SafetyService
  chatService: ChatService
  livekitTokenService: LivekitTokenService
  economyService?: EconomyService
  idFactory?: () => string
}

const MINIMUM_REWARDED_ROOM_DURATION_MS = 120_000

export function createMiniRoomService(
  options: CreateMiniRoomServiceOptions
): MiniRoomService {
  const repository = options.repository ?? createInMemoryMiniRoomRepository(undefined, options.getPersonalRoomDecor)
  const idFactory = options.idFactory ?? (() => randomUUID())

  return {
    repository,
    async createChatInvite(input, now = new Date()) {
      assertDistinctChatProfiles(input.senderProfile, input.recipientProfile)
      await assertChatThreadParticipants(
        options.chatService,
        input.threadId,
        input.senderProfile.userId,
        input.recipientProfile.userId
      )
      if (
        await options.safetyService.hasBlockBetween(
          input.senderProfile.userId,
          input.recipientProfile.userId
        )
      ) {
        throw new ChatRoomInviteError(
          "PAIR_BLOCKED",
          "That room invite is not available."
        )
      }
      const [activeSenderRoom, activeRecipientRoom] = await Promise.all([
        repository.findActiveMiniRoomForUser(input.senderProfile.userId),
        repository.findActiveMiniRoomForUser(input.recipientProfile.userId)
      ])
      if (activeSenderRoom || activeRecipientRoom) {
        throw new ChatRoomInviteError(
          "PARTICIPANT_BUSY",
          "One of you is already in a room."
        )
      }
      return repository.createOrFindPendingChatInvite({
        inviteId: `invite_${idFactory()}`,
        senderUserId: input.senderProfile.userId,
        recipientUserId: input.recipientProfile.userId,
        sourceThreadId: input.threadId,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CHAT_INVITE_TTL_MS).toISOString()
      }, now)
    },
    async listChatInvites(userId, threadId, now = new Date()) {
      const thread = await options.chatService.repository.findThread(threadId)
      if (!thread || !thread.participantUserIds.includes(userId)) {
        throw new ChatRoomInviteError(
          "INVITE_FORBIDDEN",
          "That conversation is not available."
        )
      }
      return repository.listInvitesForThread(threadId, now)
    },
    async decideChatInvite(input, now = new Date()) {
      const invite = await repository.findInvite(input.inviteId)
      if (!invite?.sourceThreadId) {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room invite is not available."
        )
      }
      assertDistinctChatProfiles(input.senderProfile, input.recipientProfile)
      assertProfilesMatchInvite(invite, input.senderProfile, input.recipientProfile)
      await assertChatThreadParticipants(
        options.chatService,
        invite.sourceThreadId,
        invite.senderUserId,
        invite.recipientUserId
      )
      if (invite.recipientUserId !== input.actorUserId) {
        throw new ChatRoomInviteError(
          "INVITE_FORBIDDEN",
          "That room invite is not for this session."
        )
      }
      if (invite.status === "accepted") {
        const miniRoom = await repository.findMiniRoomByInviteId(invite.inviteId)
        if (!miniRoom || miniRoom.endedAt) {
          throw new ChatRoomInviteError(
            "INVITE_NOT_AVAILABLE",
            "That room invite is not available."
          )
        }
        if (
          await options.safetyService.hasBlockBetween(
            invite.senderUserId,
            invite.recipientUserId
          )
        ) {
          throw new ChatRoomInviteError(
            "PAIR_BLOCKED",
            "That room invite is not available."
          )
        }
        return buildChatInviteResult({
          invite,
          miniRoom,
          senderProfile: input.senderProfile,
          recipientProfile: input.recipientProfile,
          livekitTokenService: options.livekitTokenService,
          now
        })
      }
      if (invite.status !== "pending") {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room invite is not available."
        )
      }
      if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) {
        await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "expired",
          decidedAt: now.toISOString()
        })
        throw new ChatRoomInviteError("INVITE_EXPIRED", "That room invite expired.")
      }
      if (
        await options.safetyService.hasBlockBetween(
          invite.senderUserId,
          invite.recipientUserId
        )
      ) {
        await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "cancelled",
          decidedAt: now.toISOString()
        })
        throw new ChatRoomInviteError(
          "PAIR_BLOCKED",
          "That room invite is not available."
        )
      }

      if (input.status === "declined") {
        const decidedAt = now.toISOString()
        const transitioned = await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "declined",
          decidedAt
        })
        if (!transitioned) {
          throw new ChatRoomInviteError(
            "INVITE_NOT_AVAILABLE",
            "That room invite is not available."
          )
        }
        const decidedInvite = await repository.findInvite(invite.inviteId)
        if (!decidedInvite) {
          throw new ChatRoomInviteError(
            "INVITE_NOT_AVAILABLE",
            "That room invite is not available."
          )
        }
        return {
          invite: decidedInvite,
          decision: createDecision(decidedInvite, "declined", decidedAt)
        }
      }

      const miniRoom: MiniRoomRecord = {
        miniRoomId: `mini_room_${idFactory()}`,
        // Existing storage uses this required legacy field. A chat room never
        // relies on lobby presence; sourceThreadId carries the real origin.
        lobbyRoomId: invite.sourceThreadId,
        sourceThreadId: invite.sourceThreadId,
        participantUserIds: [invite.senderUserId, invite.recipientUserId],
        livekitRoomName: `blumi-${idFactory()}`,
        startedAt: now.toISOString()
      }
      const decidedAt = now.toISOString()
      const accepted = await repository.acceptPendingInvite({
        inviteId: invite.inviteId,
        decidedAt,
        miniRoom
      })
      if (accepted === "accepted") {
        const persistedRoom = await repository.findMiniRoom(miniRoom.miniRoomId)
        if (!persistedRoom) throw new Error("Accepted room did not persist.")
        const acceptedInvite = await repository.findInvite(invite.inviteId)
        if (!acceptedInvite) {
          throw new ChatRoomInviteError(
            "INVITE_NOT_AVAILABLE",
            "That room invite is not available."
          )
        }
        return buildChatInviteResult({
          invite: acceptedInvite,
          miniRoom: persistedRoom,
          senderProfile: input.senderProfile,
          recipientProfile: input.recipientProfile,
          livekitTokenService: options.livekitTokenService,
          now
        })
      }
      if (accepted === "participant_busy") {
        throw new ChatRoomInviteError(
          "PARTICIPANT_BUSY",
          "One of you is already in a room."
        )
      }
      const currentInvite = await repository.findInvite(invite.inviteId)
      const currentRoom = currentInvite?.status === "accepted"
        ? await repository.findMiniRoomByInviteId(invite.inviteId)
        : null
      if (currentInvite && currentRoom) {
        if (
          await options.safetyService.hasBlockBetween(
            invite.senderUserId,
            invite.recipientUserId
          )
        ) {
          throw new ChatRoomInviteError(
            "PAIR_BLOCKED",
            "That room invite is not available."
          )
        }
        return buildChatInviteResult({
          invite: currentInvite,
          miniRoom: currentRoom,
          senderProfile: input.senderProfile,
          recipientProfile: input.recipientProfile,
          livekitTokenService: options.livekitTokenService,
          now
        })
      }
      throw new ChatRoomInviteError(
        "INVITE_NOT_AVAILABLE",
        "That room invite is not available."
      )
    },
    async cancelChatInvite(input, now = new Date()) {
      const invite = await repository.findInvite(input.inviteId)
      if (
        !invite?.sourceThreadId ||
        invite.senderUserId !== input.actorUserId
      ) {
        throw new ChatRoomInviteError(
          "INVITE_FORBIDDEN",
          "That room invite is not available."
        )
      }
      if (invite.status === "cancelled") return invite
      if (invite.status !== "pending") {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room invite is not available."
        )
      }
      if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) {
        await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "expired",
          decidedAt: now.toISOString()
        })
        throw new ChatRoomInviteError("INVITE_EXPIRED", "That room invite expired.")
      }
      const cancelledAt = now.toISOString()
      const transitioned = await repository.transitionPendingInvite({
        inviteId: invite.inviteId,
        status: "cancelled",
        decidedAt: cancelledAt
      })
      if (!transitioned) {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room invite is not available."
        )
      }
      const cancelled = await repository.findInvite(invite.inviteId)
      if (!cancelled) {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room invite is not available."
        )
      }
      return cancelled
    },
    async joinChatRoom(input, now = new Date()) {
      const miniRoom = await repository.findMiniRoom(input.miniRoomId)
      if (!miniRoom?.sourceThreadId || miniRoom.endedAt) {
        throw new ChatRoomInviteError(
          "INVITE_NOT_AVAILABLE",
          "That room is not available."
        )
      }
      if (!miniRoom.participantUserIds.includes(input.actorUserId)) {
        throw new ChatRoomInviteError(
          "INVITE_FORBIDDEN",
          "That room is not available."
        )
      }
      assertDistinctChatProfiles(input.senderProfile, input.recipientProfile)
      if (
        !miniRoom.participantUserIds.includes(input.senderProfile.userId) ||
        !miniRoom.participantUserIds.includes(input.recipientProfile.userId)
      ) {
        throw new ChatRoomInviteError(
          "INVITE_FORBIDDEN",
          "That room is not available."
        )
      }
      await assertChatThreadParticipants(
        options.chatService,
        miniRoom.sourceThreadId,
        input.senderProfile.userId,
        input.recipientProfile.userId
      )
      if (
        await options.safetyService.hasBlockBetween(
          input.senderProfile.userId,
          input.recipientProfile.userId
        )
      ) {
        throw new ChatRoomInviteError(
          "PAIR_BLOCKED",
          "That room is not available."
        )
      }
      return {
        miniRoom,
        mediaSession: options.livekitTokenService.createMediaSession({
          miniRoom,
          userId: input.actorUserId,
          now
        }),
        participants: createChatParticipants(
          input.senderProfile,
          input.recipientProfile
        )
      }
    },
    async createInvite(input, now = new Date()) {
      const senderPresence = await options.presenceService.findUserPresence(
        input.roomId,
        input.senderProfile.userId,
        now
      )
      if (!senderPresence) {
        throw new Error("Join the room before sending an invite.")
      }

      const recipientPresence = await options.presenceService.findUserPresence(
        input.roomId,
        input.recipientUserId,
        now
      )
      if (!recipientPresence) {
        throw new Error("That person is not nearby anymore.")
      }

      const blocked = await options.safetyService.hasBlockBetween(
        input.senderProfile.userId,
        input.recipientUserId
      )
      const nearbyUsers = await options.presenceService.listNearbyUsers(
        input.roomId,
        input.senderProfile.userId,
        blocked ? [input.recipientUserId] : [],
        now
      )
      const activeSenderRoom = await repository.findActiveMiniRoomForUser(
        input.senderProfile.userId
      )
      const activeRecipientRoom = await repository.findActiveMiniRoomForUser(
        input.recipientUserId
      )
      const eligibility = canInviteUser({
        senderUserId: input.senderProfile.userId,
        recipientUserId: input.recipientUserId,
        nearbyUsers,
        senderInMiniRoom: senderPresence.inMiniRoom || Boolean(activeSenderRoom),
        recipientInMiniRoom: recipientPresence.inMiniRoom || Boolean(activeRecipientRoom)
      })
      if (!eligibility.allowed) {
        throw new Error(inviteDenialMessage(eligibility.reason))
      }

      const invite: MiniRoomInviteRecord = {
        inviteId: `invite_${idFactory()}`,
        roomId: input.roomId,
        senderUserId: input.senderProfile.userId,
        recipientUserId: input.recipientUserId,
        senderSpotId: senderPresence.spotId,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + LEGACY_INVITE_TTL_MS).toISOString()
      }
      await repository.saveInvite(invite)
      return invite
    },
    async decideInvite(input, now = new Date()) {
      const invite = await repository.findInvite(input.inviteId)
      if (!invite || invite.status !== "pending") {
        throw new Error("That invite is not available anymore.")
      }
      if (
        (invite.expiresAt
          ? Date.parse(invite.expiresAt)
          : Date.parse(invite.createdAt) + LEGACY_INVITE_TTL_MS) <= now.getTime()
      ) {
        await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "expired",
          decidedAt: now.toISOString()
        })
        throw new Error("That invite expired.")
      }
      if (invite.recipientUserId !== input.actorProfile.userId) {
        throw new Error("That invite is not for this session.")
      }
      const lobbyRoomId = invite.roomId
      if (!lobbyRoomId) {
        throw new Error("That room invite is no longer available.")
      }

      const decision: MiniRoomInviteDecision = {
        inviteId: invite.inviteId,
        senderUserId: invite.senderUserId,
        recipientUserId: invite.recipientUserId,
        status: input.status,
        decidedAt: now.toISOString()
      }
      if (input.status === "declined") {
        const transitioned = await repository.transitionPendingInvite({
          inviteId: invite.inviteId,
          status: "declined",
          decidedAt: decision.decidedAt
        })
        if (!transitioned) {
          throw new Error("That invite is not available anymore.")
        }
        return { decision }
      }

      const senderPresence = await options.presenceService.findUserPresence(
        lobbyRoomId,
        invite.senderUserId,
        now
      )
      const recipientPresence = await options.presenceService.findUserPresence(
        lobbyRoomId,
        invite.recipientUserId,
        now
      )
      if (!senderPresence || !recipientPresence) {
        throw new Error("That room invite is no longer available.")
      }
      if (
        await options.safetyService.hasBlockBetween(
          invite.senderUserId,
          invite.recipientUserId
        )
      ) {
        throw new Error("That room invite is no longer available.")
      }

      const miniRoom: MiniRoomRecord = {
        miniRoomId: `mini_room_${idFactory()}`,
        lobbyRoomId,
        participantUserIds: [invite.senderUserId, invite.recipientUserId],
        livekitRoomName: `blumi-${idFactory()}`,
        startedAt: now.toISOString()
      }
      const participants: [MiniRoomParticipant, MiniRoomParticipant] = [
        {
          userId: senderPresence.userId,
          displayName: senderPresence.displayName,
          avatar: { ...senderPresence.avatar }
        },
        {
          userId: recipientPresence.userId,
          displayName: recipientPresence.displayName,
          avatar: { ...recipientPresence.avatar }
        }
      ]
      const mediaSessions = Object.fromEntries(
        miniRoom.participantUserIds.map((userId) => [
          userId,
          options.livekitTokenService.createMediaSession({
            miniRoom,
            userId,
            now
          })
        ])
      )
      const acceptance = await repository.acceptPendingInvite({
        inviteId: invite.inviteId,
        decidedAt: decision.decidedAt,
        miniRoom
      })
      if (acceptance !== "accepted") {
        throw new Error("That room invite is no longer available.")
      }
      try {
        await options.presenceService.setMiniRoomStatus(
          miniRoom.participantUserIds,
          true
        )
        await options.chatService.createThread({
          threadId: `thread_${miniRoom.miniRoomId}`,
          miniRoomId: miniRoom.miniRoomId,
          participantUserIds: miniRoom.participantUserIds,
          participants: [
            {
              userId: senderPresence.userId,
              displayName: senderPresence.displayName
            },
            {
              userId: recipientPresence.userId,
              displayName: recipientPresence.displayName
            }
          ]
        }, now)

        return {
          decision,
          miniRoom: await repository.findMiniRoom(miniRoom.miniRoomId) ?? (() => { throw new Error("Accepted room did not persist.") })(),
          participants,
          mediaSessions
        }
      } catch (error) {
        const [roomRollback, presenceRollback] = await Promise.allSettled([
          repository.rollbackAcceptedMiniRoom({
            inviteId: invite.inviteId,
            miniRoomId: miniRoom.miniRoomId,
            decidedAt: now.toISOString()
          }),
          options.presenceService.setMiniRoomStatus(
            miniRoom.participantUserIds,
            false
          )
        ])
        if (
          roomRollback.status === "rejected" ||
          roomRollback.value !== true ||
          presenceRollback.status === "rejected"
        ) {
          throw new AggregateError(
            [error, roomRollback, presenceRollback],
            "Mini room setup rollback failed."
          )
        }
        throw error
      }
    },
    async leaveMiniRoom(miniRoomId, endedByUserId, now = new Date()) {
      const miniRoom = await repository.findMiniRoom(miniRoomId)
      if (!miniRoom || miniRoom.endedAt) return null
      if (!miniRoom.participantUserIds.includes(endedByUserId)) {
        throw new Error("That room is not available.")
      }

      const endedAt = now.toISOString()
      const economyService = options.economyService
      if (
        economyService &&
        now.getTime() - new Date(miniRoom.startedAt).getTime() >=
          MINIMUM_REWARDED_ROOM_DURATION_MS
      ) {
        const completionIntent = await repository.anchorMiniRoomCompletion({
          miniRoomId,
          requestedByUserId: endedByUserId,
          requestedAt: endedAt,
          rewardDate: endedAt.slice(0, 10)
        })
        if (!completionIntent) return null
        await Promise.all(
          miniRoom.participantUserIds.map((userId) =>
            economyService.grantEventReward(
              userId,
              "room_complete",
              completionIntent.rewardDate,
              now
            )
          )
        )
      }
      const endedRoom = await repository.endMiniRoom(
        miniRoomId,
        endedByUserId,
        endedAt
      )
      if (!endedRoom?.endedAt || !endedRoom.endedByUserId) return null
      await options.presenceService.setMiniRoomStatus(
        endedRoom.participantUserIds,
        false
      )

      return {
        miniRoomId: endedRoom.miniRoomId,
        lobbyRoomId: endedRoom.lobbyRoomId,
        participantUserIds: [...endedRoom.participantUserIds] as [string, string],
        endedByUserId: endedRoom.endedByUserId,
        endedAt: endedRoom.endedAt
      }
    },
    async findActiveMiniRoomForUser(userId) {
      return repository.findActiveMiniRoomForUser(userId)
    },
    async findMiniRoom(miniRoomId) {
      return repository.findMiniRoom(miniRoomId)
    },
    async separateUserPair(actorUserId, otherUserId, now = new Date()) {
      const endedRooms = await repository.separateUserPair({
        actorUserId,
        otherUserId,
        endedAt: now.toISOString()
      })
      await Promise.all(
        endedRooms.map((room) =>
          options.presenceService.setMiniRoomStatus(room.participantUserIds, false)
        )
      )
      return endedRooms.map((room) => ({
        miniRoomId: room.miniRoomId,
        lobbyRoomId: room.lobbyRoomId,
        participantUserIds: [...room.participantUserIds] as [string, string],
        endedByUserId: actorUserId,
        endedAt: room.endedAt ?? now.toISOString()
      }))
    }
  }
}

function assertDistinctChatProfiles(
  senderProfile: UserProfile,
  recipientProfile: UserProfile
): void {
  if (senderProfile.userId === recipientProfile.userId) {
    throw new ChatRoomInviteError(
      "INVITE_FORBIDDEN",
      "That room invite is not available."
    )
  }
}

function assertProfilesMatchInvite(
  invite: MiniRoomInviteRecord,
  senderProfile: UserProfile,
  recipientProfile: UserProfile
): void {
  if (
    invite.senderUserId !== senderProfile.userId ||
    invite.recipientUserId !== recipientProfile.userId
  ) {
    throw new ChatRoomInviteError(
      "INVITE_FORBIDDEN",
      "That room invite is not available."
    )
  }
}

async function assertChatThreadParticipants(
  chatService: ChatService,
  threadId: string,
  senderUserId: string,
  recipientUserId: string
): Promise<void> {
  const thread = await chatService.repository.findThread(threadId)
  if (
    !thread ||
    !thread.participantUserIds.includes(senderUserId) ||
    !thread.participantUserIds.includes(recipientUserId)
  ) {
    throw new ChatRoomInviteError(
      "INVITE_FORBIDDEN",
      "That conversation is not available."
    )
  }
}

function createDecision(
  invite: MiniRoomInviteRecord,
  status: Exclude<MiniRoomInviteDecisionStatus, "cancelled">,
  decidedAt: string
): MiniRoomInviteDecision {
  return {
    inviteId: invite.inviteId,
    senderUserId: invite.senderUserId,
    recipientUserId: invite.recipientUserId,
    status,
    decidedAt
  }
}

function buildChatInviteResult(input: {
  invite: MiniRoomInviteRecord
  miniRoom: MiniRoomRecord
  senderProfile: UserProfile
  recipientProfile: UserProfile
  livekitTokenService: LivekitTokenService
  now: Date
}): ChatRoomInviteDecisionResult {
  const participants = createChatParticipants(
    input.senderProfile,
    input.recipientProfile
  )
  const mediaSessions = Object.fromEntries(
    input.miniRoom.participantUserIds.map((userId) => [
      userId,
      input.livekitTokenService.createMediaSession({
        miniRoom: input.miniRoom,
        userId,
        now: input.now
      })
    ])
  )
  return {
    invite: input.invite,
    decision: createDecision(
      input.invite,
      "accepted",
      input.invite.decidedAt ?? input.now.toISOString()
    ),
    miniRoom: input.miniRoom,
    participants,
    mediaSessions
  }
}

function createChatParticipants(
  senderProfile: UserProfile,
  recipientProfile: UserProfile
): [MiniRoomParticipant, MiniRoomParticipant] {
  return [
    {
      userId: senderProfile.userId,
      displayName: senderProfile.displayName,
      avatar: { ...senderProfile.avatar }
    },
    {
      userId: recipientProfile.userId,
      displayName: recipientProfile.displayName,
      avatar: { ...recipientProfile.avatar }
    }
  ]
}

function inviteDenialMessage(reason: string | undefined): string {
  if (reason === "self") return "You cannot invite yourself."
  if (reason === "blocked") return "That person is not available anymore."
  if (reason === "sender_busy") return "Leave your current room first."
  if (reason === "recipient_busy") return "That person is already in a room."
  return "Move closer before sending an invite."
}
