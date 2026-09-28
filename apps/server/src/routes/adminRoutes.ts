import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { timingSafeEqual } from "node:crypto"
import type {
  AdminPrincipal,
  AdminScope,
  AdminTokenService
} from "../admin/adminTokenService"
import type { ReportRecord } from "../safety/safetyRepository"
import type { SafetyService } from "../safety/safetyService"
import { ReportResolutionConflictError } from "../safety/safetyService"
import { isPublicRequestError } from "../errors/publicRequestError"
import { isRecord, readLimit, readParam } from "./routeHelpers"
import type { AccountRecoveryService, AccountRecoveryStatus } from "../account/accountRecoveryService"
import type { AdminUsersService } from "../admin/adminUsersService"
import { parseAnalyticsPeriod, type AdminAnalyticsService } from "../admin/adminAnalyticsService"
import type { ConnectionManager } from "../realtime/connectionManager"
import {
  AdminQuotaExtensionLimitError,
  AdminQuotaLimitError,
  AdminUserNotFoundError,
  AdminUsersInputError
} from "../admin/adminUsersService"
import { registerAdminConsoleRoutes } from "../admin/adminConsole"
import {
  getModerationQueueMetadata,
  orderPendingModerationReports,
  type ModerationQueueMetadata
} from "../safety/moderationQueue"

export interface AdminReportView {
  reportId: string
  actorUserId: string
  reportedUserId: string
  reason: string
  note?: string
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
  queue: ModerationQueueMetadata
}

