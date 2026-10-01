import assert from "node:assert/strict"
import test from "node:test"
import { createInMemorySafetyRepository } from "./safetyRepository"
import { createSafetyService, MAX_REPORTS_PER_DAY, SafetyLimitError } from "./safetyService"

test("a block check sees both directions with one repository read", async () => {
  const repository = createInMemorySafetyRepository()
  let reads = 0
  for (const method of ["findBlock", "listBlockedUserIdsBetween"] as const) {
    const original = repository[method].bind(repository) as (...args: unknown[]) => Promise<unknown>
    ;(repository as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => { reads += 1; return original(...args) }
  }
  const service = createSafetyService({ repository })
  assert.equal(await service.hasBlockBetween("user_a", "user_b"), false)
  assert.equal(reads, 1, "was one findBlock per direction")
  await service.blockUser("user_b", "user_a")
  for (const [first, second] of [["user_a", "user_b"], ["user_b", "user_a"]] as const) {
    reads = 0
    assert.equal(await service.hasBlockBetween(first, second), true)
    assert.equal(reads, 1)
  }
  assert.equal(await service.hasBlockBetween("user_a", "user_c"), false)
})

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

test("block and report targets must be canonical, bounded user ids", async () => {
  const service = createSafetyService()
  for (const target of ["x".repeat(129), "user b", "user_b\u0000", "../user_b"]) {
    await assert.rejects(() => service.blockUser("user_a", target), /Choose a person first/, target)
    await assert.rejects(() => service.reportUser("user_a", { reportedUserId: target, reason: "spam" }), /Choose a person first/, target)
  }
  assert.equal((await service.blockUser("user_a", ` ${"x".repeat(128)} `)).blockedUserId, "x".repeat(128))
})

test("block and report targets must be existing people; unblocking a missing person still works", async () => {
  const service = createSafetyService({ isKnownUser: async (userId) => userId !== "ghost" })
  await assert.rejects(() => service.blockUser("user_a", "ghost"), /not available/)
  await assert.rejects(() => service.reportUser("user_a", { reportedUserId: "ghost", reason: "spam" }), /not available/)
  assert.equal((await service.listBlocks("user_a")).length, 0)
  await service.unblockUser("user_a", "ghost")
  assert.equal((await service.blockUser("user_a", "user_b")).blockedUserId, "user_b")
})

test("a pending report on the same person is returned instead of a duplicate unless the new reason is more urgent", async () => {
  let id = 0
  const service = createSafetyService({ idFactory: () => `report_${++id}` })
  const first = await service.reportUser("user_a", { reportedUserId: "user_b", reason: "harassment", note: "rude" })
  const repeat = await service.reportUser("user_a", { reportedUserId: "user_b", reason: "spam", note: "again" })
  assert.equal(first.replayed, false)
  assert.equal(repeat.replayed, true)
  assert.equal(repeat.report.reportId, first.report.reportId)
  assert.equal(repeat.report.reason, "harassment")
  assert.equal(repeat.report.note, "rude")
  assert.equal((await service.listReportsForActor("user_a")).length, 1)
})

test("spam then underage on the same person escalates the pending report into the urgent queue", async () => {
  let id = 0
  const service = createSafetyService({ idFactory: () => `report_${++id}` })
  const first = await service.reportUser("user_a", { reportedUserId: "user_b", reason: "spam" })
  const urgent = await service.reportUser("user_a", { reportedUserId: "user_b", reason: "underage", note: "says 15" })
  assert.equal(urgent.replayed, false, "the new reason was accepted")
  assert.equal(urgent.report.reportId, first.report.reportId)
  assert.equal(urgent.report.reason, "underage")
  assert.equal(urgent.report.note, "says 15")
  const queue = await service.listPendingReportQueue({})
  assert.equal(queue.reports[0]?.reportId, first.report.reportId)
  assert.equal(queue.reports[0]?.reason, "underage")
  assert.equal((await service.getPendingReportQueueSummary()).countsByPriority.urgent, 1)
  assert.equal((await service.listReportsForActor("user_a")).length, 1)
})

test("one person can file at most 20 reports in 24 hours", async () => {
  let id = 0
  const service = createSafetyService({ idFactory: () => `report_${++id}` })
  const start = new Date("2026-10-01T10:00:00.000Z")
  assert.equal(MAX_REPORTS_PER_DAY, 20)
  for (let index = 0; index < MAX_REPORTS_PER_DAY; index += 1) {
    await service.reportUser("user_a", { reportedUserId: `target_${index}`, reason: "spam" },
      new Date(start.getTime() + index * 60_000))
  }
  await assert.rejects(
    () => service.reportUser("user_a", { reportedUserId: "target_over", reason: "spam" }, new Date(start.getTime() + 3_600_000)),
    (error) => error instanceof SafetyLimitError
  )
  assert.equal(await service.hasBlockBetween("user_a", "target_over"), false)
  // Another person is unaffected, and the window moves on.
  await service.reportUser("user_c", { reportedUserId: "target_over", reason: "spam" }, new Date(start.getTime() + 3_600_000))
  const nextDay = await service.reportUser("user_a", { reportedUserId: "target_over", reason: "spam" },
    new Date(start.getTime() + 24 * 3_600_000 + 60_000))
  assert.equal(nextDay.replayed, false)
})

test("blocking is never refused by a count: a user who already blocked many people can still block an abuser", async () => {
  const service = createSafetyService()
  for (let index = 0; index < 1000; index += 1) {
    await service.blockUser("user_a", `blocked_${index}`)
  }
  assert.equal((await service.blockUser("user_a", "abuser")).blockedUserId, "abuser")
  assert.equal(await service.hasBlockBetween("user_a", "abuser"), true)
  assert.equal((await service.blockUser("user_a", "blocked_7")).blockedUserId, "blocked_7")
})
