import type { ReportReason } from "@blumi/contracts"
import { moderationRiskRank } from "./moderationQueue"

export interface BlockRecord {
  actorUserId: string
  blockedUserId: string
  createdAt: string
  blockedProfile?: {
    userId: string
    displayName: string
    avatarPresetId?: string
  }
}

export interface ReportRecord {
  reportId: string
  actorUserId: string
  reportedUserId: string
  reason: ReportReason
  note?: string
  idempotencyKey?: string
  createdAt: string
  status: "pending" | "resolved" | "dismissed"
  resolution?: {
    action: string
    adminNote?: string
    resolvedAt: string
    resolvedByAdminId?: string
    resolvedByTokenId?: string
    suspendedUntil?: string
  }
}

export interface PendingReportReasonSummary {
  reason: ReportReason
  pendingCount: number
  breachedCount: number
  oldestPendingCreatedAt: string
}

export interface PendingReportSummaryQuery {
  breachedBeforeByReason: Readonly<Record<ReportReason, string>>
}

export type SaveReportAndBlockResult =
  | { kind: "created"; report: ReportRecord; block: BlockRecord }
  | { kind: "replayed"; report: ReportRecord; block: BlockRecord }
  /** A more urgent reason was merged into the actor's pending report. */
  | { kind: "escalated"; report: ReportRecord; block: BlockRecord }
  | { kind: "conflict" }
  | { kind: "limited" }

/** The longest report note the service accepts; a merged note keeps to it. */
export const REPORT_NOTE_MAX_LENGTH = 1000
/**
 * How long after a report was resolved a retry of the request that escalated
 * it is still recognised as that request (mobile retries within seconds).
 */
export const ESCALATION_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000
/**
 * Characters of a request note that must appear in the stored note for the
 * stored row to answer that request. A merged note may truncate a long note,
 * but always keeps far more than this of each part.
 */
const NOTE_MATCH_PREFIX_LENGTH = 200
const PREVIOUS_REASON_PREFIX = "[Önceki sebep / previous reason: "
const PREVIOUS_REASON_PATTERN = /^\[Önceki sebep \/ previous reason: ([a-z_]+)\] ?/

/**
 * The change a repeat report makes to the actor's pending report on the same
 * person, or null when it collapses into it unchanged. A more urgent reason
 * (lower moderation risk rank) replaces the pending reason so the report
 * moves to the faster queue. The note keeps the replaced reason visible to
 * moderators as a "[Önceki sebep / previous reason: …]" prefix, then the
 * pending note, then the new note, bounded to REPORT_NOTE_MAX_LENGTH. An
 * exact, equally urgent or less urgent repeat changes nothing. The schema has
 * no escalation trail yet (docs/quality/SAFETY_REPORT_ESCALATION_TRAIL_DESIGN_2026-10-01.md).
 */
export function pendingReportEscalation(
  pending: Pick<ReportRecord, "reason" | "note">,
  incoming: Pick<ReportRecord, "reason" | "note">
): { reason: ReportReason; note: string } | null {
  if (moderationRiskRank(incoming.reason) >= moderationRiskRank(pending.reason)) return null
  const marker = `${PREVIOUS_REASON_PREFIX}${pending.reason}]`
  const previous = pending.note ?? ""
  const added = incoming.note && !previous.includes(incoming.note) ? incoming.note : ""
  const separator = previous && added ? " / " : ""
  const budget = REPORT_NOTE_MAX_LENGTH - marker.length - 1 - separator.length
  let previousLength = previous.length
  let addedLength = added.length
  if (previousLength + addedLength > budget) {
    const half = Math.floor(budget / 2)
    if (previousLength <= half) addedLength = budget - previousLength
    else if (addedLength <= half) previousLength = budget - addedLength
    else {
      previousLength = half
      addedLength = budget - half
    }
  }
  const body = `${truncateNote(previous, previousLength)}${separator}${truncateNote(added, addedLength)}`
  return { reason: incoming.reason, note: body ? `${marker} ${body}` : marker }
}

/**
 * The reasons a report has carried, newest first: its current reason, then
 * each reason an escalation replaced. The last one is the original reason.
 */
function reportReasonTrail(report: Pick<ReportRecord, "reason" | "note">): ReportReason[] {
  const trail: ReportReason[] = [report.reason]
  let rest = report.note ?? ""
  for (let match = PREVIOUS_REASON_PATTERN.exec(rest); match; match = PREVIOUS_REASON_PATTERN.exec(rest)) {
    trail.push(match[1] as ReportReason)
    rest = rest.slice(match[0].length)
  }
  return trail
}

