import { randomUUID } from "node:crypto"
import { REPORT_REASONS, type ReportReason } from "@blumi/contracts"
import {
  createInMemorySafetyRepository,
  type BlockRecord,
  type ReportRecord,
  type SafetyRepository
} from "./safetyRepository"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  getModerationTarget,
  type PendingModerationQueueSummary,
  summarizePendingModerationWorkload
} from "./moderationQueue"

const MAX_REPORT_NOTE_LENGTH = 1000
const DEFAULT_ADMIN_REPORT_LIMIT = 50
const MAX_ADMIN_REPORT_LIMIT = 100
const REPORT_STATUSES = ["pending", "resolved", "dismissed"] as const
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
  reportUser(
    actorUserId: string,
    input: ReportUserInput,
    now?: Date
  ): Promise<{ report: ReportRecord; block: BlockRecord; replayed: boolean }>
  listReportsForActor(actorUserId: string): Promise<ReportRecord[]>
  listAllReports(options: { status?: string; limit?: number }): Promise<ReportRecord[]>
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

export interface ReportUserInput {
  reportedUserId: string
  reason: string
  note?: string
  idempotencyKey?: string
}

export interface CreateSafetyServiceOptions {
  repository?: SafetyRepository
  idFactory?: () => string
}

export function createSafetyService(
  options: CreateSafetyServiceOptions = {}
): SafetyService {
  const repository = options.repository ?? createInMemorySafetyRepository()
  const idFactory = options.idFactory ?? createReportId

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

      const block: BlockRecord = {
        actorUserId,
        blockedUserId: targetUserId,
        createdAt: now.toISOString()
      }
      await repository.saveBlock(block)
      return (await repository.findBlock(actorUserId, targetUserId)) ?? block
    },
    async unblockUser(actorUserId, blockedUserId) {
      const targetUserId = normalizeTargetUserId(blockedUserId)
      await repository.deleteBlock(actorUserId, targetUserId)
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
      const [first, second] = await Promise.all([
        repository.findBlock(userAId, userBId),
        repository.findBlock(userBId, userAId)
      ])
      return Boolean(first || second)
    },
    async reportUser(actorUserId, input, now = new Date()) {
      const reportedUserId = normalizeTargetUserId(input.reportedUserId)
      assertDifferentUsers(actorUserId, reportedUserId, "report")

      const reason = normalizeReportReason(input.reason)
      const note = normalizeReportNote(input.note)
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
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
      const saved = await repository.saveReportAndBlock(report, block)
      if (saved.kind === "conflict") {
        throw new ReportIdempotencyConflictError()
      }
      return {
        report: saved.report,
        block: saved.block,
        replayed: saved.kind === "replayed"
      }
    },
    async listReportsForActor(actorUserId) {
      return repository.listReportsForActor(actorUserId)
    },
    async listAllReports(options) {
      return repository.listAllReports({
        status: normalizeReportStatus(options.status),
        limit: normalizeAdminReportLimit(options.limit)
      })
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
      return repository.findReport(normalizedReportId)
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
  if (!trimmed) {
    throw new PublicRequestError("Choose a person first.")
  }
  return trimmed
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
