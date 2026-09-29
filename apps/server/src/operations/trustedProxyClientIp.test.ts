import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "../server"

// Railway staging logs (2026-09-29) show one client (edge srcIp) reaching the
// app from rotating internal proxy peers 100.64.0.6/.8/.9/.10. Rate limits keyed
// on request.ip must see the client, not the proxy peer.
const RAILWAY_INTERNAL_PROXY_RANGE = "100.64.0.0/10"

async function resolveClientIp(
  trustedProxyAddresses: string[] | undefined,
  headers: Record<string, string>,
  remoteAddress: string
): Promise<string> {
  const app = createServer({ trustedProxyAddresses })
  app.get("/test/client-ip", async (request) => ({ ip: request.ip }))
  const response = await app.inject({
    method: "GET",
    url: "/test/client-ip",
    headers,
    remoteAddress
  })
  await app.close()
  return response.json().ip
}

test("without a trusted proxy every Railway client collapses onto the proxy peer", async () => {
  assert.equal(
    await resolveClientIp(undefined, { "x-forwarded-for": "92.44.146.44" }, "100.64.0.6"),
    "100.64.0.6"
  )
})

test("trusting the Railway internal range resolves the edge-appended client address", async () => {
  assert.equal(
    await resolveClientIp([RAILWAY_INTERNAL_PROXY_RANGE], { "x-forwarded-for": "92.44.146.44" }, "100.64.0.9"),
    "92.44.146.44"
  )
})

test("a client-supplied X-Forwarded-For prefix cannot choose the resolved address", async () => {
  assert.equal(
    await resolveClientIp(
      [RAILWAY_INTERNAL_PROXY_RANGE],
      { "x-forwarded-for": "1.2.3.4, 92.44.146.44" },
      "100.64.0.8"
    ),
    "92.44.146.44"
  )
})

test("a direct peer outside the trusted range is never overridden by headers", async () => {
  assert.equal(
    await resolveClientIp([RAILWAY_INTERNAL_PROXY_RANGE], { "x-forwarded-for": "1.2.3.4" }, "203.0.113.7"),
    "203.0.113.7"
  )
})
