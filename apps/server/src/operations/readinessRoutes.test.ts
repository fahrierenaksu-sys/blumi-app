import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "../server"

test("liveness stays healthy while failed DB readiness and new work return unavailable", async () => {
  let accepting = true
  let databaseHealthy = false
  const app = createServer({ logger: false, isAccepting: () => accepting,
    checkReadiness: async () => { if (!databaseHealthy) throw new Error("database unavailable") } })
  try {
    assert.equal((await app.inject("/live")).statusCode, 200)
    assert.equal((await app.inject("/health")).statusCode, 200)
    assert.equal((await app.inject("/ready")).statusCode, 503)
    databaseHealthy = true
    assert.equal((await app.inject("/ready")).statusCode, 200)
    accepting = false
    assert.equal((await app.inject("/ready")).statusCode, 503)
    assert.equal((await app.inject("/v1/users/me")).statusCode, 503)
    assert.equal((await app.inject("/live")).statusCode, 200)
  } finally { await app.close() }
})

test("readiness completes within its timeout when database query stalls", async () => {
  const app = createServer({ logger: false, readinessTimeoutMs: 10, checkReadiness: () => new Promise(() => {}) })
  try {
    assert.equal((await app.inject("/ready")).statusCode, 503)
  } finally { await app.close() }
})
