import assert from "node:assert/strict"
import test from "node:test"
import { getModerationQueueMetadata } from "./moderationQueue"

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
