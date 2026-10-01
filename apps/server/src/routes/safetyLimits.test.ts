import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

async function signedIn(authService: ReturnType<typeof createAuthService>, phoneNumber: string) {
  await authService.sendCode(phoneNumber)
  const { sessionToken, account } = await authService.verifyCode(phoneNumber, "123456")
  return { userId: account.userId, headers: { authorization: `Bearer ${sessionToken}` } }
}

test("reports and blocks refuse people who do not exist", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const app = createServer({ authService })
  try {
    const reporter = await signedIn(authService, "+905551118001")
    const target = await signedIn(authService, "+905551118002")
    const missingReport = await app.inject({ method: "POST", url: "/v1/safety/reports", headers: reporter.headers,
      payload: { reportedUserId: "user_does_not_exist", reason: "spam" } })
    assert.equal(missingReport.statusCode, 400)
    assert.match(missingReport.json().error, /not available/)
    const missingBlock = await app.inject({ method: "POST", url: "/v1/safety/blocks", headers: reporter.headers,
      payload: { blockedUserId: "user_does_not_exist" } })
    assert.equal(missingBlock.statusCode, 400)
    const oversized = await app.inject({ method: "POST", url: "/v1/safety/blocks", headers: reporter.headers,
      payload: { blockedUserId: "x".repeat(129) } })
    assert.equal(oversized.statusCode, 400)

    const report = await app.inject({ method: "POST", url: "/v1/safety/reports", headers: reporter.headers,
      payload: { reportedUserId: target.userId, reason: "spam" } })
    assert.equal(report.statusCode, 201)
    const duplicate = await app.inject({ method: "POST", url: "/v1/safety/reports", headers: reporter.headers,
      payload: { reportedUserId: target.userId, reason: "spam" } })
    assert.equal(duplicate.statusCode, 200, "a pending report on the same person is answered, not duplicated")
    assert.equal(duplicate.json().report.reportId, report.json().report.reportId)
    const escalated = await app.inject({ method: "POST", url: "/v1/safety/reports", headers: reporter.headers,
      payload: { reportedUserId: target.userId, reason: "underage" } })
    assert.equal(escalated.statusCode, 201, "a more urgent reason is accepted into the pending report")
    assert.equal(escalated.json().report.reportId, report.json().report.reportId)
    assert.equal(escalated.json().report.reason, "underage")
  } finally {
    await app.close()
  }
})

test("each person may send 20 reports and 30 blocks a minute, whatever their address", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const app = createServer({ authService })
  try {
    const first = await signedIn(authService, "+905551118011")
    const second = await signedIn(authService, "+905551118012")
    const report = (headers: Record<string, string>) => app.inject({ method: "POST", url: "/v1/safety/reports", headers,
      payload: { reportedUserId: "user_does_not_exist", reason: "spam" }, remoteAddress: "203.0.113.30" })
    for (let index = 0; index < 20; index += 1) assert.equal((await report(first.headers)).statusCode, 400)
    const limited = await report(first.headers)
    assert.equal(limited.statusCode, 429)
    assert.match(limited.headers["retry-after"] ?? "", /^\d+$/)
    assert.equal((await report(second.headers)).statusCode, 400, "a neighbour on the same address is not limited")

    const block = () => app.inject({ method: "POST", url: "/v1/safety/blocks", headers: first.headers,
      payload: { blockedUserId: "user_does_not_exist" } })
    for (let index = 0; index < 30; index += 1) assert.equal((await block()).statusCode, 400)
    assert.equal((await block()).statusCode, 429)
  } finally {
    await app.close()
  }
})

test("the report cap answers 429", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const safetyService = createSafetyService()
  const app = createServer({ authService, safetyService })
  try {
    const reporter = await signedIn(authService, "+905551118021")
    for (let index = 0; index < 20; index += 1) {
      await safetyService.reportUser(reporter.userId, { reportedUserId: `seeded_${index}`, reason: "spam" })
    }
    const response = await app.inject({ method: "POST", url: "/v1/safety/reports", headers: reporter.headers,
      payload: { reportedUserId: "one_more", reason: "spam" } })
    assert.equal(response.statusCode, 429)
    assert.match(response.json().error, /many reports/)
  } finally {
    await app.close()
  }
})

test("the admin pending queue pages by risk, then oldest first, past any backlog size", async () => {
  let id = 0
  const safetyService = createSafetyService({ idFactory: () => `report_${String(++id).padStart(3, "0")}` })
  const start = Date.parse("2026-09-01T00:00:00.000Z")
  // 120 newer low-risk reports, then one old urgent and one old high report.
  for (let index = 0; index < 120; index += 1) {
    await safetyService.reportUser(`actor_${index}`, { reportedUserId: `target_${index}`, reason: "spam" },
      new Date(start + (index + 10) * 60_000))
  }
  await safetyService.reportUser("actor_urgent", { reportedUserId: "target_urgent", reason: "underage" }, new Date(start + 5 * 60_000))
  await safetyService.reportUser("actor_high", { reportedUserId: "target_high", reason: "harassment" }, new Date(start))
  const app = createServer({ safetyService, adminKey: "admin_secret", allowLegacyAdminKey: true })
  try {
    const seen: Array<{ reportId: string; priority: string; createdAt: string }> = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page += 1) {
      const query: string = `/v1/admin/reports?status=pending&limit=50${cursor ? `&cursor=${cursor}` : ""}`
      const response = await app.inject({ method: "GET", url: query, headers: { "x-admin-key": "admin_secret" } })
      assert.equal(response.statusCode, 200, response.body)
      const body = response.json() as { reports: Array<{ reportId: string; createdAt: string; queue: { priority: string } }>; nextCursor: string | null }
      seen.push(...body.reports.map((report) => ({ reportId: report.reportId, priority: report.queue.priority, createdAt: report.createdAt })))
      cursor = body.nextCursor
      if (!cursor) break
    }
    assert.equal(seen.length, 122)
    assert.equal(new Set(seen.map((report) => report.reportId)).size, 122)
    assert.deepEqual(seen.slice(0, 2).map((report) => report.priority), ["urgent", "high"])
    const standard = seen.slice(2).map((report) => Date.parse(report.createdAt))
    assert.deepEqual(standard, [...standard].sort((left, right) => left - right), "oldest first within a risk")

    const badCursor = await app.inject({ method: "GET", url: "/v1/admin/reports?status=pending&cursor=not*valid",
      headers: { "x-admin-key": "admin_secret" } })
    assert.equal(badCursor.statusCode, 400)
  } finally {
    await app.close()
  }
})
