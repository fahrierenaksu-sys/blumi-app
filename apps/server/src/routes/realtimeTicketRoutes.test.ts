import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { hashSessionToken } from "../auth/authStore"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
import {
  CONNECTION_SETUP_RETRY_AFTER_SECONDS,
  createConnectionSetupGate
} from "../realtime/connectionSetupGate"
import { createServer } from "../server"

test("realtime ticket endpoint requires a product-ready bearer session", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const ticketService = createRealtimeTicketService({ authService })
  const app = createServer({ authService, realtimeTicketService: ticketService })
  try {
    assert.equal((await app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket"
    })).statusCode, 401)

    const sessionToken = await createSession(authService, "+905551119911")
    assert.equal((await app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${sessionToken}` }
    })).statusCode, 403)

    await authService.updateProfile(sessionToken, {
      displayName: "Ready User",
      age: 24,
      gender: "woman",
      avatarPresetId: "avatar_v2_body_default"
    })
    for (const step of ["profile", "avatar", "room"] as const) {
      await authService.completeOnboardingStep(sessionToken, step)
    }

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${sessionToken}` }
    })
    assert.equal(response.statusCode, 201)
    assert.match(response.json().ticket, /^[A-Za-z0-9_-]{40,}$/)
    assert.equal("sessionToken" in response.json(), false)
    assert.match(response.headers["cache-control"] ?? "", /no-store/)
    assert.equal(
      await ticketService.consume(response.json().ticket),
      hashSessionToken(sessionToken)
    )
    assert.equal(await ticketService.consume(response.json().ticket), null)
  } finally {
    await app.close()
  }
})

test("a ticket request is shed with 503 and Retry-After while connection setup is saturated", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const setupGate = createConnectionSetupGate(1)
  const ticketService = createRealtimeTicketService({ authService, setupGate })
  const app = createServer({ authService, realtimeTicketService: ticketService })
  let sessionLookups = 0
  const getSession = authService.getSession.bind(authService)
  authService.getSession = async (...args) => { sessionLookups += 1; return getSession(...args) }
  try {
    const sessionToken = await createSession(authService, "+905551119912")
    const release = setupGate.tryAcquire()
    assert.ok(release)
    const shed = await app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${sessionToken}` }
    })
    assert.equal(shed.statusCode, 503)
    assert.equal(shed.headers["retry-after"], String(CONNECTION_SETUP_RETRY_AFTER_SECONDS))
    assert.equal(sessionLookups, 0, "shed before any session lookup or budget query")
    release()
    const admitted = await app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${sessionToken}` }
    })
    // Not onboarded: the normal answer, and the slot was given back.
    assert.equal(admitted.statusCode, 403)
    assert.equal(setupGate.inFlight(), 0)
    // The request budget hook and the route share one session lookup.
    assert.equal(sessionLookups, 1)
  } finally {
    await app.close()
  }
})

test("ticket requests are limited per session, so phones behind one carrier address are not", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const ticketService = createRealtimeTicketService({ authService })
  const app = createServer({ authService, realtimeTicketService: ticketService, trustedProxyAddresses: ["127.0.0.1"] })
  try {
    const carrier = { "x-forwarded-for": "203.0.113.90" }
    const tokens: string[] = []
    for (let phone = 0; phone < 3; phone += 1) {
      const token = await createSession(authService, `+90555112${String(phone).padStart(4, "0")}`)
      await authService.updateProfile(token, {
        displayName: `Carrier ${phone}`, age: 24, gender: "woman", avatarPresetId: "avatar_v2_body_default"
      })
      for (const step of ["profile", "avatar", "room"] as const) await authService.completeOnboardingStep(token, step)
      tokens.push(token)
    }
    const request = (token: string) => app.inject({
      method: "POST",
      url: "/v1/auth/realtime-ticket",
      headers: { authorization: `Bearer ${token}`, ...carrier }
    })
    for (let attempt = 0; attempt < 30; attempt += 1) assert.equal((await request(tokens[0]!)).statusCode, 201)
    assert.equal((await request(tokens[0]!)).statusCode, 429, "one session is still limited")
    assert.equal((await request(tokens[1]!)).statusCode, 201, "another phone on the same address is not")
    assert.equal((await request(tokens[2]!)).statusCode, 201)
  } finally {
    await app.close()
  }
})

async function createSession(
  authService: ReturnType<typeof createAuthService>,
  phoneNumber: string
): Promise<string> {
  await authService.sendCode(phoneNumber)
  return (await authService.verifyCode(phoneNumber, "123456")).sessionToken
}
