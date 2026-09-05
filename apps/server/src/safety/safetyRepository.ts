import type { ReportReason } from "@blumi/contracts"

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
  | { kind: "conflict" }

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
  saveReportAndBlock(
    report: ReportRecord,
    block: BlockRecord
  ): Promise<SaveReportAndBlockResult>
  listReportsForActor(actorUserId: string): Promise<ReportRecord[]>
  listAllReports(options: { status?: string; limit: number }): Promise<ReportRecord[]>
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
  ): Promise<"resolved" | "not_found" | "conflict">
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
      store.blocks.set(blockKey(block.actorUserId, block.blockedUserId), {
        ...block
      })
    },
    async deleteBlock(actorUserId, blockedUserId) {
      store.blocks.delete(blockKey(actorUserId, blockedUserId))
    },
    async saveReport(report) {
      store.reports.set(report.reportId, cloneReport(report))
    },
    async saveReportAndBlock(report, block) {
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
    async listReportsForActor(actorUserId) {
      return [...store.reports.values()]
        .filter((report) => report.actorUserId === actorUserId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
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
