import assert from "node:assert/strict"
import test from "node:test"
import { createAdminTokenService, mintAdminToken } from "../admin/adminTokenService"
import type { AdminAnalyticsService } from "../admin/adminAnalyticsService"
import { createServer } from "../server"

test("analytics requires metrics scope and returns only aggregate data", async () => {
  const key = { keyId: "analytics", secret: Buffer.alloc(32, 9) }
  const adminTokenService = createAdminTokenService({ keys: [key] })
  const token = (scopes: ("metrics:read" | "users:read")[]) => mintAdminToken({
    key, operatorId: "operator", tokenId: scopes.join("-"), scopes, now: new Date(), ttlSeconds: 600
  })
  let requestedPeriod = ""
  const adminAnalyticsService: AdminAnalyticsService = {
    async snapshot(period, online) {
      requestedPeriod = period
      assert.deepEqual(online, { users: 0, connections: 0 })
      return {
        generatedAt: "2026-09-28T00:00:00.000Z", activityUpdatedAt: null,
        safetyUpdatedAt: null, period, environment: "staging",
        online: { ...online, scope: "this-instance" }, activity: null, safety: null,
        funnel: null, trend: null, unavailable: ["databaseMetrics"]
      }
    }
  }
  const app = createServer({ adminTokenService, adminAnalyticsService })
  try {
    assert.equal((await app.inject({ method: "GET", url: "/v1/admin/analytics" })).statusCode, 401)
    assert.equal((await app.inject({ method: "GET", url: "/v1/admin/analytics", headers: { authorization: `Bearer ${token(["users:read"])}` } })).statusCode, 403)
    assert.equal((await app.inject({ method: "GET", url: "/v1/admin/analytics?period=year", headers: { authorization: `Bearer ${token(["metrics:read"])}` } })).statusCode, 400)
    const result = await app.inject({ method: "GET", url: "/v1/admin/analytics?period=24h", headers: { authorization: `Bearer ${token(["metrics:read"])}` } })
    assert.equal(result.statusCode, 200)
    assert.equal(result.headers["cache-control"], "no-store")
    assert.equal(requestedPeriod, "24h")
    assert.deepEqual(result.json().snapshot.online, { users: 0, connections: 0, scope: "this-instance" })
    assert.equal(JSON.stringify(result.json()).includes("operator"), false)
  } finally { await app.close() }
})
