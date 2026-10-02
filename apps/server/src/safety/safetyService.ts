import { randomUUID } from "node:crypto"
import { REPORT_REASONS, type ReportReason } from "@blumi/contracts"
import {
  createInMemorySafetyRepository,
  REPORT_NOTE_MAX_LENGTH,
  type BlockRecord,
  type PendingReportCursor,
  type ReportRecord,
  type SafetyRepository
} from "./safetyRepository"
import { PublicRequestError } from "../errors/publicRequestError"
import { containsControlCharacters } from "./publicTextFilter"
import {
  createRealtimeAccessRevocationChannel,
  type RealtimeAccessRevocationListener
} from "../auth/realtimeAccessRevocation"
import {
  getModerationTarget,
  moderationRiskRank,
  type PendingModerationQueueSummary,
  summarizePendingModerationWorkload
} from "./moderationQueue"

const MAX_REPORT_NOTE_LENGTH = REPORT_NOTE_MAX_LENGTH
const DEFAULT_ADMIN_REPORT_LIMIT = 50
const MAX_ADMIN_REPORT_LIMIT = 100
const DEFAULT_ACTOR_REPORT_LIMIT = 50
const MAX_ACTOR_REPORT_LIMIT = 100
const REPORT_STATUSES = ["pending", "resolved", "dismissed"] as const
/** User ids are `user_<uuid>`; anything outside this shape is never a person. */
const TARGET_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
/** Reports one person may file per rolling 24 hours (2026-10-01). */
export const MAX_REPORTS_PER_DAY = 20
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000
const REPORT_RESOLUTION_ACTIONS = ["warn", "suspend", "ban", "dismiss"] as const

export interface SafetyService {
  repository: SafetyRepository
  listBlocks(actorUserId: string): Promise<BlockRecord[]>
  blockUser(
    actorUserId: string,
    blockedUserId: string,
    now?: Date
  ): Promise<BlockRecord>
  unblockUser(actorUserId: string, blockedUserId: string): Promise<void>
  listBlockedUserIdsBetween(
    viewerUserId: string,
    candidateUserIds: readonly string[]
  ): Promise<string[]>
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
  /**
   * hasBlockBetween through a short in-process cache, for best-effort
   * realtime hints only (typing, receipts, room motion re-checks), which
   * otherwise cost a database query each. A block, unblock or report on this
   * instance drops the pair at once; another instance's block reaches it
   * within BLOCK_PAIR_CACHE_TTL_MS. Message delivery and access decisions
   * keep using hasBlockBetween.
   */
  hasBlockBetweenCached(userAId: string, userBId: string): Promise<boolean>
  reportUser(
    actorUserId: string,
    input: ReportUserInput,
    now?: Date
  ): Promise<{ report: ReportRecord; block: BlockRecord; replayed: boolean }>
  listReportsForActor(actorUserId: string, limit?: number): Promise<ReportRecord[]>
  listAllReports(options: { status?: string; limit?: number }): Promise<ReportRecord[]>
  /**
   * The actionable queue: pending reports by risk, then oldest first, in
   * pages. `nextCursor` is null on the last page.
   */
  listPendingReportQueue(options: { limit?: number; cursor?: string }): Promise<{
    reports: ReportRecord[]
    nextCursor: string | null
  }>
  getPendingReportQueueSummary(now?: Date): Promise<PendingModerationQueueSummary>
  findReport(reportId: string): Promise<ReportRecord | null>
  resolveReport(
    reportId: string,
    resolution: {
      action: string
      note?: string
      suspendedUntil?: string
      admin: Readonly<{ operatorId: string; tokenId: string }>
    },
    now?: Date
  ): Promise<ReportRecord | null>
  /** Fires after a report resolution (which may suspend or ban) has committed. */
  subscribeRealtimeAccessRevocations(listener: RealtimeAccessRevocationListener): () => void
}

export class ReportResolutionConflictError extends PublicRequestError {
  constructor() {
    super("That report has already been resolved.")
    this.name = "ReportResolutionConflictError"
  }
}

