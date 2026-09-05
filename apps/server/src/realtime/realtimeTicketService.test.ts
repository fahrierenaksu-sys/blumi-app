import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { hashSessionToken } from "../auth/authStore"
import { createRealtimeTicketService } from "./realtimeTicketService"
import { createInMemoryRealtimeTicketStore } from "./realtimeTicketStore"

test("realtime tickets are short lived, opaque, and single use", async () => {
  const { authService, sessionToken } = await createReadySession(
    "+905551119901"
  )

  const service = createRealtimeTicketService({
    authService,
    ttlMs: 1_000,
    ticketFactory: () => "opaque-ticket"
  })
  const issued = await service.issue(sessionToken, new Date(1_000))
  assert.ok(issued)
  assert.deepEqual(issued, {
    ticket: "opaque-ticket",
    expiresAt: new Date(2_000).toISOString()
  })
  assert.equal("sessionToken" in issued, false)

  assert.equal(
    await service.consume("opaque-ticket", new Date(1_500)),
    hashSessionToken(sessionToken)
  )
  assert.equal(await service.consume("opaque-ticket", new Date(1_500)), null)
})

test("expired realtime tickets are rejected and consumed", async () => {
  const { authService, sessionToken } = await createReadySession(
    "+905551119902"
  )
  const service = createRealtimeTicketService({
    authService,
    ttlMs: 100,
    ticketFactory: () => "expired-ticket"
  })

  assert.ok(await service.issue(sessionToken, new Date(1_000)))
  assert.equal(await service.consume("expired-ticket", new Date(1_100)), null)
  assert.equal(await service.consume("expired-ticket", new Date(1_050)), null)
})

test("a shared ticket store enforces single use across service instances", async () => {
  const { authService, sessionToken } = await createReadySession(
    "+905551119903"
  )
  const store = createInMemoryRealtimeTicketStore()
  const first = createRealtimeTicketService({ authService, store, ticketFactory: () => "shared-ticket" })
  const second = createRealtimeTicketService({ authService, store })

  assert.ok(await first.issue(sessionToken, new Date(1_000)))
  assert.equal(
    await second.consume("shared-ticket", new Date(1_100)),
    hashSessionToken(sessionToken)
  )
  assert.equal(await first.consume("shared-ticket", new Date(1_100)), null)
})

test("production ticket services require a shared ticket store", () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  assert.throws(
    () => createRealtimeTicketService({ authService, requireSharedStore: true }),
    /shared ticket store/i
  )
})

async function createReadySession(phoneNumber: string) {
  const authService = createAuthService({ codeFactory: () => "123456" })
  await authService.sendCode(phoneNumber)
  const verified = await authService.verifyCode(phoneNumber, "123456")
  await authService.updateProfile(verified.sessionToken, {
    displayName: "Ticket User",
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(verified.sessionToken, step)
  }
  return { authService, sessionToken: verified.sessionToken }
}
