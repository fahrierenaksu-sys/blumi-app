import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService, type AuthService } from "../auth/authService"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
import { createServer } from "../server"
import { createFixedWindowLimiter } from "./requestLimits"

const SHARED_IP = "203.0.113.20"

test("rotating invented bearer tokens cannot escape the per-IP limit on Discover", async () => {
  const app = createServer({ authService: createAuthService() })
  try {
    const statuses: number[] = []
    for (let index = 0; index < 101; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/v1/discover",
        headers: { authorization: `Bearer invented-token-${index}` },
        remoteAddress: SHARED_IP
      })
      statuses.push(response.statusCode)
    }
    assert.deepEqual(statuses.slice(0, 100), Array(100).fill(401))
    assert.equal(statuses[100], 429)

    const otherAddress = await app.inject({
      method: "GET",
      url: "/v1/discover",
      headers: { authorization: "Bearer invented-token-other" },
      remoteAddress: "203.0.113.21"
    })
    assert.equal(otherAddress.statusCode, 401)
  } finally {
    await app.close()
  }
})

test("signed-in people behind one shared address are limited per person, not per address", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const app = createServer({ authService })
  try {
    const tokens = [
      await createReadySession(authService, "+905551117001"),
      await createReadySession(authService, "+905551117002"),
      await createReadySession(authService, "+905551117003")
    ]
    for (let round = 0; round < 60; round += 1) {
      for (const token of tokens) {
        const response = await app.inject({
          method: "GET",
          url: "/v1/users/me",
          headers: { authorization: `Bearer ${token}` },
          remoteAddress: SHARED_IP
        })
        assert.equal(response.statusCode, 200, `round ${round}`)
      }
    }
  } finally {
    await app.close()
  }
})

test("requests without a bearer token keep the strict per-IP limit", async () => {
  const app = createServer({ authService: createAuthService() })
  try {
    const statuses: number[] = []
    for (let index = 0; index < 101; index += 1) {
      statuses.push((await app.inject({ method: "GET", url: "/v1/commerce/coin-packs", remoteAddress: SHARED_IP })).statusCode)
    }
    assert.deepEqual(statuses.slice(0, 100), Array(100).fill(200))
    assert.equal(statuses[100], 429)
  } finally {
    await app.close()
  }
})

test("realtime tickets are limited per signed-in person, so a neighbour on the same address still connects", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const app = createServer({
    authService,
    realtimeTicketService: createRealtimeTicketService({ authService })
  })
  try {
    const first = await createReadySession(authService, "+905551117011")
    const second = await createReadySession(authService, "+905551117012")
    const issue = (token: string) => app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: SHARED_IP
    })
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await issue(first)).statusCode, 201, `ticket ${index + 1}`)
    }
    const limited = await issue(first)
    assert.equal(limited.statusCode, 429)
    assert.match(limited.headers["retry-after"] ?? "", /^\d+$/)

    assert.equal((await issue(second)).statusCode, 201)
  } finally {
    await app.close()
  }
})

test("the fixed-window limiter resets after its window and reports a retry delay", () => {
  let now = 1_000
  const limiter = createFixedWindowLimiter({ max: 2, windowMs: 10_000, now: () => now })
  assert.equal(limiter.consume("a").allowed, true)
  assert.equal(limiter.isLimited("a").allowed, true)
  assert.equal(limiter.consume("a").allowed, true)
  assert.equal(limiter.isLimited("a").allowed, false)
  const third = limiter.consume("a")
  assert.equal(third.allowed, false)
  assert.equal(third.retryAfterSeconds, 10)
  assert.equal(limiter.consume("b").allowed, true)
  now += 10_000
  assert.equal(limiter.consume("a").allowed, true)
})

async function createReadySession(authService: AuthService, phoneNumber: string): Promise<string> {
  await authService.sendCode(phoneNumber)
  const { sessionToken } = await authService.verifyCode(phoneNumber, "123456")
  await authService.updateProfile(sessionToken, {
    displayName: "Ready User",
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(sessionToken, step)
  }
  return sessionToken
}
