import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryRateBudget, createPostgresRateBudget, USER_RATE_BUDGET_LIMITS, userBudgetKey } from "./sharedRateBudget"
import { createAuthService } from "../auth/authService"
import { createServer } from "../server"
import { AUTHENTICATED_IP_REQUESTS_PER_MINUTE } from "./requestLimits"
import { createChatService } from "../chat/chatService"

test("chat and leave budgets are independent, bounded per user, and renew with the window", async () => {
  let now = 1_800_000_000_000
  const budget = createInMemoryRateBudget(() => now)
  for (const scope of ["chatSend", "roomLeave"] as const) {
    for (let i = 0; i < USER_RATE_BUDGET_LIMITS[scope]; i++) assert.equal((await budget.consumeUser("sender", scope)).allowed, true)
    assert.equal((await budget.consumeUser("sender", scope)).allowed, false)
    assert.equal((await budget.consumeUser("another", scope)).allowed, true)
  }
  assert.equal((await budget.consumeUser("sender")).allowed, true)
  now += 60_000
  assert.equal((await budget.consumeUser("sender", "chatSend")).allowed, true)
  assert.equal((await budget.consumeUser("sender", "roomLeave")).allowed, true)
})

test("PostgreSQL uses separate scoped rows and the same bounded limits without a schema change", async () => {
  const parameters: unknown[][] = []
  const budget = createPostgresRateBudget({ async query(_sql, values) {
    parameters.push(values ?? [])
    return { rows: [{ allowed: true, retry_after_seconds: 12 }] }
  } })
  for (const scope of ["general", "chatSend", "roomLeave"] as const) {
    assert.deepEqual(await budget.consumeUser("sender", scope), { allowed: true, retryAfterSeconds: 12 })
  }
  assert.equal(new Set(parameters.map(values => values[0])).size, 3)
  assert.deepEqual(parameters.map(values => values[2]), [100, 180, 20])
  assert.equal(parameters[0]![0], userBudgetKey("sender"), "old callers keep the general row")
})

test("background requests cannot starve sequential chat sends across HTTP instances", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234559")
  const session = await auth.verifyCode("+905551234559", "123456")
  await auth.updateProfile(session.sessionToken, { displayName: "Sender", age: 24, gender: "woman", avatarPresetId: "avatar_v2_body_default" })
  for (const step of ["profile", "avatar", "room"] as const) await auth.completeOnboardingStep(session.sessionToken, step)
  const resolved = await auth.getSession(session.sessionToken)
  assert.ok(resolved)
  const userId = resolved.account.userId
  const chatService = createChatService()
  await chatService.repository.saveThread({
    threadId: "burst_thread", miniRoomId: "burst_room", participantUserIds: [userId, "partner"],
    participants: [{ userId, displayName: "Sender" }, { userId: "partner", displayName: "Partner" }],
    createdAt: new Date().toISOString()
  })
  const sharedRateLimiter = createInMemoryRateBudget(() => 1_800_000_000_000)
  const apps = [0, 1].map(() => createServer({ authService: auth, chatService, sharedRateLimiter }))
  const headers = { authorization: `Bearer ${session.sessionToken}` }
  try {
    for (let i = 0; i < 100; i++) {
      assert.equal((await apps[i % 2]!.inject({ method: "GET", url: "/v1/users/me", headers })).statusCode, 200)
    }
    assert.equal((await apps[0]!.inject({ method: "GET", url: "/v1/users/me", headers })).statusCode, 429)
    for (let i = 0; i < 180; i++) {
      const sent = await apps[i % 2]!.inject({ method: "POST", url: "/v1/threads/burst_thread/messages", headers,
        payload: { body: `message ${i}`, clientMessageId: `burst_client_${i}` } })
      assert.equal(sent.statusCode, 201, `send ${i}: ${sent.body}`)
    }
    const refused = await apps[0]!.inject({ method: "POST", url: "/v1/threads/burst_thread/messages", headers,
      payload: { body: "over budget", clientMessageId: "burst_over_budget" } })
    assert.equal(refused.statusCode, 429)
    assert.equal(refused.json().code, "CHAT_SEND_RATE_LIMITED")
    assert.ok(Number(refused.headers["retry-after"]) > 0)
    assert.equal((await chatService.repository.listMessages("burst_thread")).length, 180)
  } finally { await Promise.all(apps.map(app => app.close())) }
})

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

test("the request budget and the route share one session lookup per request", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234557")
  const session = await auth.verifyCode("+905551234557", "123456")
  const app = createServer({ authService: auth, sharedRateLimiter: createInMemoryRateBudget() })
  let lookups = 0
  const getSession = auth.getSession.bind(auth)
  auth.getSession = async (...args) => { lookups += 1; return getSession(...args) }
  try {
    for (let request = 1; request <= 3; request += 1) {
      const response = await app.inject({ method: "GET", url: "/v1/users/me",
        headers: { authorization: `Bearer ${session.sessionToken}` } })
      assert.equal(response.statusCode, 200)
      // Was two lookups (two queries each) per request: the hook and the route.
      assert.equal(lookups, request)
    }
    await auth.revokeSession(session.sessionToken)
    const revoked = await app.inject({ method: "GET", url: "/v1/users/me",
      headers: { authorization: `Bearer ${session.sessionToken}` } })
    assert.equal(revoked.statusCode, 401, "nothing is reused across requests")
  } finally { await app.close() }
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

test("an authenticated request reads its bearer session once for the budget and the route", async () => {
  const auth = createAuthService({ codeFactory: () => "123456" })
  await auth.sendCode("+905551234558")
  const session = await auth.verifyCode("+905551234558", "123456")
  let sessionReads = 0
  const readSession = auth.repository.getSessionByTokenHash.bind(auth.repository)
  auth.repository.getSessionByTokenHash = async (...args) => {
    sessionReads += 1
    return readSession(...args)
  }
  const app = createServer({ authService: auth })
  try {
    const headers = { authorization: `Bearer ${session.sessionToken}` }
    assert.equal((await app.inject({ method: "GET", url: "/v1/users/me", headers })).statusCode, 200)
    // Before: the budget hook and the route each read the session (two
    // sequential database round trips per authenticated request).
    assert.equal(sessionReads, 1)
    sessionReads = 0
    assert.equal((await app.inject({ method: "GET", url: "/v1/users/me", headers })).statusCode, 200)
    assert.equal(sessionReads, 1, "the reuse never outlives its request")
    sessionReads = 0
    assert.equal((await app.inject({ method: "GET", url: "/v1/users/me", headers: { authorization: "Bearer revoked" } })).statusCode, 401)
    assert.equal(sessionReads, 1)
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
    // Signed-in traffic gets the coarse per-IP ceiling (shared addresses);
    // the per-user budget is the real limit.
    for (let i = 0; i < AUTHENTICATED_IP_REQUESTS_PER_MINUTE + 5; i++) await app.inject({ method: "GET", url: "/v1/users/me",
      headers: { authorization: `Bearer ${session.sessionToken}` } })
    assert.equal(sharedChecks, AUTHENTICATED_IP_REQUESTS_PER_MINUTE)
  } finally { await app.close() }
})
