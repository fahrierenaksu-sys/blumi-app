import assert from "node:assert/strict"
import test from "node:test"
import {
  createOpenApiDocument,
  normalizeOpenApiPath
} from "./openapiDocument"

test("OpenAPI document normalizes Fastify params and records auth by route boundary", () => {
  const document = createOpenApiDocument([
    { method: "GET", url: "/health" },
    { method: "GET", url: "/v1/discover/:userId" },
    { method: "POST", url: "/v1/auth/send-code", config: { apiAuth: "public" } },
    { method: "POST", url: "/v1/account/recovery/challenge", config: { apiAuth: "public" } },
    { method: "POST", url: "/v1/threads/:threadId/messages" },
    { method: "HEAD", url: "/v1/ignored" },
    { method: "GET", url: "/v1/docs/openapi.json" }
  ])

  assert.equal(document.openapi, "3.1.0")
  assert.ok(document.paths["/health"]?.get)
  assert.deepEqual(
    document.paths["/v1/discover/{userId}"]?.get?.security,
    [{ bearerAuth: [] }]
  )
  assert.equal(document.paths["/v1/auth/send-code"]?.post?.security, undefined)
  assert.equal(document.paths["/v1/account/recovery/challenge"]?.post?.security, undefined)
  assert.equal(document.paths["/v1/ignored"], undefined)
  assert.equal(document.paths["/v1/docs/openapi.json"], undefined)
  assert.deepEqual(
    document.paths["/v1/threads/{threadId}/messages"]?.post?.parameters,
    [{
      name: "threadId",
      in: "path",
      required: true,
      schema: { type: "string" }
    }]
  )
})

test("OpenAPI document carries route JSON schema query and body boundaries", () => {
  const document = createOpenApiDocument([{
    method: "POST",
    url: "/v1/example",
    schema: {
      querystring: {
        required: ["cursor"],
        properties: {
          cursor: { type: "string" },
          limit: { type: "integer" }
        }
      },
      body: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } }
      }
    }
  }])

  const operation = document.paths["/v1/example"]?.post
  assert.equal((operation?.parameters as Array<{ name: string; required: boolean }>)[0]?.required, true)
  assert.equal((operation?.parameters as Array<{ name: string; required: boolean }>)[1]?.required, false)
  assert.deepEqual(
    operation?.requestBody,
    {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name"],
            properties: { name: { type: "string" } }
          }
        }
      }
    }
  )
})

test("OpenAPI path normalization strips query strings without weakening params", () => {
  assert.equal(normalizeOpenApiPath("/v1/discover/:userId?limit=12"), "/v1/discover/{userId}")
})

test("OpenAPI carries shared route response, path, and rate-limit contracts", () => {
  const document = createOpenApiDocument([{
    method: "POST",
    url: "/v1/safety/blocks/:blockedUserId",
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: {
      params: {
        type: "object",
        required: ["blockedUserId"],
        properties: { blockedUserId: { type: "string", minLength: 1 } }
      },
      response: {
        201: { type: "object", additionalProperties: true },
        409: {
          type: "object",
          required: ["error"],
          properties: { code: { type: "string" }, error: { type: "string" } }
        }
      }
    }
  }])

  const operation = document.paths["/v1/safety/blocks/{blockedUserId}"]?.post
  assert.deepEqual(operation?.parameters, [{
    name: "blockedUserId",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1 }
  }])
  assert.deepEqual(operation?.["x-rate-limit"], {
    max: 5,
    timeWindow: "1 minute"
  })
  const responses = operation?.responses as Record<string, { content?: Record<string, unknown> }>
  assert.deepEqual(Object.keys(responses).sort(), ["201", "409"])
  assert.deepEqual(responses["201"]?.content, {
    "application/json": {
      schema: { type: "object", additionalProperties: true }
    }
  })
  assert.ok(responses["409"]?.content)
})

test("OpenAPI documents explicit public, bearer, and HMAC route policies", () => {
  const document = createOpenApiDocument([
    {
      method: "GET",
      url: "/v1/commerce/coin-packs",
      config: { apiAuth: "public" }
    },
    {
      method: "POST",
      url: "/v1/webhooks/revenuecat",
      config: { apiAuth: "revenuecat-webhook" },
      schema: {
        headers: {
          type: "object",
          required: ["x-revenuecat-webhook-signature"],
          properties: {
            "x-revenuecat-webhook-signature": { type: "string" }
          }
        }
      }
    },
    {
      method: "POST",
      url: "/v1/safety/reports",
      config: { apiAuth: "bearer" },
      schema: {
        headers: {
          type: "object",
          properties: { "idempotency-key": { type: "string" } }
        }
      }
    }
  ])

  assert.equal(document.paths["/v1/commerce/coin-packs"]?.get?.security, undefined)
  assert.deepEqual(
    document.paths["/v1/webhooks/revenuecat"]?.post?.security,
    [{ revenueCatWebhookSignature: [] }]
  )
  assert.deepEqual(
    document.paths["/v1/webhooks/revenuecat"]?.post?.parameters,
    [{
      name: "x-revenuecat-webhook-signature",
      in: "header",
      required: true,
      schema: { type: "string" }
    }]
  )
  assert.deepEqual(
    document.paths["/v1/safety/reports"]?.post?.parameters,
    [{
      name: "idempotency-key",
      in: "header",
      required: false,
      schema: { type: "string" }
    }]
  )
})
