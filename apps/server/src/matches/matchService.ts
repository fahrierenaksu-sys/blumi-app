import { randomUUID } from "node:crypto"
import type {
  DiscoveryFilters,
  DiscoveryGender,
  DiscoveryDecisionQuota,
  DiscoveryWatchRecord
} from "@blumi/contracts"
import {
  createInMemoryMatchRepository,
  type DiscoverProfileRecord,
  type DiscoveryRepositoryPageRequest,
  type DiscoveryDecision,
  type DiscoveryDecisionRecord,
  type MatchRecord,
  type MatchRepository
} from "./matchRepository"
import type { DiscoveryWatchClaim } from "./matchRepository"
import type { EconomyService } from "../economy/economyService"
import type { NotificationService } from "../notifications/notificationService"
import { PublicRequestError } from "../errors/publicRequestError"

export interface MatchService {
  repository: MatchRepository
  listDiscovery(
    currentUserId: string,
    filters: DiscoveryFilters
  ): Promise<DiscoverProfileRecord[]>
  listDiscoveryPage(
    currentUserId: string,
    filters: DiscoveryFilters,
    page: DiscoveryRepositoryPageRequest
  ): Promise<DiscoverProfileRecord[]>
  getDecisionQuota(userId: string, now?: Date): Promise<DiscoveryDecisionQuota>
  findProfile(userId: string): Promise<DiscoverProfileRecord | null>
  findProfileForViewer(
    currentUserId: string,
    targetUserId: string,
    filters: DiscoveryFilters,
    currentUserGender?: DiscoveryGender,
    now?: Date
  ): Promise<DiscoverProfileForViewer | null>
  decide(
    currentUserId: string,
    targetUserId: string,
    decision: DiscoveryDecision,
    now?: Date
  ): Promise<DiscoveryDecisionResult>
  decideEligible(
    currentUserId: string,
    targetUserId: string,
    decision: DiscoveryDecision,
    filters: DiscoveryFilters,
    currentUserGender?: DiscoveryGender,
    now?: Date
  ): Promise<DiscoveryDecisionResult>
  getDiscoveryWatch(userId: string, now?: Date): Promise<DiscoveryWatchRecord | null>
  claimNextDiscoveryWatch(now?: Date): Promise<DiscoveryWatchClaim | null>
  restoreDiscoveryWatch(watch: DiscoveryWatchClaim): Promise<DiscoveryWatchRecord>
  completeDiscoveryWatch(watch: DiscoveryWatchClaim): Promise<boolean>
  isDiscoveryWatchClaimCurrent(watch: DiscoveryWatchClaim, now?: Date): Promise<boolean>
  activateDiscoveryWatch(
    userId: string,
    preferences: DiscoveryFilters,
    now?: Date
  ): Promise<DiscoveryWatchRecord>
  cancelDiscoveryWatch(userId: string): Promise<void>
}

export interface DiscoveryDecisionResult {
  decision: DiscoveryDecisionRecord
  matched: boolean
  match: MatchRecord | null
  quota: DiscoveryDecisionQuota
}

export type DiscoverDecisionCapability = "mutual-like" | "view-only"

export interface DiscoverProfileForViewer {
  profile: DiscoverProfileRecord
  decision: { capability: DiscoverDecisionCapability }
}

export class DiscoveryDecisionQuotaExceededError extends PublicRequestError {
  readonly quota: DiscoveryDecisionQuota

  constructor(quota: DiscoveryDecisionQuota) {
    super("You’ve reached today’s Discover limit. Come back after it resets.")
    this.name = "DiscoveryDecisionQuotaExceededError"
    this.quota = quota
  }
}

export class DiscoveryDecisionNotEligibleError extends PublicRequestError {
  constructor() {
    super("This profile is view-only right now.")
    this.name = "DiscoveryDecisionNotEligibleError"
  }
}

export interface CreateMatchServiceOptions {
  repository?: MatchRepository
  idFactory?: () => string
  economyService?: EconomyService
  notificationService?: Pick<NotificationService, "sendPushToUser">
}

