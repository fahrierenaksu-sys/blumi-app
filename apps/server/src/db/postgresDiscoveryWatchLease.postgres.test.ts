import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresMatchRepository } from "./postgresMatchRepository"

test("F45 stale discovery-watch claims cannot resurrect cancellation or overwrite new preferences", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const repository = createPostgresMatchRepository(pool)
  const userId = `watch_${randomUUID()}`
  const now = new Date("2026-09-05T12:00:00.000Z")
  const watch = (ageMin: number, updatedAt = now) => ({
    userId,
    status: "active" as const,
    preferences: { ageMin, ageMax: 99, genders: ["woman" as const], vibes: ["coffee"] },
    updatedAt: updatedAt.toISOString(),
    expiresAt: new Date(updatedAt.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()
  })

  try {
    await pool.query(
      `INSERT INTO blumi_accounts(account_id, user_id, phone_number, created_at, updated_at)
       VALUES($1, $1, $1, NOW(), NOW())`,
      [userId]
    )

    await repository.upsertDiscoveryWatch(watch(18))
    const cancelledClaim = await repository.claimNextDiscoveryWatch(now)
    assert.ok(cancelledClaim)
    await repository.deleteDiscoveryWatch(userId)
    await repository.restoreDiscoveryWatch(cancelledClaim)
    assert.equal(await repository.findDiscoveryWatch(userId), null)

    await repository.upsertDiscoveryWatch(watch(18))
    const staleClaim = await repository.claimNextDiscoveryWatch(now)
    assert.ok(staleClaim)
    await repository.upsertDiscoveryWatch(watch(30, new Date(now.getTime() + 1_000)))
    await repository.restoreDiscoveryWatch(staleClaim)
    assert.equal((await repository.findDiscoveryWatch(userId))?.preferences.ageMin, 30)
    assert.equal(await repository.completeDiscoveryWatch(staleClaim), false)

    const currentClaim = await repository.claimNextDiscoveryWatch(new Date(now.getTime() + 2_000))
    assert.ok(currentClaim)
    assert.equal(await repository.isDiscoveryWatchClaimCurrent(currentClaim, new Date(now.getTime() + 2_000)), true)
    assert.equal(await repository.claimNextDiscoveryWatch(new Date(now.getTime() + 59_000)), null)
    const reclaimed = await repository.claimNextDiscoveryWatch(new Date(now.getTime() + 63_000))
    assert.ok(reclaimed)
    assert.notEqual(reclaimed.claimToken, currentClaim.claimToken)
    assert.equal(await repository.completeDiscoveryWatch(currentClaim), false)
    assert.equal(await repository.completeDiscoveryWatch(reclaimed), true)
  } finally {
    await pool.end()
  }
})
