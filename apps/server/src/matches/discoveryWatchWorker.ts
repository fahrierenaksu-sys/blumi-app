import type { NotificationService } from "../notifications/notificationService"
import type { DiscoveryWatchRecord } from "@blumi/contracts"
import type { DiscoveryWatchClaim } from "./matchRepository"
import type { SafetyService } from "../safety/safetyService"
import type { MatchService } from "./matchService"
import { startPeriodicWorker } from "../operations/periodicWorker"

const DEFAULT_INTERVAL_MS = 15_000
const DISCOVERY_SCAN_LIMIT = 24
const DISCOVERY_MAX_SCAN_PAGES = 4

type DiscoverySafetyLookup =
  Pick<SafetyService, "hasBlockBetween"> &
  Partial<Pick<SafetyService, "listBlockedUserIdsBetween">>

export interface DiscoveryWatchWorker {
  stop(): Promise<void>
}

export async function runDiscoveryWatchCycle(options: {
  matchService: Pick<MatchService, "claimNextDiscoveryWatch" | "restoreDiscoveryWatch" | "listDiscoveryPage" | "completeDiscoveryWatch" | "isDiscoveryWatchClaimCurrent">
  safetyService: DiscoverySafetyLookup
  notificationService: Pick<NotificationService, "sendPushToUser">
  now?: Date
  limit?: number
}): Promise<number> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 50
  let delivered = 0
  for (let index = 0; index < limit; index += 1) {
    const watch = await options.matchService.claimNextDiscoveryWatch(now)
    if (!watch) return delivered
    try {
      const candidate = await findFirstUnblockedCandidate(watch, options)
      if (!candidate) {
        await restoreDiscoveryWatchForLater(watch, now, options.matchService)
        return delivered
      }
      const notificationResult = await options.notificationService.sendPushToUser(watch.userId, {
        title: "A new vibe match is here",
        body: "Someone who fits your vibe is ready to meet.",
        data: {
          type: "discovery.watch_match",
          eventId: `discovery-watch:${watch.userId}:${watch.generation}`,
          profileId: candidate.userId
        }
      }, watch)
      if (notificationResult.outcome !== "queued") {
        await restoreDiscoveryWatchForLater(watch, now, options.matchService)
        return delivered
      }
      delivered += 1
    } catch (error) {
      await restoreDiscoveryWatchForLater(watch, now, options.matchService)
      throw error
    }
  }
  return delivered
}

function restoreDiscoveryWatchForLater(
  watch: DiscoveryWatchClaim,
  now: Date,
  matchService: Pick<MatchService, "restoreDiscoveryWatch">
): Promise<DiscoveryWatchRecord> {
  return matchService.restoreDiscoveryWatch({
    ...watch,
    updatedAt: now.toISOString()
  })
}

async function findFirstUnblockedCandidate(
  watch: DiscoveryWatchRecord,
  options: Pick<Parameters<typeof runDiscoveryWatchCycle>[0], "matchService" | "safetyService">
) {
  for (let pageIndex = 0; pageIndex < DISCOVERY_MAX_SCAN_PAGES; pageIndex += 1) {
    const candidates = await options.matchService.listDiscoveryPage(
      watch.userId,
      watch.preferences,
      { offset: pageIndex * DISCOVERY_SCAN_LIMIT, limit: DISCOVERY_SCAN_LIMIT }
    )
    const candidate = await firstUnblockedCandidate(candidates, watch.userId, options.safetyService)
    if (candidate) return candidate
    if (candidates.length < DISCOVERY_SCAN_LIMIT) return null
  }
  return null
}

export function startDiscoveryWatchWorker(options: {
  matchService: Pick<MatchService, "claimNextDiscoveryWatch" | "restoreDiscoveryWatch" | "listDiscoveryPage" | "completeDiscoveryWatch" | "isDiscoveryWatchClaimCurrent">
  safetyService: DiscoverySafetyLookup
  notificationService: Pick<NotificationService, "sendPushToUser">
  intervalMs?: number
  reportError?: (error: unknown) => void
}): DiscoveryWatchWorker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new Error("Discovery Watch worker interval must be at least one second.")
  }
  return startPeriodicWorker({ run: () => runDiscoveryWatchCycle(options), intervalMs, reportError: options.reportError })
}

async function firstUnblockedCandidate(
  candidates: Awaited<ReturnType<MatchService["listDiscoveryPage"]>>,
  watcherUserId: string,
  safetyService: DiscoverySafetyLookup
) {
  if (!safetyService.listBlockedUserIdsBetween) {
    const blocked = await Promise.all(
      candidates.map((candidate) =>
        safetyService.hasBlockBetween(watcherUserId, candidate.userId)
      )
    )
    return candidates.find((_candidate, index) => !blocked[index]) ?? null
  }
  const blockedUserIds = new Set(
    await safetyService.listBlockedUserIdsBetween(
      watcherUserId,
      candidates.map((candidate) => candidate.userId)
    )
  )
  return candidates.find((candidate) => !blockedUserIds.has(candidate.userId)) ?? null
}
