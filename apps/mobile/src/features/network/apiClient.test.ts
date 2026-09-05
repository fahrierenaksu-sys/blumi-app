import test from "node:test"
import assert from "node:assert/strict"
import {
  buildApiUrl,
  createAuthenticatedHeaders,
  requestJson
} from "./apiClient"

test("API client joins a base URL without duplicating slashes", () => {
  assert.equal(buildApiUrl("https://api.test/", "/v1/discover"), "https://api.test/v1/discover")
  assert.equal(buildApiUrl("https://api.test", "v1/discover"), "https://api.test/v1/discover")
})

test("API client creates isolated bearer headers with optional JSON content type", () => {
  const headers = createAuthenticatedHeaders("token-1", { json: true })
  assert.deepEqual(headers, {
    authorization: "Bearer token-1",
    "content-type": "application/json"
  })

  headers.authorization = "changed"
  assert.deepEqual(createAuthenticatedHeaders("token-1"), {
    authorization: "Bearer token-1"
  })
})

test("API client sends the request and parses its JSON payload once", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const payload = { profiles: [] }
  const result = await requestJson(
    "https://api.test/",
    "/v1/discover",
    {
      headers: createAuthenticatedHeaders("token-1"),
      signal: undefined
    },
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(result.response.status, 200)
  assert.deepEqual(result.payload, payload)
  assert.equal(calls[0]?.url, "https://api.test/v1/discover")
  assert.deepEqual(calls[0]?.init?.headers, {
    authorization: "Bearer token-1"
  })
})

test("JSON deadline rejects stalled fetch even when transport ignores abort", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  let signal: AbortSignal | null | undefined
  const request = requestJson("https://api.test", "/slow", {}, async (_url, init) => {
    signal = init?.signal
    return new Promise<Response>(() => {})
  })
  const rejected = assert.rejects(request, { name: "TimeoutError" })
  context.mock.timers.tick(15_000)
  await rejected
  assert.equal(signal?.aborted, true)
})

test("JSON deadline includes a stalled response body", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = requestJson("https://api.test", "/slow-body", {}, async () => ({
    json: () => { entered(); return new Promise<unknown>(() => {}) }
  } as Response))
  const rejected = assert.rejects(request, { name: "TimeoutError" })
  await started
  context.mock.timers.tick(15_000)
  await rejected
})

test("caller cancellation rejects a body read and pre-aborted calls do not fetch", async () => {
  const controller = new AbortController()
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = requestJson("https://api.test", "/cancel", { signal: controller.signal }, async () => ({
    json: () => { entered(); return new Promise<unknown>(() => {}) }
  } as Response))
  const rejected = assert.rejects(request, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  await assert.rejects(requestJson("https://api.test", "/cancel", { signal: controller.signal },
    async () => { assert.fail("pre-aborted request fetched") }), { name: "AbortError" })
})

test("success clears deadline and abort listener without changing the caller's signal", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const controller = new AbortController()
  const remove = context.mock.method(controller.signal, "removeEventListener")
  let transportSignal: AbortSignal | null | undefined
  await requestJson("https://api.test", "/ready", { signal: controller.signal }, async (_url, init) => {
    transportSignal = init?.signal
    return new Response("{}")
  })
  assert.equal(remove.mock.callCount(), 1)
  context.mock.timers.tick(15_000)
  assert.equal(transportSignal?.aborted, false)
  assert.equal(controller.signal.aborted, false)
})

test("network failure is not retried and a later explicit request can succeed", async () => {
  let calls = 0
  await assert.rejects(requestJson("https://api.test", "/offline", {}, async () => {
    calls += 1
    throw new Error("offline")
  }), /offline/)
  assert.equal(calls, 1)
  const response = await requestJson("https://api.test", "/online", {}, async () => new Response("{}"))
  assert.equal(response.response.status, 200)
})

test("malformed JSON preserves the existing null-payload contract", async () => {
  const result = await requestJson("https://api.test", "/bad-json", {}, async () => new Response("not json"))
  assert.equal(result.payload, null)
})
