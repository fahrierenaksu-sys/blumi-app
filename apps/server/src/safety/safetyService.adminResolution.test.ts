import assert from "node:assert/strict"
import test from "node:test"
import { createSafetyService, ReportResolutionConflictError } from "./safetyService"

test("moderation resolution requires identity and only one concurrent decision wins", async () => {
  const service = createSafetyService({ idFactory: () => "report_atomic" })
  await service.reportUser("reporter", {
    reportedUserId: "reported",
    reason: "spam"
  })

  await assert.rejects(
    service.resolveReport("report_atomic", { action: "warn" } as never),
    /admin identity/i
  )

  const decisions = await Promise.allSettled([
    service.resolveReport("report_atomic", {
      action: "warn",
      admin: { operatorId: "moderator-a", tokenId: "token-a" }
    }),
    service.resolveReport("report_atomic", {
      action: "dismiss",
      admin: { operatorId: "moderator-b", tokenId: "token-b" }
    })
  ])
  assert.equal(decisions.filter((result) => result.status === "fulfilled").length, 1)
  const rejected = decisions.find((result) => result.status === "rejected")
  assert.ok(rejected && rejected.status === "rejected")
  assert.equal(rejected.reason instanceof ReportResolutionConflictError, true)

  const report = await service.findReport("report_atomic")
  assert.equal(report?.status === "resolved" || report?.status === "dismissed", true)
  assert.ok(report?.resolution?.resolvedByAdminId)
  assert.ok(report?.resolution?.resolvedByTokenId)
})

test("a suspension keeps its end time in the report-resolution audit", async () => {
  const service = createSafetyService({ idFactory: () => "report_suspend" })
  const now = new Date("2026-07-22T10:00:00.000Z")
  const suspendedUntil = "2026-07-24T10:00:00.000Z"
  await service.reportUser("reporter", { reportedUserId: "reported", reason: "harassment" }, now)
  await service.resolveReport("report_suspend", {
    action: "suspend",
    suspendedUntil,
    admin: { operatorId: "moderator-a", tokenId: "token-a" }
  }, now)

  assert.equal((await service.findReport("report_suspend"))?.resolution?.suspendedUntil, suspendedUntil)
})
