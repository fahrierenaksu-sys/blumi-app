import type {
  ConnectionDecisionRecord,
  ConnectionDecisionStatus,
  ConnectionMatch
} from "@blumi/contracts"
import { canRecordConnectionDecision } from "@blumi/domain"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import {
  createInMemoryConnectionRepository,
  type ConnectionRepository
} from "./connectionRepository"
import type { EconomyService } from "../economy/economyService"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import type { SafetyService } from "../safety/safetyService"

export interface ConnectionService {
  repository: ConnectionRepository
  decide(
    actorUserId: string,
    input: ConnectionDecisionInput,
    now?: Date
  ): Promise<ConnectionDecisionResult>
}

export interface ConnectionDecisionInput {
  miniRoomId: string
  partnerUserId: string
  status: ConnectionDecisionStatus
}

export interface ConnectionDecisionResult {
  decision: ConnectionDecisionRecord
  match: ConnectionMatch | null
}

export class ConnectionDecisionUnavailableError extends Error {
  constructor() {
    super("That connection decision is not available.")
    this.name = "ConnectionDecisionUnavailableError"
  }
}

export interface CreateConnectionServiceOptions {
  repository?: ConnectionRepository
  miniRoomService: MiniRoomService
  /** A blocked pair can never record a decision or complete a room match. */
  safetyService: Pick<SafetyService, "hasBlockBetween">
  economyService?: EconomyService
  reportSideEffectFailure?: (kind: "reward", error: unknown) => void
}

export function createConnectionService(
  options: CreateConnectionServiceOptions
): ConnectionService {
  const repository = options.repository ?? createInMemoryConnectionRepository()

  return {
    repository,
    async decide(actorUserId, input, now = new Date()) {
      const miniRoom = await options.miniRoomService.findMiniRoom(input.miniRoomId)
      if (!miniRoom) {
        throw new ConnectionDecisionUnavailableError()
      }
      const eligibility = canRecordConnectionDecision({
        miniRoom,
        actorUserId,
        partnerUserId: input.partnerUserId
      })
      if (!eligibility.allowed) {
        throw new ConnectionDecisionUnavailableError()
      }
      if (input.status !== "saved" && input.status !== "passed") {
        throw new ConnectionDecisionUnavailableError()
      }
      if (await options.safetyService.hasBlockBetween(actorUserId, input.partnerUserId)) {
        throw new ConnectionDecisionUnavailableError()
      }

      const existing = await repository.findDecision(input.miniRoomId, actorUserId)
      const proposedDecision: ConnectionDecisionRecord = existing ?? {
        miniRoomId: input.miniRoomId,
        actorUserId,
        partnerUserId: input.partnerUserId,
        status: input.status,
        decidedAt: now.toISOString()
      }
      if (!existing) {
        await repository.saveDecision(proposedDecision)
      }
      const decision = await repository.findDecision(input.miniRoomId, actorUserId)
      if (!decision) throw new Error("Connection decision persistence did not return a canonical record.")

      if (decision.status !== "saved") {
        return { decision, match: null }
      }

      const reciprocal = await repository.findDecision(
        input.miniRoomId,
        input.partnerUserId
      )
      if (reciprocal?.status !== "saved") {
        return { decision, match: null }
      }

      const existingMatch = await repository.findMatch(input.miniRoomId)
      if (existingMatch) {
        await rewardSafely(existingMatch, now)
        return { decision, match: existingMatch }
      }

      const match: ConnectionMatch = {
        miniRoomId: input.miniRoomId,
        participantUserIds: [...miniRoom.participantUserIds] as [string, string],
        matchedAt: now.toISOString()
      }
      await repository.saveMatch(match)
      await rewardSafely(match, now)
      return { decision, match }
    }
  }

  async function rewardSafely(match: ConnectionMatch, now: Date): Promise<void> {
    try {
      await rewardConnectionParticipants(options.economyService, match, now)
    } catch (error) {
      if (options.reportSideEffectFailure) {
        try { options.reportSideEffectFailure("reward", error) } catch { /* Preserve the durable match. */ }
      } else {
        console.error("Connection match reward failed", { errorKind: safeOperationalErrorKind(error) })
      }
    }
  }
}

async function rewardConnectionParticipants(
  economyService: EconomyService | undefined,
  match: ConnectionMatch,
  now: Date
): Promise<void> {
  if (!economyService) return
  const pairKey = `pair:${[...match.participantUserIds].sort().join(":")}`
  await Promise.all(
    match.participantUserIds.map((userId) =>
      economyService.grantEventReward(userId, "mutual_match", pairKey, now)
    )
  )
}