export function createMatchService(
  options: CreateMatchServiceOptions = {}
): MatchService {
  const repository = options.repository ?? createInMemoryMatchRepository()
  const idFactory = options.idFactory ?? createMatchId

  return {
    repository,
    async listDiscovery(currentUserId, filters) {
      return repository.listDiscoverProfiles(currentUserId, filters)
    },
    async listDiscoveryPage(currentUserId, filters, page) {
      return repository.listDiscoverProfiles(currentUserId, filters, page)
    },
    async getDecisionQuota(userId, now = new Date()) {
      return repository.getDecisionQuota(userId, now)
    },
    async findProfile(userId) {
      return repository.findDiscoverProfile(userId)
    },
    async findProfileForViewer(
      currentUserId,
      targetUserId,
      filters,
      currentUserGender,
      now = new Date()
    ) {
      const profile = await repository.findDiscoverProfile(targetUserId)
      if (!profile) return null
      const [eligibleProfile, quota] = await Promise.all([
        repository.findEligibleDiscoverProfile(
          currentUserId,
          targetUserId,
          filters,
          currentUserGender
        ),
        repository.getDecisionQuota(currentUserId, now)
      ])
      return {
        profile,
        decision: {
          capability: eligibleProfile && quota.remaining > 0
            ? "mutual-like"
            : "view-only"
        }
      }
    },
    async getDiscoveryWatch(userId, now = new Date()) {
      const watch = await repository.findDiscoveryWatch(userId)
      if (!watch) return null
      if (new Date(watch.expiresAt).getTime() <= now.getTime()) {
        await repository.deleteDiscoveryWatch(userId)
        return null
      }
      return watch
    },
    async claimNextDiscoveryWatch(now = new Date()) {
      return repository.claimNextDiscoveryWatch(now)
    },
    async restoreDiscoveryWatch(watch) {
      return repository.restoreDiscoveryWatch(watch)
    },
    async completeDiscoveryWatch(watch) {
      return repository.completeDiscoveryWatch(watch)
    },
    async isDiscoveryWatchClaimCurrent(watch, now = new Date()) {
      return repository.isDiscoveryWatchClaimCurrent(watch, now)
    },
    async activateDiscoveryWatch(userId, preferences, now = new Date()) {
      const watch: DiscoveryWatchRecord = {
        userId,
        status: "active",
        preferences: {
          ...preferences,
          genders: [...preferences.genders],
          vibes: [...preferences.vibes]
        },
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
      return repository.upsertDiscoveryWatch(watch)
    },
    async cancelDiscoveryWatch(userId) {
      await repository.deleteDiscoveryWatch(userId)
    },
    async decide(currentUserId, targetUserId, decision, now = new Date()) {
      if (currentUserId === targetUserId) {
        throw new PublicRequestError("You cannot match with yourself.")
      }

      const target = await repository.findDiscoverProfile(targetUserId)
      if (!target) {
        throw new PublicRequestError("That profile is not available anymore.")
      }

      return decideForTarget(currentUserId, target, decision, now)
    },
    async decideEligible(
      currentUserId,
      targetUserId,
      decision,
      filters,
      currentUserGender,
      now = new Date()
    ) {
      if (currentUserId === targetUserId) {
        throw new DiscoveryDecisionNotEligibleError()
      }
      const target = await repository.findEligibleDiscoverProfile(
        currentUserId,
        targetUserId,
        filters,
        currentUserGender
      )
      if (!target) {
        const previousDecision = await repository.findDecision(
          currentUserId,
          targetUserId
        )
        if (previousDecision?.decision === decision) {
          const retryTarget = await repository.findDiscoverProfile(targetUserId)
          if (retryTarget) {
            return decideForTarget(currentUserId, retryTarget, decision, now)
          }
        }
        throw new DiscoveryDecisionNotEligibleError()
      }
      return decideForTarget(currentUserId, target, decision, now)
    }
  }

  async function decideForTarget(
    currentUserId: string,
    target: DiscoverProfileRecord,
    decision: DiscoveryDecision,
    now: Date
  ): Promise<DiscoveryDecisionResult> {
      const targetUserId = target.userId

      const decisionRecord: DiscoveryDecisionRecord = {
        fromUserId: currentUserId,
        toUserId: targetUserId,
        decision,
        decidedAt: now.toISOString()
      }
      const previousDecision = await repository.findDecision(currentUserId, targetUserId)
      const reconsiderationOf = canReconsiderExpiredPass(
        previousDecision,
        target,
        now
      )
        ? previousDecision?.decidedAt
        : undefined
      const persisted = await repository.consumeDecisionQuota(
        decisionRecord,
        now,
        reconsiderationOf
      )
      if (!persisted.decision) {
        throw new DiscoveryDecisionQuotaExceededError(persisted.quota)
      }
      const canonicalDecision = persisted.decision

      if (canonicalDecision.decision !== "like") {
        return {
          decision: canonicalDecision,
          matched: false,
          match: null,
          quota: persisted.quota
        }
      }

      const reciprocal = await repository.findDecision(targetUserId, currentUserId)
      if (reciprocal?.decision !== "like") {
        if (persisted.created) {
          await notifyLike(options.notificationService, targetUserId, currentUserId)
        }
        return {
          decision: canonicalDecision,
          matched: false,
          match: null,
          quota: persisted.quota
        }
      }

      const existing = await repository.findMatchBetween(currentUserId, targetUserId)
      if (existing) {
        await rewardMatchParticipants(options.economyService, existing, now)
        return {
          decision: canonicalDecision,
          matched: true,
          match: existing,
          quota: persisted.quota
        }
      }

      const match: MatchRecord = {
        matchId: idFactory(),
        participantUserIds: [currentUserId, targetUserId],
        matchedAt: now.toISOString()
      }
      const canonicalMatch = await repository.createMatch(match)
      await rewardMatchParticipants(options.economyService, canonicalMatch, now)
      await notifyMatch(options.notificationService, canonicalMatch)

      return {
        decision: canonicalDecision,
        matched: true,
        match: canonicalMatch,
        quota: persisted.quota
      }
  }
}

async function notifyLike(
  notificationService: Pick<NotificationService, "sendPushToUser"> | undefined,
  userId: string,
  sourceUserId: string
): Promise<void> {
  if (!notificationService) return
  await notificationService.sendPushToUser(userId, {
    title: "Someone likes your vibe",
    body: "Open Blumi to see where this could go.",
    data: { type: "discovery.like", sourceUserId }
  })
}

async function notifyMatch(
  notificationService: Pick<NotificationService, "sendPushToUser"> | undefined,
  match: MatchRecord
): Promise<void> {
  if (!notificationService) return
  await Promise.all(match.participantUserIds.map((userId) =>
    notificationService.sendPushToUser(userId, {
      title: "It’s a match!",
      body: "Your vibes connected. Say hi when you’re ready.",
      data: { type: "discovery.match", matchId: match.matchId }
    })
  ))
}

async function rewardMatchParticipants(
  economyService: EconomyService | undefined,
  match: MatchRecord,
  now: Date
): Promise<void> {
  if (!economyService) return
  const pairKey = createParticipantPairKey(match.participantUserIds)
  await Promise.all(
    match.participantUserIds.map((userId) =>
      economyService.grantEventReward(userId, "mutual_match", pairKey, now)
    )
  )
}

function createParticipantPairKey(participantUserIds: readonly string[]): string {
  return `pair:${[...participantUserIds].sort().join(":")}`
}

function canReconsiderExpiredPass(
  previousDecision: DiscoveryDecisionRecord | null,
  target: DiscoverProfileRecord,
  now: Date
): boolean {
  if (previousDecision?.decision !== "pass") return false
  const previousDecisionAt = Date.parse(previousDecision.decidedAt)
  if (!Number.isFinite(previousDecisionAt)) return false
  const nowMs = now.getTime()
  if (previousDecisionAt <= nowMs - 30 * 24 * 60 * 60 * 1000) return true
  const targetUpdatedAt = target.updatedAt ? Date.parse(target.updatedAt) : Number.NaN
  return Number.isFinite(targetUpdatedAt) &&
    targetUpdatedAt > previousDecisionAt &&
    previousDecisionAt <= nowMs - 7 * 24 * 60 * 60 * 1000
}

function createMatchId(): string {
  return `match_${randomUUID()}`
}
