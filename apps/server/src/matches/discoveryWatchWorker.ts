import type { NotificationService } from "../notifications/notificationService"
import type { DiscoveryWatchRecord } from "@blumi/contracts"
import type { DiscoveryWatchClaim, DiscoveryWatchRestoreOptions } from "./matchRepository"
import type { SafetyService } from "../safety/safetyService"
import type { MatchService } from "./matchService"
import { startPeriodicWorker } from "../operations/periodicWorker"

const DEFAULT_INTERVAL_MS = 15_000
const DISCOVERY_SCAN_LIMIT = 24
const DISCOVERY_MAX_SCAN_PAGES = 4
/** A watch with no candidate is rescanned at most this often. */
export const NO_CANDIDATE_COOLDOWN_MS = 60_000
/** One cycle stops claiming after this long, below the 15 s interval. */
const DEFAULT_CYCLE_TIME_BUDGET_MS = 10_000

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
  /** Monotonic milliseconds for the time budget (tests inject it). */
  clock?: () => number
  timeBudgetMs?: number
}): Promise<number> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 50
  const clock = options.clock ?? (() => performance.now())
  const deadline = clock() + (options.timeBudgetMs ?? DEFAULT_CYCLE_TIME_BUDGET_MS)
  const claimedThisCycle = new Set<string>()
  let delivered = 0
  for (let index = 0; index < limit && clock() < deadline; index += 1) {
    const watch = await options.matchService.claimNextDiscoveryWatch(now)
    if (!watch) return delivered
    if (claimedThisCycle.has(watch.userId)) {
      // The queue wrapped (a repository without cooldown): leave it for later.
      await restoreDiscoveryWatchForLater(watch, now, options.matchService)
      return delivered
    }
    claimedThisCycle.add(watch.userId)
    try {
      const candidate = await findFirstUnblockedCandidate(watch, options)
      if (!candidate) {
        // One watch with nobody new must not end the cycle for every watch
        // behind it (2026-10-01): cool it down and move on.
        await restoreDiscoveryWatchForLater(watch, now, options.matchService, {
          coolDownUntil: new Date(now.getTime() + NO_CANDIDATE_COOLDOWN_MS)
        })
        continue
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
  matchService: Pick<MatchService, "restoreDiscoveryWatch">,
  restoreOptions?: DiscoveryWatchRestoreOptions
): Promise<DiscoveryWatchRecord> {
  return matchService.restoreDiscoveryWatch({
    ...watch,
    updatedAt: now.toISOString()
  }, restoreOptions)
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
