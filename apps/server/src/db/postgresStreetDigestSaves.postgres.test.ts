import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { randomUUID } from "node:crypto"
import { withStreetDigestSaves } from "../street/streetDigestSaves"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresPersonalRoomDecorRepository } from "./postgresPersonalRoomDecorRepository"
import { createPostgresStreetSaveTransaction } from "./postgresStreetDigestSaves"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"

const BED = { instanceId: "bed_1", itemId: "room_v3_bed_oyun_gingham", x: 1, y: 1, rotation: "front" as const }

test("a room save and its street record commit together, and a failed save or record leaves neither", {
  skip: disposablePostgresSkip().skip
}, async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const userId = `street_${randomUUID()}`
  const input = (expectedRevision: number, placedItems: typeof BED[]) =>
    ({ userId, expectedRevision, updatedAt: new Date().toISOString(), decor: { roomShellId: "shell", placedItems } })
  const digestCount = async () => Number((await pool.query(
    "SELECT count(*) AS n FROM blumi_street_digests WHERE user_id = $1", [userId])).rows[0].n)
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,$1,NOW(),NOW())`, [userId])
    const runInTransaction = createPostgresStreetSaveTransaction(pool)
    const { roomRepository } = withStreetDigestSaves({
      authRepository: createPostgresAuthRepository(pool),
      roomRepository: createPostgresPersonalRoomDecorRepository(pool),
      runInTransaction,
      isStreetReady: async () => true
    })
    assert.equal((await roomRepository.save(input(0, []))).kind, "saved")

    // A failed save (stale revision) writes no change record.
    assert.equal((await roomRepository.save(input(9, [BED]))).kind, "conflict")
    assert.equal(await digestCount(), 0)

    // A failure after both writes rolls back the save and the record together.
    await assert.rejects(runInTransaction(async (unit) => {
      await unit.roomRepository.save(input(1, [BED]))
      await unit.streetRepository.recordRoomChange(userId, "bed", new Date(), 2)
      throw new Error("late failure")
    }), /late failure/)
    assert.equal(await digestCount(), 0)
    assert.equal((await createPostgresPersonalRoomDecorRepository(pool).get(userId))?.revision, 1)

    // A committed save carries its record.
    assert.equal((await roomRepository.save(input(1, [BED]))).kind, "saved")
    const row = (await pool.query("SELECT room_kind, room_revision FROM blumi_street_digests WHERE user_id = $1", [userId])).rows[0]
    assert.deepEqual({ kind: row?.room_kind, revision: row?.room_revision }, { kind: "bed", revision: 2 })
  } finally {
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await pool.end()
  }
})
