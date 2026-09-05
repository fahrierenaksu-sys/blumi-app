import type {
  PendingReportReasonSummary,
  ReportRecord
} from "./safetyRepository"

export interface ModerationQueueMetadata {
  priority: "urgent" | "high" | "standard"
  targetMinutes: number
  dueAt: string
  breached: boolean
}

export interface PendingModerationQueueSummary {
  countsByPriority: Readonly<{
    urgent: number
    high: number
    standard: number
  }>
  breachedCount: number
  oldestPendingCreatedAt: string | null
  generatedAt: string
}

export function getModerationQueueMetadata(
  report: Pick<ReportRecord, "reason" | "createdAt" | "status">,
  now = new Date()
): ModerationQueueMetadata {
  const { priority, targetMinutes } = getModerationTarget(report.reason)
  const dueAt = new Date(Date.parse(report.createdAt) + targetMinutes * 60_000)
  return {
    priority,
    targetMinutes,
    dueAt: dueAt.toISOString(),
    breached: report.status === "pending" && dueAt.getTime() < now.getTime()
  }
}

/**
 * Orders the actionable queue by risk, then by the earliest SLA deadline.
 *
 * Repository order is deliberately kept as chronological audit order. The
 * moderation endpoint applies this ordering only to pending work so a new
 * low-risk report cannot bury an older urgent report.
 */
export function orderPendingModerationReports<
  T extends Pick<ReportRecord, "reason" | "createdAt" | "status">
>(reports: readonly T[], now = new Date()): T[] {
  return [...reports].sort((left, right) => {
    const leftQueue = getModerationQueueMetadata(left, now)
    const rightQueue = getModerationQueueMetadata(right, now)
    const priorityDifference = priorityRank(leftQueue.priority) - priorityRank(rightQueue.priority)
    if (priorityDifference !== 0) return priorityDifference

    const dueDifference = Date.parse(leftQueue.dueAt) - Date.parse(rightQueue.dueAt)
    if (dueDifference !== 0) return dueDifference

    return Date.parse(left.createdAt) - Date.parse(right.createdAt)
  })
}

/**
 * Produces an aggregate-only operational snapshot. Callers should pass only
 * pending reports; the status guard keeps this safe for mixed inputs in tests
 * and future callers.
 */
export function summarizePendingModerationQueue(
  reports: readonly Pick<ReportRecord, "reason" | "createdAt" | "status">[],
  now = new Date()
): PendingModerationQueueSummary {
  const initial: PendingModerationQueueSummary = {
    countsByPriority: { urgent: 0, high: 0, standard: 0 },
    breachedCount: 0,
    oldestPendingCreatedAt: null,
    generatedAt: now.toISOString()
  }

  return reports.reduce<PendingModerationQueueSummary>((summary, report) => {
    if (report.status !== "pending") return summary

    const queue = getModerationQueueMetadata(report, now)
    const oldestPendingCreatedAt = summary.oldestPendingCreatedAt === null ||
      Date.parse(report.createdAt) < Date.parse(summary.oldestPendingCreatedAt)
      ? report.createdAt
      : summary.oldestPendingCreatedAt
    return {
      ...summary,
      countsByPriority: {
        ...summary.countsByPriority,
        [queue.priority]: summary.countsByPriority[queue.priority] + 1
      },
      breachedCount: summary.breachedCount + (queue.breached ? 1 : 0),
      oldestPendingCreatedAt
    }
  }, initial)
}

export function summarizePendingModerationWorkload(
  workload: readonly PendingReportReasonSummary[],
  now = new Date()
): PendingModerationQueueSummary {
  const initial: PendingModerationQueueSummary = {
    countsByPriority: { urgent: 0, high: 0, standard: 0 },
    breachedCount: 0,
    oldestPendingCreatedAt: null,
    generatedAt: now.toISOString()
  }

  return workload.reduce<PendingModerationQueueSummary>((summary, bucket) => {
    const target = getModerationTarget(bucket.reason)
    const oldestPendingCreatedAt = summary.oldestPendingCreatedAt === null ||
      Date.parse(bucket.oldestPendingCreatedAt) < Date.parse(summary.oldestPendingCreatedAt)
      ? bucket.oldestPendingCreatedAt
      : summary.oldestPendingCreatedAt
    return {
      ...summary,
      countsByPriority: {
        ...summary.countsByPriority,
        [target.priority]: summary.countsByPriority[target.priority] + bucket.pendingCount
      },
      breachedCount: summary.breachedCount + bucket.breachedCount,
      oldestPendingCreatedAt
    }
  }, initial)
}

export function getModerationTarget(reason: ReportRecord["reason"]): {
  priority: ModerationQueueMetadata["priority"]
  targetMinutes: number
} {
  if (reason === "underage") return { priority: "urgent", targetMinutes: 4 * 60 }
  if (reason === "harassment" || reason === "inappropriate") {
    return { priority: "high", targetMinutes: 12 * 60 }
  }
  return { priority: "standard", targetMinutes: 24 * 60 }
}

function priorityRank(priority: ModerationQueueMetadata["priority"]): number {
  if (priority === "urgent") return 0
  if (priority === "high") return 1
  return 2
}
