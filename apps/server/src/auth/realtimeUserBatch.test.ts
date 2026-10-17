import assert from "node:assert/strict"
import test from "node:test"
import { listAllowedRealtimeUserIds } from "./realtimeUserBatch"

test("one account read leaves out deleted, banned and still-suspended accounts", async () => {
  // Arrange
  const now = new Date("2026-10-17T08:00:00.000Z")
  const accounts = [
    { userId: "ok" },
    { userId: "banned", moderation: { status: "banned" } },
    { userId: "suspended", moderation: { status: "suspended", suspendedUntil: "2026-10-18T00:00:00.000Z" } },
    { userId: "expired", moderation: { status: "suspended", suspendedUntil: "2026-10-16T00:00:00.000Z" } },
    { userId: "warned", moderation: { status: "warned" } }
  ]
  let reads = 0
  const singleChecks: string[] = []
  // Act
  const allowed = await listAllowedRealtimeUserIds({
    repository: { findAccountsByUserIds: async (userIds) => {
      reads += 1
      return accounts.filter((account) => userIds.includes(account.userId)) as never
    } },
    isRealtimeUserAllowed: async (userId) => { singleChecks.push(userId); return true },
    userIds: ["ok", "banned", "suspended", "expired", "warned", "deleted"],
    now
  })
  // Assert
  assert.deepEqual([...allowed].sort(), ["expired", "ok", "warned"])
  assert.equal(reads, 1)
  assert.deepEqual(singleChecks, ["expired"], "only an expired suspension takes the restoring single check")
})
