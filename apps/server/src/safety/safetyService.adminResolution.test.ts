import assert from "node:assert/strict"
import test from "node:test"
import {
  createSafetyService,
  ReportedAccountDeletedError,
  ReportResolutionConflictError
} from "./safetyService"

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

test("a retained report about a deleted account cannot be turned into a suspension or ban", async () => {
  const known = new Set(["reporter", "reported"])
  const service = createSafetyService({
    idFactory: () => "report_deleted_target",
    isKnownUser: async (userId) => known.has(userId)
  })
  await service.reportUser("reporter", { reportedUserId: "reported", reason: "harassment" })
  known.delete("reported")
  for (const action of ["ban", "suspend"]) {
    await assert.rejects(
      service.resolveReport("report_deleted_target", {
        action,
        ...(action === "suspend" ? { suspendedUntil: new Date(Date.now() + 86_400_000).toISOString() } : {}),
        admin: { operatorId: "moderator-a", tokenId: "token-a" }
      }),
      ReportedAccountDeletedError
    )
  }
  assert.equal((await service.findReport("report_deleted_target"))?.status, "pending")
  const warned = await service.resolveReport("report_deleted_target", {
    action: "warn",
    admin: { operatorId: "moderator-a", tokenId: "token-a" }
  })
  assert.equal(warned?.status, "resolved")
})
