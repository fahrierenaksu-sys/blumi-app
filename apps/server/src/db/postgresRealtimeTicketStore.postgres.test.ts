import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresRealtimeTicketStore } from "./postgresRealtimeTicketStore"

const databaseUrl = process.env.DATABASE_URL?.trim()
const PARALLEL_CONSUMERS = 20

function digest(): string {
  return randomBytes(32).toString("hex")
}

test("a ticket raced by parallel upgrades is consumed exactly once", { skip: !databaseUrl, timeout: 10_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: PARALLEL_CONSUMERS })
  try {
    const store = createPostgresRealtimeTicketStore(pool)
    const ticketDigest = digest()
    const sessionTokenHash = "a".repeat(64)
    assert.equal(await store.issue({ digest: ticketDigest, sessionTokenHash, expiresAtMs: Date.now() + 30_000 }), true)
    const results = await Promise.all(
      Array.from({ length: PARALLEL_CONSUMERS }, () => store.consume(ticketDigest, new Date()))
    )
    assert.deepEqual(results.filter((result) => result !== null), [sessionTokenHash])
    assert.equal(await store.consume(ticketDigest, new Date()), null, "replay after the race")
  } finally {
    await pool.end()
  }
})

test("parallel issue of one digest stores it once and never overwrites the owner", { skip: !databaseUrl, timeout: 10_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 })
  try {
    const store = createPostgresRealtimeTicketStore(pool)
    const ticketDigest = digest()
    const owners = Array.from({ length: 10 }, (_, index) => String(index).repeat(64).slice(0, 64))
    const issued = await Promise.all(owners.map((sessionTokenHash) =>
      store.issue({ digest: ticketDigest, sessionTokenHash, expiresAtMs: Date.now() + 30_000 })))
    assert.equal(issued.filter(Boolean).length, 1)
    const winner = owners[issued.indexOf(true)]
    assert.equal(await store.consume(ticketDigest, new Date()), winner)
  } finally {
    await pool.end()
  }
})

test("an expired ticket never authenticates and is collected by the bounded purge", { skip: !databaseUrl, timeout: 10_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const store = createPostgresRealtimeTicketStore(pool)
    const expired = digest()
    const valid = digest()
    const now = Date.now()
    await store.issue({ digest: expired, sessionTokenHash: "b".repeat(64), expiresAtMs: now - 1 })
    await store.issue({ digest: valid, sessionTokenHash: "c".repeat(64), expiresAtMs: now + 30_000 })
    assert.equal(await store.consume(expired, new Date(now)), null)
    // Expiry is exclusive: a ticket is dead at exactly its expiry instant.
    const boundary = digest()
    await store.issue({ digest: boundary, sessionTokenHash: "d".repeat(64), expiresAtMs: now + 5_000 })
    assert.equal(await store.consume(boundary, new Date(now + 5_000)), null)
    assert.ok(await store.purgeExpired(new Date(now + 5_000), 1000) >= 2)
    const remaining = await pool.query(
      "SELECT ticket_digest FROM blumi_realtime_tickets WHERE ticket_digest = ANY($1::text[])",
      [[expired, valid, boundary]]
    )
    assert.deepEqual(remaining.rows.map((row) => row.ticket_digest), [valid])
    assert.equal(await store.consume(valid, new Date(now)), "c".repeat(64))
  } finally {
    await pool.end()
  }
})
