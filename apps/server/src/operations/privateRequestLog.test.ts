import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
import { createServer } from "../server"

const PRIVATE_ID = "user_7f3c9a1e"
const PRIVATE_CURSOR = "cursor_secret_42"
const CLIENT_IP = "92.44.146.44"

async function captureRequestLogs(nodeEnv: string): Promise<Record<string, unknown>[]> {
  const lines: string[] = []
  const authService = createAuthService()
  const app = createServer({
    authService,
    realtimeTicketService: createRealtimeTicketService({ authService }),
    logger: true,
    nodeEnv,
    trustedProxyAddresses: ["100.64.0.0/10"],
    logDestination: { write: (line: string) => { lines.push(line) } }
  })
  app.get("/test/people/:personId", { config: { apiAuth: "public" } }, async () => ({ ok: true }))
  app.get("/test/fails/:personId", { config: { apiAuth: "public" } }, async () => {
    throw new Error(`lookup failed for ${PRIVATE_ID}`)
  })
  const headers = { "x-forwarded-for": CLIENT_IP, authorization: "Bearer secret-session-token" }
  try {
    const ok = await app.inject({ method: "GET", url: `/test/people/${PRIVATE_ID}?cursor=${PRIVATE_CURSOR}`, headers, remoteAddress: "100.64.0.9" })
    assert.equal(ok.statusCode, 200)
    const missing = await app.inject({ method: "GET", url: `/test/missing/${PRIVATE_ID}?cursor=${PRIVATE_CURSOR}`, headers, remoteAddress: "100.64.0.9" })
    assert.equal(missing.statusCode, 404)
    const failed = await app.inject({ method: "GET", url: `/test/fails/${PRIVATE_ID}`, headers, remoteAddress: "100.64.0.9" })
    assert.equal(failed.statusCode, 500)
  } finally {
    await app.close()
  }
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

for (const nodeEnv of ["production", "development"]) {
  test(`${nodeEnv} request logs carry the route template, never raw URLs, ids, cursors or client IPs`, async () => {
    const entries = await captureRequestLogs(nodeEnv)
    const raw = JSON.stringify(entries)
    for (const secret of [PRIVATE_ID, PRIVATE_CURSOR, CLIENT_IP, "100.64.0.9", "secret-session-token", "remoteAddress", "localhost:80"]) {
      assert.equal(raw.includes(secret), false, `log leaked ${secret}`)
    }
    const completed = entries.filter((entry) => entry.msg === "request completed")
    assert.deepEqual(
      completed.map(({ method, route, statusCode }) => ({ method, route, statusCode })),
      [
        { method: "GET", route: "/test/people/:personId", statusCode: 200 },
        { method: "GET", route: "unmatched", statusCode: 404 },
        { method: "GET", route: "/test/fails/:personId", statusCode: 500 }
      ]
    )
    for (const entry of completed) assert.equal(typeof entry.responseTimeMs, "number")
    assert.equal(entries.some((entry) => entry.msg === "incoming request"), false)
  })
}
