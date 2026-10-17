import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresAccountDataExporter } from "./accountDataExporter"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createAccountRecord } from "../auth/authStore"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("real PostgreSQL export streams 100000 own messages from one stable snapshot", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const account = createAccountRecord("+905559991234")
  let largestBatch = 0
  try {
    await createPostgresAuthRepository(pool).saveAccount(account)
    await pool.query("INSERT INTO blumi_chat_threads(thread_id,mini_room_id,created_at) VALUES('export-thread','export-room',NOW())")
    await pool.query(`INSERT INTO blumi_chat_messages(message_id,thread_id,sender_user_id,body,sent_at)
      SELECT 'export-message-' || n, 'export-thread', $1, 'own text', NOW() FROM generate_series(1,100000) n`, [account.userId])
    const exporter = createPostgresAccountDataExporter({ query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect()
      return { release: () => client.release(), query: async (sql: string, values?: readonly unknown[]) => {
        const result = await client.query(sql, values ? [...values] : undefined)
        if (sql.startsWith("FETCH")) largestBatch = Math.max(largestBatch, result.rows.length)
        return result
      } }
    } })
    const iterator = exporter.streamExport(account, {
      schemaVersion: "2026-07-21", exportedAt: new Date().toISOString(), exclusions: []
    })[Symbol.asyncIterator]()
    const first = await iterator.next()
    assert.equal(first.done, false)
    await pool.query(`INSERT INTO blumi_chat_messages(message_id,thread_id,sender_user_id,body,sent_at)
      VALUES ('late-message','export-thread',$1,'outside snapshot',NOW())`, [account.userId])
    let count = 0
    let ending = ""
    for (;;) {
      const chunk = await iterator.next()
      if (chunk.done) break
      assert.doesNotMatch(chunk.value, /late-message|outside snapshot/)
      if (chunk.value.includes('"message_id"')) count += 1
      ending = chunk.value
    }
    assert.equal(count, 100_000)
    // The memory bound: rows are fetched in batches of at most 500.
    assert.ok(largestBatch > 0 && largestBatch <= 500, `largest batch ${largestBatch}`)
    assert.equal(ending, "}}\n")
  } finally {
    await pool.end()
  }
})

test("real PostgreSQL export includes the pet, cat switches, trips, souvenirs and street window", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const owner = createAccountRecord("+905559991301")
  const host = createAccountRecord("+905559991302")
  try {
    const auth = createPostgresAuthRepository(pool)
    await auth.saveAccount(owner)
    await auth.saveAccount(host)
    await pool.query(`INSERT INTO blumi_room_pets(pet_id,user_id,species_item_id,name,created_at,updated_at)
      VALUES('export-pet',$1,'pet_cat_blumi_v1','Pamuk',NOW(),NOW())`, [owner.userId])
    await pool.query("INSERT INTO blumi_cat_trip_prefs(user_id,push_enabled,updated_at) VALUES($1,true,NOW())", [owner.userId])
    await pool.query("INSERT INTO blumi_street_digests(user_id,window_closed) VALUES($1,true)", [owner.userId])
    await pool.query(`INSERT INTO blumi_cat_trips(trip_id,owner_user_id,host_user_id,day_key,slot,starts_at,ends_at,kind,
        seed_digest,candidate_count,plan_version,created_at)
      VALUES('export-trip',$1,$2,'2026-10-16',0,'2026-10-16T08:00Z','2026-10-16T10:00Z','visit','0123456789abcdef',1,1,NOW())`,
    [owner.userId, host.userId])
    await pool.query(`INSERT INTO blumi_cat_souvenirs(souvenir_id,owner_user_id,trip_id,souvenir_key,rarity,acquired_at)
      VALUES('export-souvenir',$1,'export-trip','leaf','common',NOW())`, [owner.userId])
    const exporter = createPostgresAccountDataExporter({ query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect()
      return { release: () => client.release(), query: (sql: string, values?: readonly unknown[]) =>
        client.query(sql, values ? [...values] : undefined) }
    } })
    const read = async (account: typeof owner) => {
      let json = ""
      for await (const chunk of exporter.streamExport(account, { schemaVersion: "2026-07-21", exportedAt: new Date().toISOString(), exclusions: [] })) json += chunk
      return JSON.parse(json).data
    }
    const mine = await read(owner)
    assert.equal(mine.roomPet.name, "Pamuk")
    assert.equal(mine.catTripPrefs.push_enabled, true)
    assert.equal(mine.streetWindow.window_closed, true)
    assert.equal(mine.catTrips[0].role, "owner")
    assert.equal(mine.catSouvenirs[0].souvenir_key, "leaf")
    const hosted = await read(host)
    assert.equal(hosted.catTrips[0].role, "host")
    assert.equal(hosted.catTrips[0].owner_user_id, null, "the host learns the owner only after the reveal")
    assert.equal(hosted.roomPet, null)
  } finally {
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = ANY($1)", [[owner.userId, host.userId]]).catch(() => undefined)
    await pool.end()
  }
})
