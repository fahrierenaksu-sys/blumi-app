import assert from "node:assert/strict"
import test from "node:test"
import {
  getModerationQueueMetadata,
  orderPendingModerationReports,
  summarizePendingModerationQueue
} from "./moderationQueue"

test("underage reports receive an urgent operational target", () => {
  const createdAt = "2026-07-22T08:00:00.000Z"
  assert.deepEqual(
    getModerationQueueMetadata({ reason: "underage", createdAt, status: "pending" }, new Date("2026-07-22T10:00:00.000Z")),
    {
      priority: "urgent",
      targetMinutes: 240,
      dueAt: "2026-07-22T12:00:00.000Z",
      breached: false
    }
  )
})

test("resolved reports retain their target but are never marked breached", () => {
  assert.deepEqual(
    getModerationQueueMetadata({ reason: "spam", createdAt: "2026-07-20T08:00:00.000Z", status: "resolved" }, new Date("2026-07-22T10:00:00.000Z")),
    {
      priority: "standard",
      targetMinutes: 1440,
      dueAt: "2026-07-21T08:00:00.000Z",
      breached: false
    }
  )
})

test("pending queue puts breached urgent reports ahead of newer standard reports", () => {
  const ordered = orderPendingModerationReports(
    [
      {
        reportId: "standard-new",
        reason: "spam",
        createdAt: "2026-07-22T09:30:00.000Z",
        status: "pending"
      },
      {
        reportId: "urgent-breached",
        reason: "underage",
        createdAt: "2026-07-22T03:00:00.000Z",
        status: "pending"
      },
      {
        reportId: "high-open",
        reason: "harassment",
        createdAt: "2026-07-22T08:00:00.000Z",
        status: "pending"
      }
    ],
    new Date("2026-07-22T09:00:00.000Z")
  )

  assert.deepEqual(
    ordered.map((report) => report.reportId),
    ["urgent-breached", "high-open", "standard-new"]
  )
})

test("pending queue summary groups operational load without preserving report records", () => {
  const summary = summarizePendingModerationQueue(
    [
      { reason: "underage", createdAt: "2026-07-22T03:00:00.000Z", status: "pending" },
      { reason: "harassment", createdAt: "2026-07-22T08:00:00.000Z", status: "pending" },
      { reason: "spam", createdAt: "2026-07-21T08:00:00.000Z", status: "pending" },
      { reason: "fake_profile", createdAt: "2026-07-22T09:00:00.000Z", status: "resolved" }
    ],
    new Date("2026-07-22T10:00:00.000Z")
  )

  assert.deepEqual(summary, {
    countsByPriority: { urgent: 1, high: 1, standard: 1 },
    breachedCount: 2,
    oldestPendingCreatedAt: "2026-07-21T08:00:00.000Z",
    generatedAt: "2026-07-22T10:00:00.000Z"
  })
})