export interface AdminRouteServices {
  safetyService: SafetyService
  adminKey?: string
  adminTokenService?: AdminTokenService
  allowLegacyAdminKey?: boolean
  accountRecoveryService?: AccountRecoveryService
  adminUsersService?: AdminUsersService
  adminAnalyticsService?: AdminAnalyticsService
  connectionManager?: ConnectionManager
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return timingSafeEqual(aBuffer, bBuffer)
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  services: AdminRouteServices
): Promise<void> {
  const { safetyService } = services

  await registerAdminConsoleRoutes(app)

  app.get("/v1/admin/session", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const principal = getBearerPrincipal(request, reply, services)
    if (!principal) return
    return {
      operatorId: principal.operatorId,
      scopes: principal.scopes,
      expiresAt: principal.expiresAt
    }
  })

  app.get("/v1/admin/analytics", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!requireAdmin(request, reply, services, "metrics:read")) return
    const period = parseAnalyticsPeriod(isRecord(request.query) ? request.query.period : undefined)
    if (!period) return reply.code(400).send({ error: "Invalid analytics period." })
    if (!services.adminAnalyticsService) return reply.code(503).send({ error: "Analytics is unavailable." })
    const connections = services.connectionManager?.listConnections().filter((connection) =>
      connection.isAlive && connection.socket.readyState === 1) ?? []
    const online = { users: new Set(connections.map((connection) => connection.userId)).size, connections: connections.length }
    reply.header("Cache-Control", "no-store")
    return { snapshot: await services.adminAnalyticsService.snapshot(period, online) }
  })

  app.get("/v1/admin/users", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!requireAdmin(request, reply, services, "users:read")) return
    const userService = services.adminUsersService
    if (!userService) return reply.code(503).send({ error: "User administration is unavailable." })
    const query = isRecord(request.query) ? request.query.query : undefined
    if (typeof query !== "string") return reply.code(400).send({ error: "Provide a search query." })
    try {
      return { users: await userService.searchUsers(query) }
    } catch (error) {
      if (error instanceof AdminUsersInputError) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.get("/v1/admin/users/:userId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!requireAdmin(request, reply, services, "users:read")) return
    const userService = services.adminUsersService
    if (!userService) return reply.code(503).send({ error: "User administration is unavailable." })
    try {
      const user = await userService.getUser(readParam(request, "userId"))
      return user ? { user } : reply.code(404).send({ error: "User not found." })
    } catch (error) {
      if (error instanceof AdminUsersInputError) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.get("/v1/admin/users/:userId/quota-audit", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!requireAdmin(request, reply, services, "users:read")) return
    const userService = services.adminUsersService
    if (!userService) return reply.code(503).send({ error: "User administration is unavailable." })
    try {
      const events = await userService.listQuotaAudit(readParam(request, "userId"))
      return events ? { events } : reply.code(404).send({ error: "User not found." })
    } catch (error) {
      if (error instanceof AdminUsersInputError) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.post("/v1/admin/users/:userId/discovery-quota/reset", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const principal = requireAdmin(request, reply, services, "users:manage")
    if (!principal) return
    const userService = services.adminUsersService
    if (!userService) return reply.code(503).send({ error: "User administration is unavailable." })
    const body = isRecord(request.body) ? request.body : {}
    if (typeof body.reason !== "string") return reply.code(400).send({ error: "A reason is required." })
    try {
      return await userService.resetDiscoveryQuota({
        userId: readParam(request, "userId"), reason: body.reason,
        operatorId: principal.operatorId, tokenId: principal.tokenId
      })
    } catch (error) {
      if (error instanceof AdminUserNotFoundError) return reply.code(404).send({ error: "User not found." })
      if (error instanceof AdminUsersInputError) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.post("/v1/admin/users/:userId/discovery-quota/grant", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const principal = requireAdmin(request, reply, services, "users:manage")
    if (!principal) return
    const userService = services.adminUsersService
    if (!userService) return reply.code(503).send({ error: "User administration is unavailable." })
    const body = isRecord(request.body) ? request.body : {}
    if (typeof body.reason !== "string" || typeof body.amount !== "number") {
      return reply.code(400).send({ error: "A grant amount and reason are required." })
    }
    try {
      return await userService.grantDiscoveryQuota({
        userId: readParam(request, "userId"), reason: body.reason, amount: body.amount,
        operatorId: principal.operatorId, tokenId: principal.tokenId
      })
    } catch (error) {
      if (error instanceof AdminUserNotFoundError) return reply.code(404).send({ error: "User not found." })
      if (error instanceof AdminUsersInputError) return reply.code(400).send({ error: error.message })
      if (error instanceof AdminQuotaLimitError || error instanceof AdminQuotaExtensionLimitError) {
        return reply.code(409).send({ error: error.message })
      }
      throw error
    }
  })

  app.get("/v1/admin/reports", async (request, reply) => {
    if (!requireAdmin(request, reply, services, "reports:read")) return

    const query = isRecord(request.query) ? request.query : {}
    try {
      const reports = await safetyService.listAllReports({
        status: typeof query.status === "string" ? query.status : undefined,
        limit: readLimit(query.limit)
      })
      const queue = query.status === "pending"
        ? orderPendingModerationReports(reports)
        : reports
      return { reports: queue.map(toAdminReportView) }
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.get("/v1/admin/reports/summary", async (request, reply) => {
    if (!requireAdmin(request, reply, services, "reports:read")) return
    return {
      summary: await safetyService.getPendingReportQueueSummary()
    }
  })

  app.get("/v1/admin/reports/:reportId", async (request, reply) => {
    if (!requireAdmin(request, reply, services, "reports:read")) return

    const reportId = readParam(request, "reportId")
    const report = await safetyService.findReport(reportId)
    if (!report) {
      return reply.code(404).send({ error: "That report is not available." })
    }

    return { report: toAdminReportView(report) }
  })

  app.post("/v1/admin/reports/:reportId/resolve", async (request, reply) => {
    const principal = requireAdmin(request, reply, services, "reports:resolve")
    if (!principal) return

    const reportId = readParam(request, "reportId")
    const body = isRecord(request.body) ? request.body : {}
    const action = typeof body.action === "string" ? body.action : ""
    const note = typeof body.note === "string" ? body.note : undefined
    const suspendedUntil =
      typeof body.suspendedUntil === "string" ? body.suspendedUntil : undefined

    try {
      const report = await safetyService.resolveReport(reportId, {
        action,
        note,
        suspendedUntil,
        admin: {
          operatorId: principal.operatorId,
          tokenId: principal.tokenId
        }
      })
      if (!report) {
        return reply.code(404).send({ error: "That report is not available." })
      }
      return { report: toAdminReportView(report) }
    } catch (error) {
      if (error instanceof ReportResolutionConflictError) {
        return reply.code(409).send({ error: error.message })
      }
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.get("/v1/admin/account-recovery", async (request, reply) => {
    if (!requireAdmin(request, reply, services, "account-recovery:read")) return
    const recovery = services.accountRecoveryService
    if (!recovery) return reply.code(503).send({ error: "Account recovery is unavailable." })
    const query = isRecord(request.query) ? request.query : {}
    if ((query.cursor !== undefined && typeof query.cursor !== "string") ||
        (query.status !== undefined && (typeof query.status !== "string" || !["pending", "manual_review_required", "rejected"].includes(query.status))) ||
        (query.limit !== undefined && typeof query.limit !== "string")) {
      return reply.code(400).send({ error: "Invalid recovery pagination." })
    }
    try {
      return await recovery.listPage({ limit: query.limit === undefined ? undefined : Number(query.limit),
        status: query.status as AccountRecoveryStatus | undefined, cursor: query.cursor as string | undefined })
    } catch (error) {
      if (isPublicRequestError(error)) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.post("/v1/admin/account-recovery/:requestId/resolve", async (request, reply) => {
    const principal = requireAdmin(request, reply, services, "account-recovery:resolve")
    if (!principal) return
    const recovery = services.accountRecoveryService
    if (!recovery) return reply.code(503).send({ error: "Account recovery is unavailable." })
    const body = isRecord(request.body) ? request.body : {}
    const status = body.status === "manual_review_required" || body.status === "rejected" ? body.status : null
    if (!status) return reply.code(400).send({ error: "Choose a valid recovery resolution." })
    const requestId = readParam(request, "requestId")
    const resolved = await recovery.resolve({ requestId, status, operatorId: principal.operatorId, tokenId: principal.tokenId })
    if (!resolved) return reply.code(409).send({ error: "That recovery request is no longer pending." })
    return { request: resolved }
  })
}

function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  services: AdminRouteServices,
  requiredScope: AdminScope
): AdminPrincipal | null {
  const authorization = request.headers.authorization
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const principal = services.adminTokenService?.verify(authorization.slice(7))
    if (!principal) {
      reply.code(401).send({ error: "Admin access is required." })
      return null
    }
    if (!principal.scopes.includes(requiredScope)) {
      reply.code(403).send({ error: "Admin permission is required." })
      return null
    }
    return principal
  }

  const configuredKey = services.allowLegacyAdminKey
    ? services.adminKey?.trim()
    : undefined
  if (!configuredKey && !services.adminTokenService) {
    reply.code(403).send({ error: "Admin API is not configured." })
    return null
  }
  if (!configuredKey) {
    reply.code(401).send({ error: "Admin access is required." })
    return null
  }

  const providedKey = request.headers["x-admin-key"]
  if (typeof providedKey !== "string" || !safeCompare(providedKey, configuredKey)) {
    reply.code(401).send({ error: "Admin access is required." })
    return null
  }
  if (requiredScope !== "reports:read" && requiredScope !== "reports:resolve") {
    reply.code(403).send({ error: "Admin permission is required." })
    return null
  }
  return Object.freeze({
    operatorId: "legacy-development-admin",
    tokenId: "legacy-development-key",
    scopes: Object.freeze(["reports:read", "reports:resolve"] as const),
    expiresAt: new Date(0).toISOString()
  })
}

function getBearerPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  services: AdminRouteServices
): AdminPrincipal | null {
  const authorization = request.headers.authorization
  if (!services.adminTokenService) {
    reply.code(403).send({ error: "Admin API is not configured." })
    return null
  }
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Admin access is required." })
    return null
  }
  const principal = services.adminTokenService.verify(authorization.slice(7))
  if (!principal) {
    reply.code(401).send({ error: "Admin access is required." })
    return null
  }
  return principal
}

function toAdminReportView(report: ReportRecord): AdminReportView {
  return {
    reportId: report.reportId,
    actorUserId: report.actorUserId,
    reportedUserId: report.reportedUserId,
    reason: report.reason,
    ...(report.note ? { note: report.note } : {}),
    createdAt: report.createdAt,
    status: report.status,
    queue: getModerationQueueMetadata(report),
    ...(report.resolution ? { resolution: { ...report.resolution } } : {})
  }
}
