import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { ROOM_PET_CAT_SPECIES_ID } from "@blumi/domain"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"
import { createPostgresRoomPetRepository } from "./postgresRoomPetRepository"

// Deleting an account row must take its room pet with it; only the foreign
// key can prove that. Another member's pet stays.
test("deleting an account removes its room pet and keeps other members' pets", disposablePostgresSkip(), async () => {
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
    const repository = createPostgresRoomPetRepository(pool)
    const createdAt = new Date(Date.UTC(2026, 9, 17, 9)).toISOString()
    for (const userId of [leaver, friend]) {
      const result = await repository.adopt({ petId: `pet_${userId}`, userId, speciesItemId: ROOM_PET_CAT_SPECIES_ID, name: "Pamuk", createdAt })
      assert.equal(result.outcome, "adopted")
    }

    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [leaver])

    assert.equal(await repository.findByUser(leaver), null)
    const left = await pool.query("SELECT count(*)::int AS count FROM blumi_room_pets WHERE user_id = $1", [leaver])
    assert.equal(left.rows[0]?.count, 0)
    assert.equal((await repository.findByUser(friend))?.name, "Pamuk", "the friend's pet stays")
  } finally {
    await pool.end()
  }
})

test("the database refuses a pet for an unknown account and a second pet for one account", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const scope = Math.random().toString(36).slice(2, 8)
    const createdAt = new Date(Date.UTC(2026, 9, 17, 9)).toISOString()
    const insert = (petId: string, userId: string) => pool.query(
      `INSERT INTO blumi_room_pets (pet_id, user_id, species_item_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, 'Pamuk', $4, $4)`,
      [petId, userId, ROOM_PET_CAT_SPECIES_ID, createdAt]
    )
    await assert.rejects(insert(`pet_ghost_${scope}`, `ghost_${scope}`), /foreign key/)
    const owner = `owner_${scope}`
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [`account_${owner}`, owner, `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
    )
    await insert(`pet_a_${scope}`, owner)
    await assert.rejects(insert(`pet_b_${scope}`, owner), /unique|duplicate/i)
  } finally {
    await pool.end()
  }
})
