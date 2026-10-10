import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "../server"

test("server exposes the runtime route catalog as OpenAPI JSON", async () => {
  const app = createServer()
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/docs/openapi.json?scope=all"
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

test("active, mobile, admin and legacy catalogs separate consumers without removing compatibility routes", async () => {
  const app = createServer({ firebaseAuthVerifier: {
    async verifyIdToken() { throw new Error("This documentation check must not verify a phone.") }
  } })
  const document = async (scope?: string) => {
    const response = await app.inject({ method: "GET", url: `/v1/docs/openapi.json${scope ? `?scope=${scope}` : ""}` })
    assert.equal(response.statusCode, 200)
    return response.json() as { paths: Record<string, Record<string, Record<string, unknown>>> }
  }
  try {
    const [active, mobile, admin, infrastructure, legacy, all] = await Promise.all([
      document(), document("mobile"), document("admin"), document("infrastructure"), document("legacy"), document("all")
    ])
    assert.equal(active.paths["/v1/auth/send-code"], undefined)
    assert.equal(mobile.paths["/v1/auth/send-code"], undefined)
    assert.ok(mobile.paths["/v1/auth/firebase/complete"]?.post)
    assert.ok(mobile.paths["/v1/account/firebase/reauth"]?.post)
    assert.ok(mobile.paths["/v1/account"]?.delete)
    assert.equal(mobile.paths["/v1/admin/users"], undefined)
    assert.equal(mobile.paths["/health"], undefined)
    assert.ok(admin.paths["/v1/admin/users"]?.get)
    assert.ok(admin.paths["/admin"]?.get)
    assert.deepEqual(admin.paths["/v1/admin/users"]?.get?.security, [{ adminAuth: [] }])
    assert.equal(admin.paths["/v1/users/me"], undefined)
    assert.ok(infrastructure.paths["/health"]?.get)
    assert.ok(infrastructure.paths["/v1/webhooks/revenuecat"]?.post)
    assert.equal(infrastructure.paths["/v1/users/me"], undefined)
    for (const [path, methods] of Object.entries(legacy.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        assert.equal(operation.deprecated, true)
        assert.ok((operation.responses as Record<string, unknown>)["410"])
        assert.ok(Array.isArray(operation["x-replaced-by"]))
        assert.equal(active.paths[path]?.[method], undefined)
        assert.deepEqual(all.paths[path]?.[method], operation)
      }
    }
    assert.ok(legacy.paths["/v1/account/phone-change/new/challenge"]?.post)
    assert.ok(legacy.paths["/v1/account/recovery/challenge"]?.post)
    // Hiding a compatibility operation in docs must never turn an old client
    // into an unknown-route error or re-enable the retired SMS workflow.
    const retired = await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: {} })
    assert.equal(retired.statusCode, 410)
    assert.equal(retired.json().code, "FIREBASE_PHONE_AUTH_REQUIRED")
    const invalid = await app.inject({ method: "GET", url: "/v1/docs/openapi.json?scope=unsupported" })
    assert.equal(invalid.statusCode, 400)
  } finally { await app.close() }
})
