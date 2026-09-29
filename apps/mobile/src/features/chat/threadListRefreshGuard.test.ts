import assert from "node:assert/strict"
import test from "node:test"
import { createMatchThreadSyncGate, createThreadListRefreshGuard } from "./threadListRefreshGuard"

test("a realtime list supersedes an older in-flight HTTP snapshot", () => {
  const guard = createThreadListRefreshGuard()
  const staleRequest = guard.beginHttpRefresh()
  guard.observeAuthoritativeThreadChange()
  assert.equal(guard.isCurrentHttpRefresh(staleRequest), false)
  const currentRequest = guard.beginHttpRefresh()
  assert.equal(guard.isCurrentHttpRefresh(currentRequest), true)
})

test("only the newest overlapping HTTP list may replace the store", () => {
  const guard = createThreadListRefreshGuard()
  const first = guard.beginHttpRefresh()
  const second = guard.beginHttpRefresh()
  assert.equal(guard.isCurrentHttpRefresh(first), false)
  assert.equal(guard.isCurrentHttpRefresh(second), true)
})

test("match recovery is rate-limited per session while ordinary list reads remain independent", () => {
  const gate = createMatchThreadSyncGate(60_000)
  assert.equal(gate.shouldStart("account-a:session-1", 100), true)
  assert.equal(gate.shouldStart("account-a:session-1", 5_100), false)
  assert.equal(gate.shouldStart("account-a:session-1", 60_100), true)
  assert.equal(gate.shouldStart("account-b:session-2", 60_101), true)
})
