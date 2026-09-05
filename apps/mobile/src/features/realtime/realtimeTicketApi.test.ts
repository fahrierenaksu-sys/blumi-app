import assert from "node:assert/strict"
import test from "node:test"
import { RealtimeTicketRequestError } from "./realtimeClient"
import { requestRealtimeTicket } from "./realtimeTicketApi"

test("ticket API keeps the session token in the authorization header", async () => {
  let capturedUrl = ""
  let capturedInit: RequestInit | undefined
  const ticket = await requestRealtimeTicket(
    "https://api.example/",
    "private-session-token",
    (async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return new Response(JSON.stringify({
        ticket: "opaque_ticket_123",
        expiresAt: "2026-07-22T10:00:30.000Z"
      }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    }) as typeof fetch
  )

  assert.equal(ticket, "opaque_ticket_123")
  assert.equal(capturedUrl, "https://api.example/v1/auth/realtime-ticket")
  assert.doesNotMatch(capturedUrl, /private-session-token/)
  assert.equal(
    (capturedInit?.headers as Record<string, string>).authorization,
    "Bearer private-session-token"
  )
})

test("ticket API rejects missing expiry and session-token leakage", async () => {
  for (const payload of [
    { ticket: "opaque_ticket_123" },
    {
      ticket: "opaque_ticket_123",
      expiresAt: "tomorrow"
    },
    {
      ticket: "opaque_ticket_123",
      expiresAt: "2026-07-22T10:00:30.000Z",
      sessionToken: "leaked-session-token"
    }
  ]) {
    await assert.rejects(
      () => requestRealtimeTicket(
        "https://api.example",
        "private-session-token",
        (async () => new Response(JSON.stringify(payload), {
          status: 201,
          headers: { "content-type": "application/json" }
        })) as typeof fetch
      ),
      /invalid realtime ticket/
    )
  }
})

test("ticket API preserves authorization failures for session cleanup", async () => {
  await assert.rejects(
    () => requestRealtimeTicket(
      "https://api.example",
      "expired-token",
      (async () => new Response("{}", { status: 401 })) as typeof fetch
    ),
    (error: unknown) =>
      error instanceof RealtimeTicketRequestError && error.statusCode === 401
  )
})
