import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { hashSessionToken } from "../auth/authStore"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
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

async function createSession(
  authService: ReturnType<typeof createAuthService>,
  phoneNumber: string
): Promise<string> {
  await authService.sendCode(phoneNumber)
  return (await authService.verifyCode(phoneNumber, "123456")).sessionToken
}
