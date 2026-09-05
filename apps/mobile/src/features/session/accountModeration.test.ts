import assert from "node:assert/strict"
import test from "node:test"
import {
  needsModerationInterruption,
  normalizeAccountModeration
} from "./accountModeration"

test("normalizes active, warned, suspended, and banned account moderation states", () => {
  const warned = normalizeAccountModeration({
    status: "warned",
    updatedAt: "2026-07-21T08:00:00.000Z"
  })
  const suspended = normalizeAccountModeration({
    status: "suspended",
    updatedAt: "2026-07-21T08:00:00.000Z",
    suspendedUntil: "2026-07-28T08:00:00.000Z"
  })

  assert.equal(warned?.status, "warned")
  assert.equal(needsModerationInterruption(warned), true)
  assert.equal(suspended?.suspendedUntil, "2026-07-28T08:00:00.000Z")
  assert.equal(needsModerationInterruption({
    status: "active",
    updatedAt: "2026-07-21T08:00:00.000Z"
  }), false)
})

test("rejects malformed and contradictory moderation payloads", () => {
  assert.equal(normalizeAccountModeration({ status: "paused" }), null)
  assert.equal(normalizeAccountModeration({
    status: "suspended",
    updatedAt: "not-a-date",
    suspendedUntil: "2026-07-28T08:00:00.000Z"
  }), null)
  assert.equal(normalizeAccountModeration({
    status: "banned",
    updatedAt: "2026-07-21T08:00:00.000Z",
    suspendedUntil: "2026-07-28T08:00:00.000Z"
  }), null)
})