export class ReportIdempotencyConflictError extends PublicRequestError {
  constructor() {
    super("That idempotency key was already used for a different report.")
    this.name = "ReportIdempotencyConflictError"
  }
}

/**
 * A suspend/ban of a report whose account was deleted (open reports outlive
 * the account as evidence). The report stays pending; dismiss or warn it.
 */
export class ReportedAccountDeletedError extends PublicRequestError {
  constructor() {
    super("The reported account was deleted, so it cannot be suspended or banned. Dismiss or warn instead.")
    this.name = "ReportedAccountDeletedError"
  }
}

/** A per-person safety cap was reached (answered with 429). */
export class SafetyLimitError extends PublicRequestError {
  constructor(message: string) {
    super(message)
    this.name = "SafetyLimitError"
  }
}

export interface ReportUserInput {
  reportedUserId: string
  reason: string
  note?: string
  idempotencyKey?: string
}

export interface CreateSafetyServiceOptions {
  repository?: SafetyRepository
  idFactory?: () => string
  /**
   * Whether a user id belongs to an account. Blocks and reports of anyone
   * else are refused. Omitted in unit tests that use free-form ids.
   */
  isKnownUser?: (userId: string) => Promise<boolean>
  /** hasBlockBetweenCached lifetime; 0 turns the cache off. */
  blockPairCacheTtlMs?: number
  now?: () => number
}

/** How long a cached block answer is trusted (2026-10-02, RTC-01). */
export const BLOCK_PAIR_CACHE_TTL_MS = 30_000
const BLOCK_PAIR_CACHE_MAX_ENTRIES = 50_000

function createBlockPairCache(ttlMs: number, now: () => number) {
  const entries = new Map<string, { blocked: boolean; expiresAt: number }>()
  const reads = new Map<string, { epoch: number; read: Promise<boolean> }>()
  let epoch = 0
  const pairKey = (a: string, b: string) => a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
  return {
    async read(a: string, b: string, load: () => Promise<boolean>): Promise<boolean> {
      if (ttlMs <= 0) return load()
      const key = pairKey(a, b)
      const cached = entries.get(key)
      if (cached && cached.expiresAt > now()) return cached.blocked
      const shared = reads.get(key)
      if (shared && shared.epoch === epoch) return shared.read
      const readEpoch = epoch
      const read = load()
      reads.set(key, { epoch: readEpoch, read })
      try {
        const blocked = await read
        // An answer read while a block changed is used once, never stored.
        if (readEpoch === epoch) {
          entries.delete(key)
          if (entries.size >= BLOCK_PAIR_CACHE_MAX_ENTRIES) {
            const oldest = entries.keys().next().value
            if (oldest !== undefined) entries.delete(oldest)
          }
          entries.set(key, { blocked, expiresAt: now() + ttlMs })
        }
        return blocked
      } finally {
        if (reads.get(key)?.read === read) reads.delete(key)
      }
    },
    invalidate(a: string, b: string) {
      epoch += 1
      entries.delete(pairKey(a, b))
      reads.delete(pairKey(a, b))
    }
  }
}

