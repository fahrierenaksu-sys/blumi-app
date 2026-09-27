import assert from "node:assert/strict"
import test from "node:test"
import {
  AdminQuotaLimitError,
  AdminUsersInputError,
  createAdminUsersService,
  type AdminQuotaActionInput,
  type AdminQuotaAuditEvent,
  type AdminQuotaSnapshot,
  type AdminUserRecord,
  type AdminUserRepository
} from "./adminUsersService"

const user: AdminUserRecord = {
  userId: "user_eren",
  displayName: "Eren Aksu",
  phoneNumber: "+905551234567",
  createdAt: "2026-01-01T00:00:00.000Z"
}

const quota: AdminQuotaSnapshot = {
  limit: 10,
  extensionDecisions: 0,
  used: 10,
  remaining: 0,
  resetsAt: "2026-09-28T00:00:00.000Z"
}

function createRepository(overrides: Partial<AdminUserRepository> = {}) {
  const calls: AdminQuotaActionInput[] = []
  const repository: AdminUserRepository = {
    async searchUsers() { return [user] },
    async findUser(userId) { return userId === user.userId ? user : null },
    async getQuota() { return quota },
    async resetQuota(input) {
      calls.push(input)
      return result("quota_reset", input, quota)
    },
    async grantQuota(input) {
      calls.push(input)
      return result("quota_grant", input, { ...quota, extensionDecisions: input.amount ?? 0 })
    },
    async listQuotaAudit() { return [] },
    ...overrides
  }
  return { repository, calls }
}

function result(
  action: AdminQuotaAuditEvent["action"],
  input: AdminQuotaActionInput,
  currentQuota: AdminQuotaSnapshot
) {
  return {
    quota: currentQuota,
    event: {
      eventId: "event_1",
      action,
      amount: input.amount ?? null,
      reason: input.reason,
      operatorId: input.operatorId,
      tokenId: input.tokenId,
      previousQuota: quota,
      currentQuota,
      createdAt: input.now.toISOString()
    }
  }
}

test("user search validates input and returns only a masked phone number", async () => {
  const { repository } = createRepository()
  const service = createAdminUsersService({ repository })

  await assert.rejects(() => service.searchUsers(" "), AdminUsersInputError)
  await assert.rejects(() => service.searchUsers("x"), AdminUsersInputError)
  const users = await service.searchUsers("  Eren  ")

  assert.deepEqual(users, [{
    userId: "user_eren",
    displayName: "Eren Aksu",
    maskedPhone: "••••••••••67",
    createdAt: user.createdAt
  }])
})

test("quota changes require an operator, token, and a useful reason", async () => {
  const { repository, calls } = createRepository()
  const service = createAdminUsersService({ repository })
  const input = {
    userId: user.userId,
    operatorId: "owner",
    tokenId: "token-1",
    reason: "Support quota reset"
  }

  await assert.rejects(
    () => service.resetDiscoveryQuota({ ...input, reason: "ok" }),
    AdminUsersInputError
  )
  await service.resetDiscoveryQuota(input)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.operatorId, "owner")
  assert.equal(calls[0]?.tokenId, "token-1")
  assert.equal(calls[0]?.reason, "Support quota reset")
})

test("daily quota grants are bounded and reject unlimited or malformed values", async () => {
  const { repository, calls } = createRepository()
  const service = createAdminUsersService({ repository })
  const input = {
    userId: user.userId,
    operatorId: "owner",
    tokenId: "token-1",
    reason: "Approved support extension"
  }

  await assert.rejects(
    () => service.grantDiscoveryQuota({ ...input, amount: 0 }),
    AdminUsersInputError
  )
  await assert.rejects(
    () => service.grantDiscoveryQuota({ ...input, amount: 51 }),
    AdminQuotaLimitError
  )
  await service.grantDiscoveryQuota({ ...input, amount: 5 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.amount, 5)
})
