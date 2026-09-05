import { randomUUID } from "node:crypto"
import type { AuthService } from "../auth/authService"
import { PublicRequestError } from "../errors/publicRequestError"

export type AccountRecoveryStatus = "pending" | "manual_review_required" | "rejected"

export interface RecoveryPageInput { limit?: number; status?: AccountRecoveryStatus; cursor?: string }
export interface RecoveryPage { requests: readonly AccountRecoveryRequest[]; nextCursor: string | null }
export interface RecoveryPageQuery { limit: number; status?: AccountRecoveryStatus; before?: { createdAt: string; requestId: string } }

export interface AccountRecoveryRequest {
  requestId: string
  accountId?: string
  claimedOldPhoneNumber?: string
  newPhoneNumber: string
  createdAt: string
  status: AccountRecoveryStatus
  resolvedAt?: string
  resolvedByOperatorId?: string
  resolvedByTokenId?: string
}

export interface AccountRecoveryRepository {
  save(request: AccountRecoveryRequest): Promise<void>
  list(limit: number): Promise<readonly AccountRecoveryRequest[]>
  listPage(input: RecoveryPageQuery): Promise<readonly AccountRecoveryRequest[]>
  resolve(input: { requestId: string; status: Exclude<AccountRecoveryStatus, "pending">; now: Date; operatorId: string; tokenId: string }): Promise<AccountRecoveryRequest | null>
}

export interface AccountRecoveryService {
  request(input: { oldPhoneNumber: string; newPhoneNumber: string; verificationCode: string; now?: Date }): Promise<void>
  list(limit?: number): Promise<readonly AccountRecoveryRequest[]>
  listPage(input?: RecoveryPageInput): Promise<RecoveryPage>
  resolve(input: { requestId: string; status: Exclude<AccountRecoveryStatus, "pending">; operatorId: string; tokenId: string; now?: Date }): Promise<AccountRecoveryRequest | null>
}

export function createInMemoryAccountRecoveryRepository(): AccountRecoveryRepository {
  const requests = new Map<string, AccountRecoveryRequest>()
  return {
    async save(request) { requests.set(request.requestId, { ...request }) },
    async list(limit) { return [...requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((request) => ({ ...request })) },
    async listPage(input) {
      return [...requests.values()].filter(r => (!input.status || r.status === input.status) &&
        (!input.before || r.createdAt < input.before.createdAt ||
          (r.createdAt === input.before.createdAt && r.requestId < input.before.requestId)))
        .sort((a, b) => a.createdAt === b.createdAt ? (a.requestId < b.requestId ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, input.limit).map(r => ({ ...r }))
    },
    async resolve(input) {
      const current = requests.get(input.requestId)
      if (!current || current.status !== "pending") return null
      const next: AccountRecoveryRequest = { ...current, status: input.status, resolvedAt: input.now.toISOString(), resolvedByOperatorId: input.operatorId, resolvedByTokenId: input.tokenId }
      requests.set(next.requestId, next)
      return { ...next }
    }
  }
}

export function createAccountRecoveryService(input: { authService: AuthService; repository?: AccountRecoveryRepository }): AccountRecoveryService {
  const repository = input.repository ?? createInMemoryAccountRecoveryRepository()
  return {
    async request({ oldPhoneNumber, newPhoneNumber, verificationCode, now = new Date() }) {
      await input.authService.verifyRecoveryPhoneVerification(newPhoneNumber, verificationCode, now)
      const account = await input.authService.repository.getAccountByPhone(oldPhoneNumber)
      await repository.save({
        requestId: `recovery_${randomUUID()}`,
        ...(account ? { accountId: account.accountId } : {}),
        claimedOldPhoneNumber: oldPhoneNumber,
        newPhoneNumber,
        createdAt: now.toISOString(),
        status: "pending"
      })
    },
    async list(limit = 50) { return repository.list(Math.min(Math.max(limit, 1), 100)) },
    async listPage(options = {}) {
      const limit = options.limit ?? 50
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new PublicRequestError("Invalid recovery page limit.")
      if (options.status && !["pending", "manual_review_required", "rejected"].includes(options.status)) throw new PublicRequestError("Invalid recovery status.")
      const before = options.cursor !== undefined ? decodeRecoveryCursor(options.cursor, options.status) : undefined
      const rows = await repository.listPage({ limit: limit + 1, status: options.status, before })
      const requests = rows.slice(0, limit)
      const last = requests.at(-1)
      const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({ v: 1, createdAt: last.createdAt,
        requestId: last.requestId, status: options.status ?? null })).toString("base64url") : null
      return { requests, nextCursor }
    },
    async resolve({ requestId, status, operatorId, tokenId, now = new Date() }) {
      return repository.resolve({ requestId, status, operatorId, tokenId, now })
    }
  }
}

function decodeRecoveryCursor(cursor: string, status?: AccountRecoveryStatus): { createdAt: string; requestId: string } {
  try {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error()
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (value.v !== 1 || value.status !== (status ?? null) || typeof value.requestId !== "string" ||
        !/^[A-Za-z0-9_-]{1,255}$/.test(value.requestId) || typeof value.createdAt !== "string" ||
        new Date(value.createdAt).toISOString() !== value.createdAt) throw new Error()
    return { createdAt: value.createdAt, requestId: value.requestId }
  } catch { throw new PublicRequestError("Invalid recovery cursor.") }
}