function noteHolds(stored: string | undefined, note: string | undefined): boolean {
  if (!note) return true
  return (stored ?? "").includes(note.slice(0, NOTE_MATCH_PREFIX_LENGTH))
}

/**
 * Whether the stored report found by a request's idempotency key still
 * answers that request. An escalation may have made its reason more urgent
 * and merged notes into it, so the request's reason must be the report's
 * original reason and its note must still be held in the merged note.
 */
export function storedReportAnswersKeyedRequest(
  stored: Pick<ReportRecord, "reportedUserId" | "reason" | "note">,
  request: Pick<ReportRecord, "reportedUserId" | "reason" | "note">
): boolean {
  if (stored.reportedUserId !== request.reportedUserId) return false
  if (moderationRiskRank(stored.reason) > moderationRiskRank(request.reason)) return false
  const trail = reportReasonTrail(stored)
  if (trail[trail.length - 1] !== request.reason) return false
  return trail.length === 1 ? (stored.note ?? undefined) === (request.note ?? undefined) : noteHolds(stored.note, request.note)
}

/**
 * Whether a keyed request whose key is not stored is a retry of the request
 * that escalated this report: the schema keeps only the first request's key,
 * so the escalating request is recognised by its target, by its reason being
 * one the report was escalated to and by its note held in the merged note.
 * A report resolved longer than ESCALATION_REPLAY_WINDOW_MS before the
 * request is not matched, so a later report is filed as new.
 */
export function isEscalatingRequestRetry(
  stored: ReportRecord,
  request: Pick<ReportRecord, "actorUserId" | "reportedUserId" | "reason" | "note" | "idempotencyKey" | "createdAt">
): boolean {
  if (!request.idempotencyKey || stored.idempotencyKey === request.idempotencyKey) return false
  if (stored.actorUserId !== request.actorUserId || stored.reportedUserId !== request.reportedUserId) return false
  if (stored.status !== "pending") {
    const resolvedAt = Date.parse(stored.resolution?.resolvedAt ?? "")
    if (!Number.isFinite(resolvedAt) || Date.parse(request.createdAt) - resolvedAt > ESCALATION_REPLAY_WINDOW_MS) return false
  }
  const trail = reportReasonTrail(stored)
  // Every reason but the original one was set by an escalating request.
  if (!trail.slice(0, -1).includes(request.reason)) return false
  return noteHolds(stored.note, request.note)
}

function truncateNote(note: string, length: number): string {
  if (note.length <= length) return note
  return length <= 0 ? "" : `${note.slice(0, length - 1)}…`
}

/** Caps how many reports one actor may create within a window. */
export interface ReportCreationPolicy {
  windowStartedAt: string
  maxReportsInWindow: number
}

/** Keyset position in the pending queue: (risk rank, created at, report id). */
export interface PendingReportCursor {
  riskRank: number
  createdAt: string
  reportId: string
}

export interface SafetyRepository {
  listBlocks(actorUserId: string): Promise<BlockRecord[]>
  listBlockedUserIdsBetween(
    viewerUserId: string,
    candidateUserIds: readonly string[]
  ): Promise<string[]>
  findBlock(actorUserId: string, blockedUserId: string): Promise<BlockRecord | null>
  saveBlock(block: BlockRecord): Promise<void>
  deleteBlock(actorUserId: string, blockedUserId: string): Promise<void>
  saveReport(report: ReportRecord): Promise<void>
  /**
   * Creates a report and its block, or answers with the actor's existing
   * report: the same idempotency key replays it (a changed payload is a
   * conflict) and a pending report on the same person is returned instead
   * of a duplicate. With a policy, a new report beyond the actor's cap in the
   * window is refused ("limited") and records nothing.
   */
  saveReportAndBlock(
    report: ReportRecord,
    block: BlockRecord,
    policy?: ReportCreationPolicy
  ): Promise<SaveReportAndBlockResult>
  listReportsForActor(actorUserId: string, limit?: number): Promise<ReportRecord[]>
  listAllReports(options: { status?: string; limit: number }): Promise<ReportRecord[]>
  /** Pending reports by risk, then oldest first, after the cursor. */
  listPendingReportsByRisk(options: { limit: number; after?: PendingReportCursor }): Promise<ReportRecord[]>
  summarizePendingReports(
    query: PendingReportSummaryQuery
  ): Promise<PendingReportReasonSummary[]>
  findReport(reportId: string): Promise<ReportRecord | null>
  resolveReport(
    reportId: string,
    resolution: {
      action: string
      note?: string
      resolvedAt: string
      resolvedByAdminId: string
      resolvedByTokenId: string
      suspendedUntil?: string
    }
  ): Promise<"resolved" | "not_found" | "conflict" | "reported_account_missing">
  // "reported_account_missing": a suspend/ban of a report whose account was
  // deleted (PostgreSQL, where accounts live in the same database). The
  // report stays pending. The in-memory store has no accounts; the service
  // checks `isKnownUser` first.
}

