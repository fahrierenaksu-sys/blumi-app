import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

function createFakePool(rows: Record<string, unknown>[] = []) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        return { rows }
      }
    }
  }
}

test("postgres safety repository persists and removes scoped blocks", async () => {
  const fake = createFakePool([
    {
      actor_user_id: "user_a",
      blocked_user_id: "user_b",
      created_at: "2026-06-27T10:00:00.000Z"
    }
  ])
  const repository = createPostgresSafetyRepository(fake.pool)

  await repository.saveBlock({
    actorUserId: "user_a",
    blockedUserId: "user_b",
    createdAt: "2026-06-27T10:00:00.000Z"
  })
  const blocks = await repository.listBlocks("user_a")
  await repository.deleteBlock("user_a", "user_b")

  assert.equal(blocks[0]?.actorUserId, "user_a")
  assert.equal(blocks[0]?.blockedUserId, "user_b")
  assert.match(fake.calls[0].text, /INSERT INTO blumi_safety_blocks/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 2), ["user_a", "user_b"])
  assert.match(fake.calls[2].text, /DELETE FROM blumi_safety_blocks/)
  assert.deepEqual(fake.calls[2].values, ["user_a", "user_b"])
})

test("postgres safety repository batches two-way block lookups", async () => {
  const fake = createFakePool([
    { blocked_user_id: "blocked_by_viewer" },
    { blocked_user_id: "blocked_viewer" }
  ])
  const repository = createPostgresSafetyRepository(fake.pool)

  const blockedUserIds = await repository.listBlockedUserIdsBetween(
    "viewer",
    ["allowed", "blocked_by_viewer", "blocked_viewer"]
  )

  assert.deepEqual(blockedUserIds, [
    "blocked_by_viewer",
    "blocked_viewer"
  ])
  assert.match(fake.calls[0]?.text ?? "", /actor_user_id = \$1/)
  assert.match(fake.calls[0]?.text ?? "", /blocked_user_id = ANY\(\$2::text\[\]\)/)
  assert.deepEqual(fake.calls[0]?.values, [
    "viewer",
    ["allowed", "blocked_by_viewer", "blocked_viewer"]
  ])
})

test("postgres safety repository stores report details without leaking null notes", async () => {
  const fake = createFakePool([
    {
      report_id: "report_1",
      actor_user_id: "user_a",
      reported_user_id: "user_b",
      reason: "fake_profile",
      note: null,
      created_at: "2026-06-27T10:00:00.000Z",
      status: "pending"
    }
  ])
  const repository = createPostgresSafetyRepository(fake.pool)

  await repository.saveReport({
    reportId: "report_1",
    actorUserId: "user_a",
    reportedUserId: "user_b",
    reason: "fake_profile",
    createdAt: "2026-06-27T10:00:00.000Z",
    status: "pending"
  })
  const reports = await repository.listReportsForActor("user_a")

  assert.equal(reports[0]?.reportId, "report_1")
  assert.equal(reports[0]?.reason, "fake_profile")
  assert.equal("note" in reports[0], false)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_safety_reports/)
  assert.equal(fake.calls[0].values?.[4], null)
  assert.match(fake.calls[1].text, /ORDER BY created_at DESC/)
})

test("postgres report submission writes the report and automatic block through one transaction boundary", async () => {
  const calls: QueryCall[] = []
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, values })
      return { rows: [] }
    },
    release() {}
  }
  const repository = createPostgresSafetyRepository({
    async query() {
      throw new Error("pool query should not be used for the transaction")
    },
    async connect() {
      return client
    }
  })

  const result = await repository.saveReportAndBlock(
    {
      reportId: "report_atomic",
      actorUserId: "user_a",
      reportedUserId: "user_b",
      reason: "spam",
      idempotencyKey: "atomic-key-123456",
      createdAt: "2026-07-21T10:00:00.000Z",
      status: "pending"
    },
    {
      actorUserId: "user_a",
      blockedUserId: "user_b",
      createdAt: "2026-07-21T10:00:00.000Z"
    }
  )

  assert.equal(result.kind, "created")
  assert.equal(calls[0]?.text, "BEGIN")
  assert.match(calls[1]?.text ?? "", /pg_advisory_xact_lock/)
  assert.match(calls[3]?.text ?? "", /INSERT INTO blumi_safety_reports/)
  assert.match(calls[4]?.text ?? "", /INSERT INTO blumi_safety_blocks/)
  assert.equal(calls.at(-1)?.text, "COMMIT")
})

