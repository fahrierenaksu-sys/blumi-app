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
  const blockedHost = createAccountRecord("+905559991303")
  try {
    const auth = createPostgresAuthRepository(pool)
    for (const account of [owner, host, blockedHost]) await auth.saveAccount(account)
    await pool.query(`INSERT INTO blumi_room_pets(pet_id,user_id,species_item_id,name,created_at,updated_at)
      VALUES('export-pet',$1,'pet_cat_blumi_v1','Pamuk',NOW(),NOW())`, [owner.userId])
    await pool.query("INSERT INTO blumi_cat_trip_prefs(user_id,push_enabled,updated_at) VALUES($1,true,NOW())", [owner.userId])
    await pool.query("INSERT INTO blumi_street_digests(user_id,window_closed) VALUES($1,true)", [owner.userId])
    const trip = (id: string, hostId: string, slot: number, startsAt: string, endsAt: string, extra: Record<string, string> = {}) =>
      pool.query(`INSERT INTO blumi_cat_trips(trip_id,owner_user_id,host_user_id,day_key,slot,starts_at,ends_at,kind,
          seed_digest,candidate_count,plan_version,created_at,owner_revealed_at,host_revealed_at,status,ended_at,end_reason)
        VALUES($1,$2,$3,$4::timestamptz::date,$5,$4,$6,'visit','0123456789abcdef',1,1,NOW(),$7,$8,$9,$10,$11)`,
      [id, owner.userId, hostId, startsAt, slot, endsAt, extra.ownerRevealed ?? null, extra.hostRevealed ?? null,
        extra.endReason ? "cancelled" : "scheduled", extra.endReason ? endsAt : null, extra.endReason ?? null])
    const past = (days: number, hours: number) => new Date(Date.now() - days * 86_400_000 + hours * 3_600_000).toISOString()
    await trip("revealed", host.userId, 0, past(5, 0), past(5, 2), { ownerRevealed: past(5, 3), hostRevealed: past(5, 1) })
    await trip("unrevealed", host.userId, 1, past(5, 4), past(5, 6))
    await trip("unmatched", host.userId, 0, past(4, 0), past(4, 2), { ownerRevealed: past(4, 3), hostRevealed: past(4, 1), endReason: "unmatch" })
    await trip("blocked", blockedHost.userId, 0, past(3, 0), past(3, 2), { ownerRevealed: past(3, 3), hostRevealed: past(3, 1) })
    await trip("future", host.userId, 0, past(-2, 0), past(-2, 2))
    await pool.query("INSERT INTO blumi_safety_blocks(actor_user_id,blocked_user_id,created_at) VALUES($1,$2,NOW())", [blockedHost.userId, owner.userId])
    await pool.query(`INSERT INTO blumi_cat_souvenirs(souvenir_id,owner_user_id,trip_id,souvenir_key,rarity,acquired_at)
      VALUES('export-souvenir',$1,'revealed','leaf','common',NOW())`, [owner.userId])
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
    const byId = (trips: Array<Record<string, unknown>>) => new Map(trips.map((entry) => [entry.trip_id, entry]))
    const mine = await read(owner)
    assert.equal(mine.roomPet.name, "Pamuk")
    assert.equal(mine.catTripPrefs.push_enabled, true)
    assert.equal(mine.streetWindow.window_closed, true)
    assert.equal(mine.catSouvenirs[0].souvenir_key, "leaf")
    const owned = byId(mine.catTrips)
    assert.equal(owned.has("future"), false, "a trip that has not started is left out")
    assert.equal(owned.get("revealed")?.host_user_id, host.userId, "the owner sees the host after the reveal")
    assert.equal(owned.get("unrevealed")?.host_user_id, null, "no reveal, no host")
    assert.equal(owned.get("unmatched")?.host_user_id, null, "an unmatch hides the host")
    assert.equal(owned.get("blocked")?.host_user_id, null, "a block hides the host")
    for (const entry of mine.catTrips) assert.equal(entry.owner_user_id, null, "the owner's own id is never a counterpart")
    const hosted = byId((await read(host)).catTrips)
    assert.equal(hosted.get("revealed")?.owner_user_id, owner.userId, "the host sees the owner after their reveal")
    assert.equal(hosted.get("revealed")?.host_user_id, null)
    assert.equal(hosted.get("unrevealed")?.owner_user_id, null)
    assert.equal(hosted.get("unmatched")?.owner_user_id, null)
    assert.equal(hosted.has("future"), false)
    assert.equal(byId((await read(blockedHost)).catTrips).get("blocked")?.owner_user_id, null)
    assert.equal((await read(host)).roomPet, null)
  } finally {
    await pool.query("DELETE FROM blumi_safety_blocks WHERE actor_user_id = $1", [blockedHost.userId]).catch(() => undefined)
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = ANY($1)", [[owner.userId, host.userId, blockedHost.userId]]).catch(() => undefined)
    await pool.end()
  }
})