export interface InMemorySafetyStore {
  blocks: Map<string, BlockRecord>
  reports: Map<string, ReportRecord>
}

export function createInMemorySafetyStore(): InMemorySafetyStore {
  return {
    blocks: new Map(),
    reports: new Map()
  }
}

export function createInMemorySafetyRepository(
  store: InMemorySafetyStore = createInMemorySafetyStore()
): SafetyRepository {
  return {
    async listBlocks(actorUserId) {
      return [...store.blocks.values()]
        .filter((block) => block.actorUserId === actorUserId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((block) => ({ ...block }))
    },
    async listBlockedUserIdsBetween(viewerUserId, candidateUserIds) {
      const candidates = new Set(candidateUserIds)
      const blocked = new Set<string>()
      for (const record of store.blocks.values()) {
        if (
          record.actorUserId === viewerUserId &&
          candidates.has(record.blockedUserId)
        ) {
          blocked.add(record.blockedUserId)
        }
        if (
          record.blockedUserId === viewerUserId &&
          candidates.has(record.actorUserId)
        ) {
          blocked.add(record.actorUserId)
        }
      }
      return [...blocked]
    },
    async findBlock(actorUserId, blockedUserId) {
      const block = store.blocks.get(blockKey(actorUserId, blockedUserId))
      return block ? { ...block } : null
    },
    async saveBlock(block) {
      // Mirrors PostgreSQL ON CONFLICT DO NOTHING: the first block wins.
      const key = blockKey(block.actorUserId, block.blockedUserId)
      if (!store.blocks.has(key)) store.blocks.set(key, { ...block })
    },
    async deleteBlock(actorUserId, blockedUserId) {
      store.blocks.delete(blockKey(actorUserId, blockedUserId))
    },
    async saveReport(report) {
      // Mirrors the PostgreSQL primary key: a report is never overwritten.
      if (store.reports.has(report.reportId)) {
        throw new Error("Safety report already exists.")
      }
      store.reports.set(report.reportId, cloneReport(report))
    },
    async saveReportAndBlock(report, block, policy) {
      if (report.idempotencyKey) {
        const existing = [...store.reports.values()].find(
          (candidate) =>
            candidate.actorUserId === report.actorUserId &&
            candidate.idempotencyKey === report.idempotencyKey
        )
        if (existing) {
          if (!storedReportAnswersKeyedRequest(existing, report)) return { kind: "conflict" }
          const existingBlock = store.blocks.get(
            blockKey(existing.actorUserId, existing.reportedUserId)
          )
          const replayBlock = existingBlock ?? {
            actorUserId: existing.actorUserId,
            blockedUserId: existing.reportedUserId,
            createdAt: existing.createdAt
          }
          if (!existingBlock) {
            store.blocks.set(
              blockKey(replayBlock.actorUserId, replayBlock.blockedUserId),
              { ...replayBlock }
            )
          }
          return {
            kind: "replayed",
            report: cloneReport(existing),
            block: { ...replayBlock }
          }
        }
      }
      if (report.idempotencyKey) {
        const escalated = [...store.reports.values()]
          .filter((candidate) => candidate.actorUserId === report.actorUserId && candidate.reportedUserId === report.reportedUserId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .find((candidate) => isEscalatingRequestRetry(candidate, report))
        if (escalated) {
          const key = blockKey(escalated.actorUserId, escalated.reportedUserId)
          if (!store.blocks.has(key)) {
            store.blocks.set(key, { actorUserId: escalated.actorUserId, blockedUserId: escalated.reportedUserId, createdAt: block.createdAt })
          }
          return { kind: "escalated", report: cloneReport(escalated), block: { ...store.blocks.get(key)! } }
        }
      }
      const pending = [...store.reports.values()]
        .filter((candidate) =>
          candidate.actorUserId === report.actorUserId &&
          candidate.reportedUserId === report.reportedUserId &&
          candidate.status === "pending")
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]
      if (pending) {
        const key = blockKey(pending.actorUserId, pending.reportedUserId)
        if (!store.blocks.has(key)) {
          store.blocks.set(key, { actorUserId: pending.actorUserId, blockedUserId: pending.reportedUserId, createdAt: block.createdAt })
        }
        const escalation = pendingReportEscalation(pending, report)
        if (!escalation) return { kind: "replayed", report: cloneReport(pending), block: { ...store.blocks.get(key)! } }
        const { note: _previousNote, ...rest } = pending
        const escalated: ReportRecord = { ...rest, ...escalation }
        store.reports.set(pending.reportId, cloneReport(escalated))
        return { kind: "escalated", report: cloneReport(escalated), block: { ...store.blocks.get(key)! } }
      }
      if (policy) {
        const since = Date.parse(policy.windowStartedAt)
        const recent = [...store.reports.values()].filter((candidate) =>
          candidate.actorUserId === report.actorUserId && Date.parse(candidate.createdAt) >= since).length
        if (recent >= policy.maxReportsInWindow) return { kind: "limited" }
      }
      store.reports.set(report.reportId, cloneReport(report))
      const existingBlock = store.blocks.get(
        blockKey(block.actorUserId, block.blockedUserId)
      )
      if (!existingBlock) {
        store.blocks.set(blockKey(block.actorUserId, block.blockedUserId), { ...block })
      }
      return {
        kind: "created",
        report: cloneReport(report),
        block: { ...(existingBlock ?? block) }
      }
    },
    async listReportsForActor(actorUserId, limit = 50) {
      return [...store.reports.values()]
        .filter((report) => report.actorUserId === actorUserId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit)
        .map(cloneReport)
    },
    async listAllReports(options) {
      return [...store.reports.values()]
        .filter((report) =>
          options.status ? report.status === options.status : true
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, options.limit)
        .map(cloneReport)
    },
    async listPendingReportsByRisk(options) {
      const position = (report: ReportRecord) =>
        [moderationRiskRank(report.reason), Date.parse(report.createdAt), report.reportId] as const
      const compare = (left: readonly [number, number, string], right: readonly [number, number, string]) =>
        left[0] - right[0] || left[1] - right[1] || (left[2] < right[2] ? -1 : left[2] > right[2] ? 1 : 0)
      const after = options.after
        ? [options.after.riskRank, Date.parse(options.after.createdAt), options.after.reportId] as const
        : undefined
      return [...store.reports.values()]
        .filter((report) => report.status === "pending")
        .filter((report) => !after || compare(position(report), after) > 0)
        .sort((left, right) => compare(position(left), position(right)))
        .slice(0, options.limit)
        .map(cloneReport)
    },
    async summarizePendingReports(query) {
      const summaries = new Map<ReportReason, PendingReportReasonSummary>()
      for (const report of store.reports.values()) {
        if (report.status !== "pending") continue
        const current = summaries.get(report.reason)
        const breached = Date.parse(report.createdAt) <
          Date.parse(query.breachedBeforeByReason[report.reason])
        summaries.set(report.reason, {
          reason: report.reason,
          pendingCount: (current?.pendingCount ?? 0) + 1,
          breachedCount: (current?.breachedCount ?? 0) + (breached ? 1 : 0),
          oldestPendingCreatedAt: !current ||
            Date.parse(report.createdAt) < Date.parse(current.oldestPendingCreatedAt)
            ? report.createdAt
            : current.oldestPendingCreatedAt
        })
      }
      return [...summaries.values()]
    },
    async findReport(reportId) {
      const report = store.reports.get(reportId)
      return report ? cloneReport(report) : null
    },
    async resolveReport(reportId, resolution) {
      const report = store.reports.get(reportId)
      if (!report) return "not_found"
      if (report.status !== "pending") return "conflict"
      const status = resolution.action === "dismiss" ? "dismissed" : "resolved"
      store.reports.set(reportId, {
        ...cloneReport(report),
        status,
        resolution: {
          action: resolution.action,
          ...(resolution.note ? { adminNote: resolution.note } : {}),
          resolvedAt: resolution.resolvedAt,
          ...(resolution.resolvedByAdminId
            ? { resolvedByAdminId: resolution.resolvedByAdminId }
            : {}),
          ...(resolution.resolvedByTokenId
            ? { resolvedByTokenId: resolution.resolvedByTokenId }
            : {}),
          ...(resolution.suspendedUntil
            ? { suspendedUntil: resolution.suspendedUntil }
            : {})
        }
      })
      return "resolved"
    }
  }
}

function blockKey(actorUserId: string, blockedUserId: string): string {
  return `${actorUserId}:${blockedUserId}`
}

function cloneReport(report: ReportRecord): ReportRecord {
  return {
    ...report,
    resolution: report.resolution ? { ...report.resolution } : undefined
  }
}
