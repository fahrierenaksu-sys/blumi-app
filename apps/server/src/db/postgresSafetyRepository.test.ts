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
  assert.doesNotMatch(fake.calls[0]?.text ?? "", /actor_user_id|reported_user_id|report_id|note/i)
})
