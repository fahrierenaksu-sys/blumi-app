import assert from "node:assert/strict"
import test from "node:test"
import {
  PENDING_INVITE_TTL_MS,
  filterUnexpiredPendingInvites,
  mergeRestoredPendingInvites,
  resolveNextPendingInviteExpiryDelay,
  resolvePendingInviteRemainingSeconds,
  resolvePendingInviteStripTitle,
  upsertPendingInvite
} from "./pendingInviteModel"

const invite = (userId: string, sentAt: number, displayName = `${userId} Last`) => ({
  userId,
  displayName,
  sentAt
})

test("legacy invites expire after thirty seconds", () => {
  assert.equal(PENDING_INVITE_TTL_MS, 30_000)
  const invites = [invite("a", 0), invite("b", 10_000)]
  assert.deepEqual(filterUnexpiredPendingInvites(invites, 29_999).map((entry) => entry.userId), ["a", "b"])
  assert.deepEqual(filterUnexpiredPendingInvites(invites, 30_000).map((entry) => entry.userId), ["b"])
  assert.deepEqual(filterUnexpiredPendingInvites(invites, 40_000), [])
})

test("the expiry timer targets the earliest invite plus one frame and never fires sooner than a frame", () => {
  const invites = [invite("a", 1_000), invite("b", 500)]
  assert.equal(resolveNextPendingInviteExpiryDelay(invites, 10_000), 500 + 30_000 - 10_000 + 16)
  assert.equal(resolveNextPendingInviteExpiryDelay(invites, 60_000), 16)
})

test("the countdown shows whole remaining seconds of the soonest invite, floored at zero", () => {
  assert.equal(resolvePendingInviteRemainingSeconds([], 0), 0)
  assert.equal(resolvePendingInviteRemainingSeconds([invite("a", 0), invite("b", 5_000)], 1), 30)
  assert.equal(resolvePendingInviteRemainingSeconds([invite("a", 0)], 29_001), 1)
  assert.equal(resolvePendingInviteRemainingSeconds([invite("a", 0)], 45_000), 0)
})

test("the strip names one invitee by first name or counts several", () => {
  assert.equal(resolvePendingInviteStripTitle([invite("a", 0, "Ayla Deniz")]), "Ayla has your room invite")
  assert.equal(
    resolvePendingInviteStripTitle([invite("a", 0), invite("b", 0), invite("c", 0)]),
    "3 room invites are out"
  )
})

test("restored invites win over in-memory duplicates and keep newer local ones", () => {
  const merged = mergeRestoredPendingInvites(
    [invite("a", 5)],
    [invite("a", 1), invite("b", 2)]
  )
  assert.deepEqual(merged, [invite("a", 5), invite("b", 2)])
})

test("recording an invite replaces the previous one for the same person at the end", () => {
  const next = upsertPendingInvite([invite("a", 1), invite("b", 2)], invite("a", 9))
  assert.deepEqual(next, [invite("b", 2), invite("a", 9)])
})