test("postgres safety repository lists and resolves admin reports", async () => {
  const fake = createFakePool([
    {
      report_id: "report_1",
      actor_user_id: "user_a",
      reported_user_id: "user_b",
      reason: "spam",
      note: "bad",
      created_at: "2026-06-27T10:00:00.000Z",
      status: "resolved",
      resolution_action: "warn",
      resolution_note: "sent warning",
      resolved_at: "2026-06-27T11:00:00.000Z",
      resolved_by_admin_id: "moderator-1",
      resolved_by_token_id: "token-1",
      resolution_suspended_until: "2026-07-04T11:00:00.000Z"
    }
  ])
  const repository = createPostgresSafetyRepository(fake.pool)

  const reports = await repository.listAllReports({
    status: "resolved",
    limit: 10
  })
  const report = await repository.findReport("report_1")
  await repository.resolveReport("report_1", {
    action: "dismiss",
    note: "not actionable",
    resolvedAt: "2026-06-27T12:00:00.000Z",
    resolvedByAdminId: "moderator-2",
    resolvedByTokenId: "token-2"
  })

  assert.equal(reports[0]?.status, "resolved")
  assert.equal(reports[0]?.resolution?.action, "warn")
  assert.equal(report?.resolution?.adminNote, "sent warning")
  assert.equal(report?.resolution?.resolvedByAdminId, "moderator-1")
  assert.equal(report?.resolution?.suspendedUntil, "2026-07-04T11:00:00.000Z")
  assert.match(fake.calls[0].text, /WHERE status = \$1/)
  assert.deepEqual(fake.calls[0].values, ["resolved", 10])
  assert.match(fake.calls[1].text, /resolution_suspended_until/)
  assert.match(fake.calls[2].text, /UPDATE blumi_safety_reports/)
  assert.match(fake.calls[2].text, /status = 'pending'/)
  assert.deepEqual(fake.calls[2].values?.slice(0, 4), [
    "report_1",
    "dismissed",
    "dismiss",
    "not actionable"
  ])
  assert.deepEqual(fake.calls[2].values?.slice(5), ["moderator-2", "token-2", null])
})

test("postgres safety repository aggregates pending workload without selecting report PII", async () => {
  const fake = createFakePool([
    {
      reason: "underage",
      pending_count: "2",
      breached_count: "1",
      oldest_pending_created_at: "2026-07-22T03:00:00.000Z"
    },
    {
      reason: "spam",
      pending_count: "3",
      breached_count: "0",
      oldest_pending_created_at: "2026-07-22T08:00:00.000Z"
    }
  ])
  const repository = createPostgresSafetyRepository(fake.pool)
  const breachedBeforeByReason = {
    spam: "2026-07-21T10:00:00.000Z",
    harassment: "2026-07-21T22:00:00.000Z",
    fake_profile: "2026-07-21T10:00:00.000Z",
    fake_or_bot: "2026-07-21T10:00:00.000Z",
    inappropriate: "2026-07-21T22:00:00.000Z",
    underage: "2026-07-22T06:00:00.000Z",
    other: "2026-07-21T10:00:00.000Z"
  } as const

  const summary = await repository.summarizePendingReports({
    breachedBeforeByReason
  })

  assert.deepEqual(summary, [
    {
      reason: "underage",
      pendingCount: 2,
      breachedCount: 1,
      oldestPendingCreatedAt: "2026-07-22T03:00:00.000Z"
    },
    {
      reason: "spam",
      pendingCount: 3,
      breachedCount: 0,
      oldestPendingCreatedAt: "2026-07-22T08:00:00.000Z"
    }
  ])
  assert.match(fake.calls[0]?.text ?? "", /WHERE status = 'pending'/)
  assert.match(fake.calls[0]?.text ?? "", /COUNT\(\*\) FILTER/)
  assert.doesNotMatch(fake.calls[0]?.text ?? "", /actor_user_id|reported_user_id|report_id|note/i)
  assert.equal(fake.calls[0]?.values?.length, 14)
})
