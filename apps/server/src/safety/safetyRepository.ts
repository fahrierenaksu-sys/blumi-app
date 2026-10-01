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

/**
 * The change a repeat report makes to the actor's pending report on the same
 * person, or null when it collapses into it unchanged. A more urgent reason
 * (lower moderation risk rank) replaces the pending reason so the report
 * moves to the faster queue, and the new note is appended; an exact, equally
 * urgent or less urgent repeat changes nothing. At most two escalations can
 * happen (standard -> high -> urgent), so the merged note stays bounded.
 */
export function pendingReportEscalation(
  pending: Pick<ReportRecord, "reason" | "note">,
  incoming: Pick<ReportRecord, "reason" | "note">
): { reason: ReportReason; note?: string } | null {
  if (moderationRiskRank(incoming.reason) >= moderationRiskRank(pending.reason)) return null
  const notes = [...new Set([pending.note, incoming.note].filter((note): note is string => Boolean(note)))]
  return { reason: incoming.reason, ...(notes.length > 0 ? { note: notes.join(" / ") } : {}) }
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
          if (!sameReportPayload(existing, report)) return { kind: "conflict" }
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

function sameReportPayload(left: ReportRecord, right: ReportRecord): boolean {
  return (
    left.reportedUserId === right.reportedUserId &&
    left.reason === right.reason &&
    (left.note ?? undefined) === (right.note ?? undefined)
  )
}