export function createSafetyService(
  options: CreateSafetyServiceOptions = {}
): SafetyService {
  const repository = options.repository ?? createInMemorySafetyRepository()
  const idFactory = options.idFactory ?? createReportId
  const realtimeAccessRevocations = createRealtimeAccessRevocationChannel()
  const blockPairs = createBlockPairCache(options.blockPairCacheTtlMs ?? BLOCK_PAIR_CACHE_TTL_MS, options.now ?? Date.now)
  const assertKnownTarget = async (userId: string) => {
    if (options.isKnownUser && !(await options.isKnownUser(userId))) {
      throw new PublicRequestError("That person is not available.")
    }
  }

  return {
    repository,
    async listBlocks(actorUserId) {
      return repository.listBlocks(actorUserId)
    },
    async blockUser(actorUserId, blockedUserId, now = new Date()) {
      const targetUserId = normalizeTargetUserId(blockedUserId)
      assertDifferentUsers(actorUserId, targetUserId, "block")

      const existing = await repository.findBlock(actorUserId, targetUserId)
      if (existing) return existing
      // A block is never refused by a count: refusing one would leave a user
      // unable to shut out an abuser. Growth is bounded instead by the number
      // of real accounts (assertKnownTarget, one row per pair) and the
      // per-user request budget; abuse volume is capped on reports.
      await assertKnownTarget(targetUserId)

      const block: BlockRecord = {
        actorUserId,
        blockedUserId: targetUserId,
        createdAt: now.toISOString()
      }
      blockPairs.invalidate(actorUserId, targetUserId)
      try {
        await repository.saveBlock(block)
      } finally {
        blockPairs.invalidate(actorUserId, targetUserId)
      }
      return (await repository.findBlock(actorUserId, targetUserId)) ?? block
    },
    async unblockUser(actorUserId, blockedUserId) {
      const targetUserId = normalizeTargetUserId(blockedUserId)
      blockPairs.invalidate(actorUserId, targetUserId)
      try {
        await repository.deleteBlock(actorUserId, targetUserId)
      } finally {
        blockPairs.invalidate(actorUserId, targetUserId)
      }
    },
    async listBlockedUserIdsBetween(viewerUserId, candidateUserIds) {
      const normalizedCandidateUserIds = [...new Set(
        candidateUserIds
          .map((userId) => userId.trim())
          .filter((userId) => userId && userId !== viewerUserId)
      )]
      if (normalizedCandidateUserIds.length === 0) return []
      const blockedUserIds = await repository.listBlockedUserIdsBetween(
        viewerUserId,
        normalizedCandidateUserIds
      )
      const blockedSet = new Set(blockedUserIds)
      return normalizedCandidateUserIds.filter((userId) => blockedSet.has(userId))
    },
    async hasBlockBetween(userAId, userBId) {
      // Both directions in one indexed query (was two findBlock round trips;
      // this check runs on every chat send, delivery and private push).
      return (await repository.listBlockedUserIdsBetween(userAId, [userBId])).length > 0
    },
    async hasBlockBetweenCached(userAId, userBId) {
      return blockPairs.read(userAId, userBId, () => this.hasBlockBetween(userAId, userBId))
    },
    async reportUser(actorUserId, input, now = new Date()) {
      const reportedUserId = normalizeTargetUserId(input.reportedUserId)
      assertDifferentUsers(actorUserId, reportedUserId, "report")

      const reason = normalizeReportReason(input.reason)
      const note = normalizeReportNote(input.note)
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
      await assertKnownTarget(reportedUserId)
      const report: ReportRecord = {
        reportId: idFactory(),
        actorUserId,
        reportedUserId,
        reason,
        ...(note ? { note } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        createdAt: now.toISOString(),
        status: "pending"
      }
      const block: BlockRecord = {
        actorUserId,
        blockedUserId: reportedUserId,
        createdAt: now.toISOString()
      }
      blockPairs.invalidate(actorUserId, reportedUserId)
      let saved: Awaited<ReturnType<SafetyRepository["saveReportAndBlock"]>>
      try {
        saved = await repository.saveReportAndBlock(report, block, {
          windowStartedAt: new Date(now.getTime() - REPORT_WINDOW_MS).toISOString(),
          maxReportsInWindow: MAX_REPORTS_PER_DAY
        })
      } finally {
        blockPairs.invalidate(actorUserId, reportedUserId)
      }
      if (saved.kind === "conflict") {
        throw new ReportIdempotencyConflictError()
      }
      if (saved.kind === "limited") {
        throw new SafetyLimitError("You have sent many reports today. Our team is reviewing them; try again tomorrow.")
      }
      return {
        report: saved.report,
        block: saved.block,
        // An escalation accepted the new reason, so it is not a replay.
        replayed: saved.kind === "replayed"
      }
    },
    async listReportsForActor(actorUserId, limit = DEFAULT_ACTOR_REPORT_LIMIT) {
      return repository.listReportsForActor(
        actorUserId,
        normalizeActorReportLimit(limit)
      )
    },
    async listAllReports(options) {
      return repository.listAllReports({
        status: normalizeReportStatus(options.status),
        limit: normalizeAdminReportLimit(options.limit)
      })
    },
    async listPendingReportQueue(options) {
      const limit = normalizeAdminReportLimit(options.limit)
      const after = options.cursor === undefined ? undefined : decodePendingReportCursor(options.cursor)
      const page = await repository.listPendingReportsByRisk({ limit: limit + 1, after })
      const reports = page.slice(0, limit)
      const last = reports[reports.length - 1]
      return {
        reports,
        nextCursor: page.length > limit && last ? encodePendingReportCursor(last) : null
      }
    },
    async getPendingReportQueueSummary(now = new Date()) {
      const breachedBeforeByReason = REPORT_REASONS.reduce<Record<ReportReason, string>>(
        (thresholds, reason) => ({
          ...thresholds,
          [reason]: new Date(
            now.getTime() - getModerationTarget(reason).targetMinutes * 60_000
          ).toISOString()
        }),
        {} as Record<ReportReason, string>
      )
      const workload = await repository.summarizePendingReports({
        breachedBeforeByReason
      })
      return summarizePendingModerationWorkload(workload, now)
    },
    async findReport(reportId) {
      return repository.findReport(normalizeReportId(reportId))
    },
    async resolveReport(reportId, resolution, now = new Date()) {
      const normalizedReportId = normalizeReportId(reportId)
      const action = normalizeResolutionAction(resolution.action)
      const note = normalizeResolutionNote(resolution.note)
      const admin = normalizeAdminIdentity(resolution.admin)
      const suspendedUntil = normalizeSuspendedUntil(
        action,
        resolution.suspendedUntil,
        now
      )
      if ((action === "suspend" || action === "ban") && options.isKnownUser) {
        const pending = await repository.findReport(normalizedReportId)
        if (pending?.status === "pending" && !(await options.isKnownUser(pending.reportedUserId))) {
          throw new ReportedAccountDeletedError()
        }
      }
      const result = await repository.resolveReport(normalizedReportId, {
        action,
        ...(note ? { note } : {}),
        ...(suspendedUntil ? { suspendedUntil } : {}),
        resolvedAt: now.toISOString(),
        resolvedByAdminId: admin.operatorId,
        resolvedByTokenId: admin.tokenId
      })
      if (result === "not_found") return null
      if (result === "conflict") throw new ReportResolutionConflictError()
      if (result === "reported_account_missing") throw new ReportedAccountDeletedError()
      let report: ReportRecord | null = null
      try {
        report = await repository.findReport(normalizedReportId)
        return report
      } finally {
        // The moderation write has committed; drop cached realtime access for
        // the reported user (or for everyone if the report cannot be read).
        realtimeAccessRevocations.publish(
          report ? { kind: "user", userId: report.reportedUserId } : { kind: "all" }
        )
      }
    },
    subscribeRealtimeAccessRevocations(listener) {
      return realtimeAccessRevocations.subscribeRealtimeAccessRevocations(listener)
    }
  }
}

function normalizeAdminIdentity(
  admin: Readonly<{ operatorId: string; tokenId: string }> | undefined
): { operatorId: string; tokenId: string } {
  const operatorId = admin?.operatorId.trim() ?? ""
  const tokenId = admin?.tokenId.trim() ?? ""
  if (!operatorId || !tokenId) {
    throw new PublicRequestError("Admin identity is required for moderation.")
  }
  return { operatorId, tokenId }
}

function normalizeTargetUserId(userId: string): string {
  const trimmed = userId.trim()
  if (!TARGET_USER_ID_PATTERN.test(trimmed)) {
    throw new PublicRequestError("Choose a person first.")
  }
  return trimmed
}

function encodePendingReportCursor(report: ReportRecord): string {
  return Buffer.from(JSON.stringify([
    moderationRiskRank(report.reason), report.createdAt, report.reportId
  ])).toString("base64url")
}

function decodePendingReportCursor(cursor: string): PendingReportCursor {
  const invalid = () => new PublicRequestError("Use a valid report cursor.")
  if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  } catch {
    throw invalid()
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw invalid()
  const [riskRank, createdAt, reportId] = parsed as unknown[]
  if (
    typeof riskRank !== "number" || !Number.isSafeInteger(riskRank) || riskRank < 0 || riskRank > 9 ||
    typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
    typeof reportId !== "string" || !reportId || reportId.length > 200
  ) {
    throw invalid()
  }
  return { riskRank, createdAt: new Date(createdAt).toISOString(), reportId }
}

function assertDifferentUsers(
  actorUserId: string,
  targetUserId: string,
  action: "block" | "report"
): void {
  if (actorUserId === targetUserId) {
    throw new PublicRequestError(`You cannot ${action} yourself.`)
  }
}

function normalizeReportReason(reason: string): ReportReason {
  if (REPORT_REASONS.includes(reason as ReportReason)) {
    return reason as ReportReason
  }
  throw new PublicRequestError("Choose a valid report reason.")
}

function normalizeReportNote(note: string | undefined): string | undefined {
  if (typeof note !== "string") return undefined
  const trimmed = note.trim().replace(/\s+/g, " ")
  if (!trimmed) return undefined
  if (trimmed.length > MAX_REPORT_NOTE_LENGTH) {
    throw new PublicRequestError("Keep report details under 1000 characters.")
  }
  if (containsControlCharacters(trimmed)) {
    throw new PublicRequestError("Remove unsupported characters from the report details.")
  }
  return trimmed
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const key = value.trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    throw new PublicRequestError("Use a valid idempotency key.")
  }
  return key
}

