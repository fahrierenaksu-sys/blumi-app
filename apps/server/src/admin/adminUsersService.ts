export interface AdminUserRecord {
  userId: string
  displayName: string
  phoneNumber: string
  createdAt: string
}

export interface AdminQuotaSnapshot {
  limit: number
  extensionDecisions: number
  used: number
  remaining: number
  resetsAt: string
}

export interface AdminUserSummary {
  userId: string
  displayName: string
  maskedPhone: string
  createdAt: string
}

export interface AdminUserDetails extends AdminUserSummary {
  discoveryQuota: AdminQuotaSnapshot
}

export interface AdminQuotaActionInput {
  userId: string
  operatorId: string
  tokenId: string
  reason: string
  now: Date
  amount?: number
}

export interface AdminQuotaAuditEvent {
  eventId: string
  action: "quota_reset" | "quota_grant"
  amount: number | null
  reason: string
  operatorId: string
  tokenId: string
  previousQuota: AdminQuotaSnapshot
  currentQuota: AdminQuotaSnapshot
  createdAt: string
}

export interface AdminUserRepository {
  searchUsers(query: string, limit: number): Promise<readonly AdminUserRecord[]>
  findUser(userId: string): Promise<AdminUserRecord | null>
  getQuota(userId: string, now: Date): Promise<AdminQuotaSnapshot>
  resetQuota(input: AdminQuotaActionInput): Promise<{
    quota: AdminQuotaSnapshot
    event: AdminQuotaAuditEvent
  }>
  grantQuota(input: AdminQuotaActionInput): Promise<{
    quota: AdminQuotaSnapshot
    event: AdminQuotaAuditEvent
  }>
  listQuotaAudit(userId: string, limit: number): Promise<readonly AdminQuotaAuditEvent[]>
}

export interface AdminUsersService {
  searchUsers(query: string): Promise<readonly AdminUserSummary[]>
  getUser(userId: string, now?: Date): Promise<AdminUserDetails | null>
  resetDiscoveryQuota(input: Omit<AdminQuotaActionInput, "now" | "amount">): Promise<{
    quota: AdminQuotaSnapshot
    event: AdminQuotaAuditEvent
  }>
  grantDiscoveryQuota(input: Omit<AdminQuotaActionInput, "now"> & { amount: number }): Promise<{
    quota: AdminQuotaSnapshot
    event: AdminQuotaAuditEvent
  }>
  listQuotaAudit(userId: string): Promise<readonly AdminQuotaAuditEvent[] | null>
}

export class AdminUsersInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminUsersInputError"
  }
}

export class AdminQuotaLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminQuotaLimitError"
  }
}

export class AdminQuotaExtensionLimitError extends AdminQuotaLimitError {
  constructor() {
    super("The daily discovery quota extension cannot exceed 100 decisions.")
    this.name = "AdminQuotaExtensionLimitError"
  }
}

export class AdminUserNotFoundError extends Error {
  constructor() {
    super("Admin quota target user does not exist.")
    this.name = "AdminUserNotFoundError"
  }
}

const SEARCH_QUERY_MAX_LENGTH = 128
const REASON_MIN_LENGTH = 12
const REASON_MAX_LENGTH = 500
const MAX_QUOTA_GRANT = 50

export function createAdminUsersService(options: Readonly<{
  repository: AdminUserRepository
  now?: () => Date
}>): AdminUsersService {
  const now = options.now ?? (() => new Date())
  const service: AdminUsersService = {
    async searchUsers(query) {
      const normalized = query.trim()
      if (normalized.length < 2 || normalized.length > SEARCH_QUERY_MAX_LENGTH) {
        throw new AdminUsersInputError("Search with 2 to 128 characters.")
      }
      return (await options.repository.searchUsers(normalized, 20)).map(toSummary)
    },

    async getUser(userId, at = now()) {
      const normalizedId = normalizeUserId(userId)
      const user = await options.repository.findUser(normalizedId)
      if (!user) return null
      return {
        ...toSummary(user),
        discoveryQuota: await options.repository.getQuota(normalizedId, at)
      }
    },

    async resetDiscoveryQuota(input) {
      return options.repository.resetQuota({
        ...normalizeAction(input),
        now: now()
      })
    },

    async grantDiscoveryQuota(input) {
      if (!Number.isInteger(input.amount) || input.amount < 1) {
        throw new AdminUsersInputError("Choose a whole-number quota grant from 1 to 50.")
      }
      if (input.amount > MAX_QUOTA_GRANT) {
        throw new AdminQuotaLimitError("A single quota grant cannot exceed 50 decisions.")
      }
      return options.repository.grantQuota({
        ...normalizeAction(input),
        amount: input.amount,
        now: now()
      })
    },

    async listQuotaAudit(userId) {
      const normalizedId = normalizeUserId(userId)
      if (!(await options.repository.findUser(normalizedId))) return null
      return options.repository.listQuotaAudit(normalizedId, 20)
    }
  }
  return Object.freeze(service)
}

function normalizeAction(input: Omit<AdminQuotaActionInput, "now" | "amount">): Omit<AdminQuotaActionInput, "now" | "amount"> {
  const reason = input.reason.trim().replace(/\s+/g, " ")
  if (reason.length < REASON_MIN_LENGTH || reason.length > REASON_MAX_LENGTH || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(reason)) {
    throw new AdminUsersInputError("Add a reason between 12 and 500 characters.")
  }
  return {
    userId: normalizeUserId(input.userId),
    operatorId: normalizeIdentity(input.operatorId, "operator"),
    tokenId: normalizeIdentity(input.tokenId, "token"),
    reason
  }
}

function normalizeUserId(value: string): string {
  return normalizeIdentity(value, "user")
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new AdminUsersInputError(`Invalid ${label} identifier.`)
  }
  return normalized
}

function toSummary(user: AdminUserRecord): AdminUserSummary {
  return {
    userId: user.userId,
    displayName: user.displayName,
    maskedPhone: maskPhoneNumber(user.phoneNumber),
    createdAt: user.createdAt
  }
}

function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "")
  if (!digits) return "Hidden"
  return `${"•".repeat(Math.max(4, digits.length - 2))}${digits.slice(-2)}`
}
