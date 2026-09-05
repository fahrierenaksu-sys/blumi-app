import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "../server"

test("server exposes the runtime route catalog as OpenAPI JSON", async () => {
  const app = createServer()
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/docs/openapi.json"
    })
    assert.equal(response.statusCode, 200)
    const document = response.json() as {
      openapi: string
      paths: Record<string, Record<string, unknown>>
    }
    assert.equal(document.openapi, "3.1.0")
    assert.ok(document.paths["/health"]?.get)
    assert.ok(document.paths["/v1/discover"]?.get)
    assert.ok(document.paths["/v1/threads/{threadId}/messages"]?.post)
    const safetyReport = document.paths["/v1/safety/reports"]?.post as {
      security?: unknown
      requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> }
      responses?: Record<string, unknown>
    }
    assert.deepEqual(safetyReport.security, [{ bearerAuth: [] }])
    assert.ok(safetyReport.requestBody?.content?.["application/json"]?.schema?.properties?.reportedUserId)
    assert.ok(safetyReport.responses?.["409"])
    const phoneChange = document.paths["/v1/account/phone-change/new/challenge"]?.post as {
      security?: unknown
      requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> }
      [key: string]: unknown
    }
    assert.deepEqual(phoneChange.security, [{ bearerAuth: [] }])
    assert.ok(phoneChange.requestBody?.content?.["application/json"]?.schema?.properties?.phoneNumber)
    assert.deepEqual(phoneChange["x-rate-limit"], { max: 5, timeWindow: "5 minutes" })
    assert.equal(
      (document.paths["/v1/account/recovery/challenge"]?.post as { security?: unknown }).security,
      undefined
    )
    const coinPacks = document.paths["/v1/commerce/coin-packs"]?.get as {
      security?: unknown
      responses?: Record<string, unknown>
    }
    assert.equal(coinPacks.security, undefined)
    assert.deepEqual(Object.keys(coinPacks.responses ?? {}).sort(), ["200"])

    const sendCode = document.paths["/v1/auth/send-code"]?.post as {
      security?: unknown
      responses?: Record<string, unknown>
    }
    assert.equal(sendCode.security, undefined)
    assert.ok(sendCode.responses?.["202"])
    assert.equal(sendCode.responses?.["200"], undefined)

    const realtimeTicket = document.paths["/v1/auth/realtime-ticket"]?.post as {
      responses?: Record<string, unknown>
    }
    assert.ok(realtimeTicket.responses?.["201"])
    assert.equal(realtimeTicket.responses?.["200"], undefined)

    const recoveryChallenge = document.paths["/v1/account/recovery/challenge"]?.post as {
      security?: unknown
      responses?: Record<string, unknown>
    }
    assert.equal(recoveryChallenge.security, undefined)
    assert.ok(recoveryChallenge.responses?.["202"])
    assert.equal(recoveryChallenge.responses?.["200"], undefined)
    const revenueCatWebhook = document.paths["/v1/webhooks/revenuecat"]?.post as {
      security?: unknown
      parameters?: Array<{ name: string; in: string; required: boolean }>
    }
    assert.deepEqual(revenueCatWebhook.security, [{ revenueCatWebhookSignature: [] }])
    assert.deepEqual(
      revenueCatWebhook.parameters?.find((parameter) => parameter.name === "x-revenuecat-webhook-signature"),
      {
        name: "x-revenuecat-webhook-signature",
        in: "header",
        required: true,
        schema: {
          type: "string",
          pattern: "^t=\\d{10,13},v1=[0-9a-fA-F]{64}$"
        }
      }
    )
    const safetyHeaders = safetyReport as {
      parameters?: Array<{ name: string; in: string; required: boolean }>
    }
    assert.deepEqual(
      safetyHeaders.parameters?.find((parameter) => parameter.name === "idempotency-key"),
      {
        name: "idempotency-key",
        in: "header",
        required: false,
        schema: { type: "string", minLength: 1 }
      }
    )
    assert.ok(Object.keys(document.paths).length >= 20)
  } finally {
    await app.close()
  }
})
