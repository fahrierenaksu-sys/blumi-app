import assert from "node:assert/strict"
import test from "node:test"
import { createAdminTokenService, mintAdminToken } from "../admin/adminTokenService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

test("reports summary is scoped, uncapped, and contains aggregate-only queue data", async () => {
  const signingKey = { keyId: "active", secret: Buffer.alloc(32, 7) }
  const adminTokenService = createAdminTokenService({ keys: [signingKey] })
  const safetyService = createSafetyService({
    idFactory: (() => {
      let count = 0
      return () => `report_${++count}`
    })()
  })
  const createdAt = new Date("2026-07-01T08:00:00.000Z")
  for (let index = 0; index < 101; index += 1) {
    await safetyService.reportUser(
      `reporter_${index}`,
      {
        reportedUserId: `reported_${index}`,
        reason: index % 3 === 0 ? "underage" : index % 3 === 1 ? "harassment" : "spam",
        note: "private report detail"
      },
      createdAt
    )
  }
  const now = new Date()
  const readToken = mintAdminToken({
    key: signingKey,
    operatorId: "moderator-read",
    tokenId: "read-token",
    scopes: ["reports:read"],
    now,
    ttlSeconds: 600
  })
  const resolveToken = mintAdminToken({
    key: signingKey,
    operatorId: "moderator-resolve",
    tokenId: "resolve-token",
    scopes: ["reports:resolve"],
    now,
    ttlSeconds: 600
  })
  const app = createServer({ safetyService, adminTokenService })

  const forbidden = await app.inject({
    method: "GET",
    url: "/v1/admin/reports/summary",
    headers: { authorization: `Bearer ${resolveToken}` }
  })
  assert.equal(forbidden.statusCode, 403)

  const response = await app.inject({
    method: "GET",
    url: "/v1/admin/reports/summary",
    headers: { authorization: `Bearer ${readToken}` }
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().summary, {
    countsByPriority: { urgent: 34, high: 34, standard: 33 },
    breachedCount: 101,
    oldestPendingCreatedAt: createdAt.toISOString(),
    generatedAt: response.json().summary.generatedAt
  })
  assert.match(response.json().summary.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(JSON.stringify(response.json().summary).includes("reporter_"), false)
  assert.equal(JSON.stringify(response.json().summary).includes("reported_"), false)
  assert.equal(JSON.stringify(response.json().summary).includes("private report detail"), false)
  assert.equal(JSON.stringify(response.json().summary).includes("report_"), false)

  await app.close()
})
