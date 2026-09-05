import assert from "node:assert/strict"
import test from "node:test"
import { createInMemorySafetyRepository } from "./safetyRepository"
import { createSafetyService } from "./safetyService"

test("blocks are idempotent and scoped to the actor", async () => {
  const service = createSafetyService({
    repository: createInMemorySafetyRepository()
  })

  const first = await service.blockUser(
    "user_a",
    "user_b",
    new Date("2026-06-26T12:00:00.000Z")
  )
  const second = await service.blockUser(
    "user_a",
    "user_b",
    new Date("2026-06-26T12:01:00.000Z")
  )

  assert.deepEqual(second, first)
  assert.equal((await service.listBlocks("user_a")).length, 1)
  assert.equal((await service.listBlocks("user_c")).length, 0)
})

test("block records preserve an optional privacy-minimal profile snapshot", async () => {
  const service = createSafetyService()
  const block = await service.blockUser("user_a", "user_b")
  const records = await service.listBlocks("user_a")

  assert.equal(records[0]?.blockedUserId, block.blockedUserId)
  assert.equal(records[0]?.blockedProfile, undefined)
})

test("unblock removes a block without affecting other actors", async () => {
  const service = createSafetyService()
  await service.blockUser("user_a", "user_b")
  await service.blockUser("user_c", "user_b")

  await service.unblockUser("user_a", "user_b")

  assert.equal((await service.listBlocks("user_a")).length, 0)
  assert.equal((await service.listBlocks("user_c")).length, 1)
})

test("batch block lookup returns both outgoing and incoming blocks once", async () => {
  const service = createSafetyService()
  await service.blockUser("viewer", "blocked_by_viewer")
  await service.blockUser("blocked_viewer", "viewer")
  await service.blockUser("unrelated", "other")

  const blockedUserIds = await service.listBlockedUserIdsBetween(
    "viewer",
    [
      "allowed",
      "blocked_by_viewer",
      "blocked_viewer",
      "blocked_by_viewer",
      "viewer",
      " "
    ]
  )

  assert.deepEqual(blockedUserIds, [
    "blocked_by_viewer",
    "blocked_viewer"
  ])
})

test("reports are normalized and auto-block the reported user", async () => {
  const service = createSafetyService({
    idFactory: () => "report_fixed"
  })

  const result = await service.reportUser(
    "user_a",
    {
      reportedUserId: "user_b",
      reason: "harassment",
      note: "  sent   threatening messages  "
    },
    new Date("2026-06-26T12:00:00.000Z")
  )

  assert.equal(result.report.reportId, "report_fixed")
  assert.equal(result.report.note, "sent threatening messages")
  assert.equal(result.block.blockedUserId, "user_b")
  assert.equal((await service.listReportsForActor("user_a")).length, 1)
  assert.equal((await service.listBlocks("user_a")).length, 1)
})

test("fake-or-bot reports pass the server-authoritative reason validator", async () => {
  const service = createSafetyService({ idFactory: () => "report_bot" })

  const result = await service.reportUser("user_a", {
    reportedUserId: "user_b",
    reason: "fake_or_bot"
  })

  assert.equal(result.report.reason, "fake_or_bot")
})

test("report idempotency keys replay the original report and reject a different payload", async () => {
  const service = createSafetyService({ idFactory: () => "report_idempotent" })
  const first = await service.reportUser(
    "user_a",
    {
      reportedUserId: "user_b",
      reason: "spam",
      note: " repeated unwanted messages ",
      idempotencyKey: "report-key-12345678"
    },
    new Date("2026-07-21T10:00:00.000Z")
  )
  const replay = await service.reportUser(
    "user_a",
    {
      reportedUserId: "user_b",
      reason: "spam",
      note: "repeated unwanted messages",
      idempotencyKey: "report-key-12345678"
    },
    new Date("2026-07-21T10:05:00.000Z")
  )

  assert.equal(first.report.reportId, "report_idempotent")
  assert.equal(replay.report.reportId, first.report.reportId)
  assert.equal(replay.replayed, true)
  await assert.rejects(
    () =>
      service.reportUser("user_a", {
        reportedUserId: "user_c",
        reason: "spam",
        idempotencyKey: "report-key-12345678"
      }),
    /different report/
  )
})

test("invalid safety actions are rejected", async () => {
  const service = createSafetyService()

  await assert.rejects(() => service.blockUser("user_a", "user_a"), /yourself/)
  await assert.rejects(
    () =>
      service.reportUser("user_a", {
        reportedUserId: "user_b",
        reason: "not_a_reason"
      }),
    /valid report reason/
  )
  await assert.rejects(
    () =>
      service.reportUser("user_a", {
        reportedUserId: "user_b",
        reason: "spam",
        note: "x".repeat(1001)
      }),
    /1000/
  )
})
