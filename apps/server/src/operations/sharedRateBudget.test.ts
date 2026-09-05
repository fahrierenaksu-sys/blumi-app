import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryRateBudget } from "./sharedRateBudget"
import { createAuthService } from "../auth/authService"
import { createServer } from "../server"

test("an older clock window cannot reset an already consumed newer budget", async () => {
  let now = 120_000
  const budget = createInMemoryRateBudget(() => now)
  for (let i = 0; i < 100; i++) await budget.consumeUser("user")
  now = 60_000
  assert.equal((await budget.consumeUser("user")).allowed, false)
})

test("two HTTP instances share one authenticated user request budget", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234555")
  const session = await auth.verifyCode("+905551234555", "123456")
  const sharedRateLimiter = createInMemoryRateBudget(() => 1_800_000_000_000)
  const apps = [createServer({ authService: auth, sharedRateLimiter }), createServer({ authService: auth, sharedRateLimiter })]
  try {
    const statuses: number[] = []
    for (let i = 0; i < 110; i++) {
      const response = await apps[i % 2]!.inject({ method: "GET", url: "/v1/users/me",
        headers: { authorization: `Bearer ${session.sessionToken}` } })
      statuses.push(response.statusCode)
      if (response.statusCode === 429) assert.ok(Number(response.headers["retry-after"]) > 0)
    }
    assert.equal(statuses.filter(status => status === 200).length, 100)
    assert.equal(statuses.filter(status => status === 429).length, 10)
  } finally { await Promise.all(apps.map(app => app.close())) }
})

test("shared budget failure denies the authenticated request", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234556")
  const session = await auth.verifyCode("+905551234556", "123456")
  const app = createServer({ authService: auth, sharedRateLimiter: {
    async consumeUser() { throw new Error("budget down") }, async purgeExpired() {}
  } })
  try {
    const response = await app.inject({ method: "GET", url: "/v1/users/me", headers: { authorization: `Bearer ${session.sessionToken}` } })
    assert.equal(response.statusCode, 503)
    assert.doesNotMatch(response.body, /budget down/)
  } finally { await app.close() }
})

test("cheap local limit stops excess requests before shared budget access", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234557")
  const session = await auth.verifyCode("+905551234557", "123456")
  let sharedChecks = 0
  const app = createServer({ authService: auth, sharedRateLimiter: {
    async consumeUser() { sharedChecks += 1; return { allowed: true, retryAfterSeconds: 1 } }, async purgeExpired() {}
  } })
  try {
    for (let i = 0; i < 105; i++) await app.inject({ method: "GET", url: "/v1/users/me",
      headers: { authorization: `Bearer ${session.sessionToken}` } })
    assert.equal(sharedChecks, 100)
  } finally { await app.close() }
})