function normalizeReportStatus(
  status: string | undefined
): ReportRecord["status"] | undefined {
  if (status === undefined || status === "") return undefined
  if (REPORT_STATUSES.includes(status as ReportRecord["status"])) {
    return status as ReportRecord["status"]
  }
  throw new PublicRequestError("Choose a valid report status.")
}

function normalizeAdminReportLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_ADMIN_REPORT_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_ADMIN_REPORT_LIMIT)
}

function normalizeActorReportLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_ACTOR_REPORT_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_ACTOR_REPORT_LIMIT)
}

function normalizeReportId(reportId: string): string {
  const trimmed = reportId.trim()
  if (!trimmed) throw new PublicRequestError("Choose a report first.")
  return trimmed
}

function normalizeResolutionAction(action: string): string {
  if (
    REPORT_RESOLUTION_ACTIONS.includes(
      action as typeof REPORT_RESOLUTION_ACTIONS[number]
    )
  ) {
    return action
  }
  throw new PublicRequestError("Choose a valid moderation action.")
}

function normalizeResolutionNote(note: string | undefined): string | undefined {
  if (typeof note !== "string") return undefined
  const trimmed = note.trim().replace(/\s+/g, " ")
  if (!trimmed) return undefined
  if (trimmed.length > MAX_REPORT_NOTE_LENGTH) {
    throw new PublicRequestError("Keep moderation notes under 1000 characters.")
  }
  if (containsControlCharacters(trimmed)) {
    throw new PublicRequestError("Remove unsupported characters from the moderation note.")
  }
  return trimmed
}

function normalizeSuspendedUntil(
  action: string,
  value: string | undefined,
  now: Date
): string | undefined {
  if (action !== "suspend") {
    if (value !== undefined) {
      throw new PublicRequestError("Only suspensions can set an end time.")
    }
    return undefined
  }
  if (value === undefined) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || parsed <= now.getTime()) {
    throw new PublicRequestError("Suspension end time must be in the future.")
  }
  if (parsed > now.getTime() + 30 * 24 * 60 * 60 * 1000) {
    throw new PublicRequestError("Suspensions can last up to 30 days.")
  }
  return new Date(parsed).toISOString()
}

function createReportId(): string {
  return `report_${randomUUID()}`
}
