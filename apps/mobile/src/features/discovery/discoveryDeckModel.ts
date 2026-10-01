import type { DiscoveryDecisionQuota } from "@blumi/contracts"

export interface DiscoveryDeckProfile {
  userId: string
  blocked: boolean
}

export interface DiscoveryDeckExclusions {
  blockedUserIds: ReadonlySet<string>
  skippedUserIds: ReadonlySet<string>
  savedUserIds: ReadonlySet<string>
  seenUserIds: ReadonlySet<string>
  pendingInviteUserIds: ReadonlySet<string>
}

export interface InFlightDiscoveryDecisionStart {
  accepted: boolean
  nextUserIds: ReadonlySet<string>
}

export function buildDiscoveryDeck<T extends DiscoveryDeckProfile>(
  profiles: readonly T[],
  exclusions: DiscoveryDeckExclusions
): T[] {
  return profiles.filter((profile) => {
    if (profile.blocked || exclusions.blockedUserIds.has(profile.userId)) return false
    if (exclusions.skippedUserIds.has(profile.userId)) return false
    if (exclusions.savedUserIds.has(profile.userId)) return false
    if (exclusions.seenUserIds.has(profile.userId)) return false
    return !exclusions.pendingInviteUserIds.has(profile.userId)
  })
}

export function beginInFlightDiscoveryDecision(
  currentUserIds: ReadonlySet<string>,
  candidateUserId: string
): InFlightDiscoveryDecisionStart {
  if (currentUserIds.has(candidateUserId)) {
    return { accepted: false, nextUserIds: currentUserIds }
  }
  return {
    accepted: true,
    nextUserIds: new Set([...currentUserIds, candidateUserId])
  }
}

export function finishInFlightDiscoveryDecision(
  currentUserIds: ReadonlySet<string>,
  candidateUserId: string
): ReadonlySet<string> {
  const nextUserIds = new Set(currentUserIds)
  nextUserIds.delete(candidateUserId)
  return nextUserIds
}

export function applyOptimisticDiscoveryDecision(
  seenUserIds: ReadonlySet<string>,
  candidateUserId: string
): Set<string> {
  return new Set([...seenUserIds, candidateUserId])
}

export function rollbackOptimisticDiscoveryDecision(
  seenUserIds: ReadonlySet<string>,
  candidateUserId: string
): Set<string> {
  const restored = new Set(seenUserIds)
  restored.delete(candidateUserId)
  return restored
}

export interface ProductionDetailDecisionCompletion {
  decision: "like" | "pass"
  userId: string
  quota: DiscoveryDecisionQuota
}

export function applyProductionDetailDecision(
  seenUserIds: ReadonlySet<string>,
  completion: ProductionDetailDecisionCompletion
): {
  seenUserIds: Set<string>
  quota: DiscoveryDecisionQuota
} {
  return {
    seenUserIds: applyOptimisticDiscoveryDecision(
      seenUserIds,
      completion.userId
    ),
    quota: {
      ...completion.quota,
      rewardedAd: { ...completion.quota.rewardedAd }
    }
  }
}

/**
 * Decision answers can arrive out of order when cards are swiped quickly, so
 * a late answer must not raise the remaining count again. Within one quota
 * period (same `resetsAt`) the answer with the most used decisions wins, the
 * newest on a tie; a later period always replaces an earlier one.
 */
export function mergeDiscoveryQuota(
  current: DiscoveryDecisionQuota | undefined,
  next: DiscoveryDecisionQuota
): DiscoveryDecisionQuota {
  if (!current) return next
  const currentResetsAt = Date.parse(current.resetsAt)
  const nextResetsAt = Date.parse(next.resetsAt)
  if (Number.isFinite(currentResetsAt) && Number.isFinite(nextResetsAt) && nextResetsAt !== currentResetsAt) {
    return nextResetsAt > currentResetsAt ? next : current
  }
  return next.used < current.used ? current : next
}
