import assert from "node:assert/strict"
import test from "node:test"
import { createAdminAnalyticsService, parseAnalyticsPeriod } from "./adminAnalyticsService"

test("analytics reports unavailable sources instead of inventing numbers", async () => {
  assert.equal(parseAnalyticsPeriod(undefined), "7d")
  assert.equal(parseAnalyticsPeriod("90d"), null)
  const service = createAdminAnalyticsService({
    environment: "development", now: () => new Date("2026-09-28T10:00:00.000Z")
  })
  const snapshot = await service.snapshot("7d", { users: 2, connections: 3 })
  assert.deepEqual(snapshot.online, { users: 2, connections: 3, scope: "this-instance" })
  assert.equal(snapshot.activity, null)
  assert.equal(snapshot.activityUpdatedAt, null)
  assert.equal(snapshot.safetyUpdatedAt, null)
  assert.equal(snapshot.safety, null)
  assert.equal(snapshot.funnel, null)
  assert.equal(snapshot.trend, null)
  assert.ok(snapshot.unavailable.includes("databaseMetrics"))
  assert.ok(snapshot.unavailable.includes("providerCosts"))
})
