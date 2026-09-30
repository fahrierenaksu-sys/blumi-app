import { getDiscoveryMatchCreatedProperties, type MatchCreatedProperties } from "./matchResultPresentation"

/**
 * Reports `match_created` (source `discovery`) for a mutual match the server
 * confirmed in a Discover decision response.
 *
 * The event is per user: each account reports only the matches its own
 * decision response confirmed, once per canonical server match id. The server
 * answers a repeated like of an already matched user with the same match
 * record, so the id set is what keeps request retries, re-navigation, and app
 * restarts from counting one match twice. The MatchResult route and "View
 * match" in chat never call this, so replays cannot emit.
 *
 * Only opaque server match ids are stored, per account, bounded to the most
 * recent {@link DISCOVERY_MATCH_CREATED_MAX_IDS}. Nothing is read or written
 * while analytics consent is off.
 */

export const DISCOVERY_MATCH_CREATED_MAX_IDS = 200
const STORAGE_KEY_PREFIX = "@blumi/analytics/discovery_match_created_v1:"
const STORAGE_VERSION = 1

export interface DiscoveryMatchCreatedStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export interface DiscoveryMatchCreatedDependencies {
  storage: DiscoveryMatchCreatedStorage
  /** The same consent gate `captureProductEvent` applies. */
  isCaptureEnabled: () => boolean
  captureMatchCreated: (properties: MatchCreatedProperties) => void
}

/** The server-owned fields of a Discover decision response this reads. */
export interface DiscoveryMatchCreatedDecision {
  matched: boolean
  match: { matchId: string; participantUserIds: readonly string[] } | null
}

export interface DiscoveryMatchCreatedInput {
  accountUserId: string
  mode: "demo" | "production"
  result: DiscoveryMatchCreatedDecision
}

export interface DiscoveryMatchCreatedReporter {
  /** Resolves true only when this call emitted the event. Never throws. */
  report(input: DiscoveryMatchCreatedInput): Promise<boolean>
}

export function getDiscoveryMatchCreatedStorageKey(accountUserId: string): string {
  return `${STORAGE_KEY_PREFIX}${accountUserId}`
}

function getServerConfirmedMatchId(input: DiscoveryMatchCreatedInput): string | null {
  const { result, accountUserId } = input
  if (result.matched !== true || !result.match) return null
  const matchId = result.match.matchId
  if (typeof matchId !== "string" || !matchId.trim()) return null
  if (!accountUserId || !result.match.participantUserIds.includes(accountUserId)) return null
  return matchId
}

function parseStoredMatchIds(rawValue: string | null): string[] {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== "object") return []
    const record = parsed as { version?: unknown; matchIds?: unknown }
    if (record.version !== STORAGE_VERSION || !Array.isArray(record.matchIds)) return []
    return record.matchIds
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .slice(-DISCOVERY_MATCH_CREATED_MAX_IDS)
  } catch {
    return []
  }
}

export function createDiscoveryMatchCreatedReporter(
  dependencies: DiscoveryMatchCreatedDependencies
): DiscoveryMatchCreatedReporter {
  const reportedByAccount = new Map<string, readonly string[]>()
  const loadingByAccount = new Map<string, Promise<readonly string[]>>()
  const claimedByAccount = new Map<string, ReadonlySet<string>>()

  function loadReported(accountUserId: string): Promise<readonly string[]> {
    const cached = reportedByAccount.get(accountUserId)
    if (cached) return Promise.resolve(cached)
    const loading = loadingByAccount.get(accountUserId)
    if (loading) return loading
    const next = dependencies.storage
      .getItem(getDiscoveryMatchCreatedStorageKey(accountUserId))
      .then(parseStoredMatchIds, () => [] as string[])
      .then((ids) => {
        const current = reportedByAccount.get(accountUserId) ?? ids
        reportedByAccount.set(accountUserId, current)
        loadingByAccount.delete(accountUserId)
        return current
      })
    loadingByAccount.set(accountUserId, next)
    return next
  }

  function claim(accountUserId: string, matchId: string): boolean {
    const claimed = claimedByAccount.get(accountUserId) ?? new Set<string>()
    if (claimed.has(matchId)) return false
    claimedByAccount.set(accountUserId, new Set([...claimed, matchId]))
    return true
  }

  function release(accountUserId: string, matchId: string): void {
    const claimed = claimedByAccount.get(accountUserId)
    if (!claimed) return
    claimedByAccount.set(
      accountUserId,
      new Set([...claimed].filter((id) => id !== matchId))
    )
  }

  async function report(input: DiscoveryMatchCreatedInput): Promise<boolean> {
    const matchId = getServerConfirmedMatchId(input)
    if (!matchId || !dependencies.isCaptureEnabled()) return false
    const { accountUserId } = input
    // Synchronous claim: concurrent responses for one match cannot both pass.
    if (!claim(accountUserId, matchId)) return false
    try {
      const reported = await loadReported(accountUserId)
      if (reported.includes(matchId) || !dependencies.isCaptureEnabled()) return false
      const nextReported = [...reported, matchId].slice(-DISCOVERY_MATCH_CREATED_MAX_IDS)
      reportedByAccount.set(accountUserId, nextReported)
      try {
        await dependencies.storage.setItem(
          getDiscoveryMatchCreatedStorageKey(accountUserId),
          JSON.stringify({ version: STORAGE_VERSION, matchIds: nextReported })
        )
      } catch {
        // Best effort: the in-memory set still de-duplicates this app run.
      }
      dependencies.captureMatchCreated(getDiscoveryMatchCreatedProperties(input.mode))
      return true
    } catch {
      return false
    } finally {
      release(accountUserId, matchId)
    }
  }

  return { report }
}
