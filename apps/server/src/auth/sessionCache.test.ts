import assert from "node:assert/strict"
import test from "node:test"
import { startSocialLoop } from "../e2e/socialLoopHarness"
import { createAuthService } from "./authService"
import { createInMemoryAuthRepository, type AuthRepository } from "./authRepository"
import { createAccountRecord, createBlumiBackendStore, createSessionRecord, createSessionToken } from "./authStore"
import { createSessionCache } from "./sessionCache"

async function fixture(ttlMs = 15_000) {
  const raw = createInMemoryAuthRepository(createBlumiBackendStore())
  let reads = 0
  const counted: AuthRepository = new Proxy(raw, {
    get(target, property, receiver) {
      if (property === "getSessionWithAccountByTokenHash") {
        return async (hash: string) => { reads += 1; return target.getSessionWithAccountByTokenHash(hash) }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    }
  })
  const authService = createAuthService({ repository: counted, otpHmacSecret: "test-secret", sessionCacheTtlMs: ttlMs })
  const now = new Date()
  const account = createAccountRecord("+905550000123", now)
  await authService.repository.saveAccount(account)
  const token = createSessionToken()
  await authService.repository.saveSession(createSessionRecord(account, token, now))
  return { raw, authService, account, token, reads: () => reads }
}

test("an authenticated request reuses the cached session instead of a database read", async () => {
  const { authService, token, account, reads } = await fixture()
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await authService.getSession(token))?.account.userId, account.userId)
  }
  assert.equal(reads(), 1)
})

test("the cache is off unless configured", async () => {
  const { authService, token, reads } = await fixture(0)
  await authService.getSession(token)
  await authService.getSession(token)
  assert.equal(reads(), 2)
})

test("sign-out takes effect on the very next request", async () => {
  const { authService, token } = await fixture()
  assert.ok(await authService.getSession(token))
  await authService.revokeSession(token)
  assert.equal(await authService.getSession(token), null)
})

test("any account write through the auth repository drops cached sessions (ban, profile)", async () => {
  const { authService, token, account } = await fixture()
  assert.equal((await authService.getSession(token))?.account.moderation?.status ?? "active", "active")
  await authService.repository.saveAccount({ ...account, moderation: { status: "banned", updatedAt: new Date().toISOString() } })
  assert.equal((await authService.getSession(token))?.account.moderation?.status, "banned")
})

test("a moderation decision written elsewhere applies at once through its revocation", async () => {
  const { raw, authService, token, account } = await fixture()
  assert.ok(await authService.getSession(token))
  // The safety repository bans with its own SQL, then announces the revocation.
  await raw.saveAccount({ ...account, moderation: { status: "banned", updatedAt: new Date().toISOString() } })
  assert.notEqual((await authService.getSession(token))?.account.moderation?.status, "banned",
    "unannounced edits are bounded only by the TTL")
  authService.invalidateCachedSessions?.({ kind: "user", userId: account.userId })
  assert.equal((await authService.getSession(token))?.account.moderation?.status, "banned")
})

test("a cached session never outlives its expiry or a suspension's end", async () => {
  const { authService, token, reads } = await fixture()
  const resolved = await authService.getSession(token)
  assert.ok(resolved)
  const afterExpiry = new Date(Date.parse(resolved.session.expiresAt) + 1)
  assert.equal(await authService.getSession(token, afterExpiry), null)
  assert.equal(reads(), 2, "an expired cached answer goes back to the database")
})

test("an answer read while a write was in flight is not cached", async () => {
  const cache = createSessionCache({ ttlMs: 10_000 })
  const resolved = {
    account: createAccountRecord("+905550000124", new Date()),
    session: createSessionRecord(createAccountRecord("+905550000124", new Date()), createSessionToken(), new Date())
  }
  const epoch = cache.epoch()
  cache.invalidate({ kind: "user", userId: "someone-else" })
  cache.remember("hash", resolved, epoch)
  assert.equal(cache.get("hash"), undefined)
  cache.remember("hash", resolved, cache.epoch())
  assert.ok(cache.get("hash"))
  cache.invalidate({ kind: "user", userId: resolved.account.userId })
  assert.equal(cache.get("hash"), undefined)
})

// The in-memory safety store has no accounts; the ban is written by the
// PostgreSQL safety repository. Runs through the isolated postgres gate.
const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

test("PostgreSQL: a ban resolved by an operator stops the user's next request", requirePostgres, async () => {
  const harness = await startSocialLoop({ storage: "postgres" })
  try {
    const ada = await harness.signUp("Ada")
    const bora = await harness.signUp("Bora", { gender: "man" })
    assert.equal((await ada.http("GET", "/v1/users/me")).status, 200)
    const report = await bora.http("POST", "/v1/safety/reports", { reportedUserId: ada.userId, reason: "spam" })
    assert.equal(report.status, 201, JSON.stringify(report.body))
    const reportId = String((report.body as { report?: { reportId?: string }; reportId?: string }).report?.reportId ??
      (report.body as { reportId?: string }).reportId)
    const resolved = await harness.services.safetyService.resolveReport(reportId, {
      action: "ban",
      admin: { operatorId: "operator-test", tokenId: "token-test" }
    })
    assert.ok(resolved)
    const after = await ada.http("GET", "/v1/users/me")
    assert.equal(after.status, 403, JSON.stringify(after.body))
    assert.equal((after.body as { code?: string }).code, "ACCOUNT_BANNED")
  } finally {
    await harness.close()
  }
})
