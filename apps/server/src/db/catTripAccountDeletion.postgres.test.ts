import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"
import { createPostgresCatTripRepository } from "./postgresCatTripRepository"

// Deleting an account row must take its cat trips (as owner or host), day
// plans and souvenirs with it; only the foreign keys can prove that.
test("deleting an account removes its cat trips, day plans and souvenirs", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const scope = Math.random().toString(36).slice(2, 8)
    const [leaver, friend] = [`leaver_${scope}`, `friend_${scope}`]
    for (const userId of [leaver, friend]) {
      await pool.query(
        `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [`account_${userId}`, userId, `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
      )
    }
    const repository = createPostgresCatTripRepository(pool)
    const at = (hour: number) => new Date(Date.UTC(2026, 9, 16, hour)).toISOString()
    const base = { dayKey: "2026-10-16", startsAt: at(8), endsAt: at(12), kind: "visit" as const, seedDigest: "0123456789abcdef", candidateCount: 1, planVersion: 1, createdAt: at(7) }
    await repository.planDay({ ownerUserId: leaver, dayKey: base.dayKey, seedDigest: base.seedDigest, plannedAt: at(7),
      trips: [{ ...base, tripId: `own_${scope}`, ownerUserId: leaver, hostUserId: friend, slot: 0 }] })
    await repository.planDay({ ownerUserId: friend, dayKey: base.dayKey, seedDigest: base.seedDigest, plannedAt: at(7),
      trips: [{ ...base, tripId: `hosted_${scope}`, ownerUserId: friend, hostUserId: leaver, slot: 0 }] })
    await repository.grantSouvenir({ souvenirId: `sv_${scope}`, ownerUserId: leaver, tripId: `own_${scope}`, key: "ribbon", rarity: "common", acquiredAt: at(12) })

    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [leaver])

    assert.equal(await repository.findTrip(`own_${scope}`), null)
    assert.equal(await repository.findTrip(`hosted_${scope}`), null, "a trip hosted by the deleted account goes too")
    assert.deepEqual(await repository.listSouvenirs(leaver, 10), [])
    assert.equal(await repository.isDayPlanned(leaver, base.dayKey), false)
    assert.equal(await repository.isDayPlanned(friend, base.dayKey), true, "the friend's day marker stays")
  } finally {
    await pool.end()
  }
})
