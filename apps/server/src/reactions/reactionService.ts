import { randomUUID } from "node:crypto"
import { REACTION_TYPES, type ReactionEvent, type ReactionType } from "@blumi/contracts"
import {
  createInMemoryReactionRepository,
  type ReactionRepository
} from "./reactionRepository"

export interface ReactionService {
  repository: ReactionRepository
  createReaction(input: CreateReactionInput, now?: Date): Promise<ReactionEvent>
}

export interface CreateReactionInput {
  roomId: string
  actorUserId: string
  reaction: string
  targetUserId?: string
}

export interface CreateReactionServiceOptions {
  repository?: ReactionRepository
  idFactory?: () => string
}

export function createReactionService(
  options: CreateReactionServiceOptions = {}
): ReactionService {
  const repository = options.repository ?? createInMemoryReactionRepository()
  const idFactory = options.idFactory ?? (() => `reaction_${randomUUID()}`)

  return {
    repository,
    async createReaction(input, now = new Date()) {
      if (!isReactionType(input.reaction)) {
        throw new Error("Choose a valid reaction.")
      }
      const event: ReactionEvent = {
        roomId: normalizeRoomId(input.roomId),
        actorUserId: input.actorUserId,
        ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
        reaction: input.reaction,
        createdAt: now.toISOString()
      }
      await repository.saveReaction({
        reactionId: idFactory(),
        ...event
      })
      return event
    }
  }
}

function isReactionType(reaction: string): reaction is ReactionType {
  return REACTION_TYPES.includes(reaction as ReactionType)
}

function normalizeRoomId(roomId: string): string {
  const trimmed = roomId.trim()
  if (!trimmed) {
    throw new Error("Choose a room first.")
  }
  return trimmed
}
