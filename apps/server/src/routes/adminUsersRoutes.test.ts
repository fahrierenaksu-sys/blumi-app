import assert from "node:assert/strict"
import test from "node:test"
import { createAdminTokenService, mintAdminToken } from "../admin/adminTokenService"
import type {
  AdminQuotaAuditEvent,
  AdminQuotaSnapshot,
  AdminUserDetails,
  AdminUsersService
} from "../admin/adminUsersService"
import { AdminUserNotFoundError } from "../admin/adminUsersService"
import { createServer } from "../server"

const signingKey = { keyId: "admin-test", secret: Buffer.alloc(32, 9) }
const now = new Date()
const quota: AdminQuotaSnapshot = {
  limit: 10, extensionDecisions: 0, used: 10, remaining: 0,
  resetsAt: "2026-09-28T00:00:00.000Z"
}
const user: AdminUserDetails = {
  userId: "user_123", displayName: "Eren Aksu", maskedPhone: "••••••••••67",
  createdAt: "2026-01-01T00:00:00.000Z", discoveryQuota: quota
}
const event: AdminQuotaAuditEvent = {
  eventId: "event_123", action: "quota_grant", amount: 5,
  reason: "Support extension approved", operatorId: "owner", tokenId: "token_manage",
  previousQuota: quota,
  currentQuota: { ...quota, limit: 15, extensionDecisions: 5, remaining: 5 },
  createdAt: now.toISOString()
}

function token(scopes: ("users:read" | "users:manage")[], id: string) {
  return mintAdminToken({
    key: signingKey, operatorId: "owner", tokenId: id, scopes, now, ttlSeconds: 600
  })
}

function setup() {
  let mutationCount = 0
  const adminUsersService: AdminUsersService = {
    async searchUsers(query) {
      return query.toLowerCase().includes("eren") ? [{
        userId: user.userId, displayName: user.displayName,
        maskedPhone: user.maskedPhone, createdAt: user.createdAt
      }] : []
    },
    async getUser(userId) { return userId === user.userId ? user : null },
    async resetDiscoveryQuota(input) {
      if (input.userId !== user.userId) throw new AdminUserNotFoundError()
      mutationCount += 1
      return { quota, event: { ...event, action: "quota_reset" } }
    },
    async grantDiscoveryQuota(input) {
      if (input.userId !== user.userId) throw new AdminUserNotFoundError()
      mutationCount += 1
      return { quota: { ...quota, extensionDecisions: input.amount, limit: 10 + input.amount }, event }
    },
    async listQuotaAudit(userId) { return userId === user.userId ? [event] : null }
  }
  const app = createServer({
    adminUsersService,
    adminTokenService: createAdminTokenService({ keys: [signingKey] }),
    adminKey: "legacy-test-key",
    allowLegacyAdminKey: true
  })
  return { app, getMutationCount: () => mutationCount }
}

test("admin user API enforces read and manage scopes and audits mutations", async () => {
  const { app, getMutationCount } = setup()
  const read = token(["users:read"], "token_read")
  const manage = token(["users:read", "users:manage"], "token_manage")

  const anonymous = await app.inject({ method: "GET", url: "/v1/admin/users?query=Eren" })
  assert.equal(anonymous.statusCode, 401)
  const legacy = await app.inject({
    method: "GET", url: "/v1/admin/users?query=Eren",
    headers: { "x-admin-key": "legacy-test-key" }
  })
  assert.equal(legacy.statusCode, 403)
  const found = await app.inject({
    method: "GET", url: "/v1/admin/users?query=Eren",
    headers: { authorization: `Bearer ${read}` }
  })
  assert.equal(found.statusCode, 200)
  assert.deepEqual(found.json().users[0], {
    userId: user.userId, displayName: user.displayName,
    maskedPhone: user.maskedPhone, createdAt: user.createdAt
  })

  const noManage = await app.inject({
    method: "POST", url: `/v1/admin/users/${user.userId}/discovery-quota/reset`,
    headers: { authorization: `Bearer ${read}` }, payload: { reason: "Support request resolved" }
  })
  assert.equal(noManage.statusCode, 403)
  assert.equal(getMutationCount(), 0)

  const updated = await app.inject({
    method: "POST", url: `/v1/admin/users/${user.userId}/discovery-quota/grant`,
    headers: { authorization: `Bearer ${manage}` },
    payload: { amount: 5, reason: "Support extension approved" }
  })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.json().event.operatorId, "owner")
  assert.equal(updated.json().event.tokenId, "token_manage")
  assert.equal(getMutationCount(), 1)

  const malformed = await app.inject({
    method: "POST", url: `/v1/admin/users/${user.userId}/discovery-quota/grant`,
    headers: { authorization: `Bearer ${manage}` },
    payload: { amount: "unlimited", reason: "Support extension approved" }
  })
  assert.equal(malformed.statusCode, 400)
  const missingUser = await app.inject({
    method: "POST", url: "/v1/admin/users/missing/discovery-quota/grant",
    headers: { authorization: `Bearer ${manage}` },
    payload: { amount: 1, reason: "Approved quota extension" }
  })
  assert.equal(missingUser.statusCode, 404)
  await app.close()
})

test("admin console is same-origin, no-store, and does not persist or HTML-inject its token/data", async () => {
  const { app } = setup()
  const page = await app.inject({ method: "GET", url: "/admin" })
  assert.equal(page.statusCode, 200)
  assert.match(page.headers["content-security-policy"] ?? "", /script-src 'self'/)
  assert.equal(page.headers["cache-control"], "no-store")
  assert.match(page.body, /\/admin\/console\.js/)

  const script = await app.inject({ method: "GET", url: "/admin/console.js" })
  assert.equal(script.statusCode, 200)
  assert.doesNotMatch(script.body, /localStorage|sessionStorage|innerHTML|outerHTML/)
  assert.match(script.body, /textContent/)
  await app.close()
})
