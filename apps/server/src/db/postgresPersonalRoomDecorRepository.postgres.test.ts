import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { randomUUID } from "node:crypto"
import { createPostgresPersonalRoomDecorRepository } from "./postgresPersonalRoomDecorRepository"

test("F49 saved decor advances and two PostgreSQL clients cannot overwrite the same revision", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use isolated postgres-gate")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const first = await pool.connect()
  const second = await pool.connect()
  const userId = `decor_${randomUUID()}`
  const input = (expectedRevision: number, roomShellId: string) => ({ userId, expectedRevision, updatedAt: new Date().toISOString(), decor: { roomShellId, placedItems: [] } })
  try {
    await first.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,$1,NOW(),NOW())`, [userId])
    const a = createPostgresPersonalRoomDecorRepository(first)
    const b = createPostgresPersonalRoomDecorRepository(second)
    assert.equal((await a.save(input(0, "initial"))).kind, "saved")
    const results = await Promise.all([a.save(input(1, "left")), b.save(input(1, "right"))])
    assert.equal(results.filter((result) => result.kind === "saved").length, 1)
    assert.equal(results.filter((result) => result.kind === "conflict").length, 1)
    const current = await a.get(userId)
    assert.equal(current?.revision, 2)
    assert.equal((await b.save(input(1, "stale"))).kind, "conflict")
    assert.deepEqual(await b.get(userId), current)
    const next = await a.save(input(2, "third"))
    assert.equal(next.kind, "saved")
    assert.equal((await a.get(userId))?.revision, 3)
  } finally { first.release(); second.release(); await pool.end() }
})
