import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresRetentionService, RETENTION_POLICIES } from "./postgresRetention"

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }

function openPool(): Pool {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
}

async function count(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  return Number((await pool.query(sql, values)).rows[0]?.count ?? 0)
}

test("retention removes only finished work and audit rows older than their window, in bounded batches", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  try {
    // Chat delivery jobs: completed long ago, completed recently, still pending.
    await pool.query("INSERT INTO blumi_chat_threads(thread_id, mini_room_id, created_at) VALUES ($1, $1, NOW())", [`t_${suffix}`])
    const messages = ["old_done", "new_done", "old_pending"].map((kind) => `${kind}_${suffix}`)
    for (const id of messages) {
      await pool.query(`INSERT INTO blumi_chat_messages(message_id, thread_id, sender_user_id, body, sent_at)
        VALUES ($1, $2, 'u', 'hi', NOW() - INTERVAL '90 days')`, [id, `t_${suffix}`])
    }
    await pool.query(`INSERT INTO blumi_chat_delivery_outbox(message_id, completed_at) VALUES
      ($1, NOW() - INTERVAL '31 days'), ($2, NOW() - INTERVAL '1 hour'), ($3, NULL)`, messages)

    // Push receipts: finished and old, finished and recent, unfinished and old.
    await pool.query(`INSERT INTO blumi_push_receipts(ticket_id, delivery_id, user_id, push_token, registration_id, created_at, available_at, outcome)
      VALUES ($1,'d','u','tok','r',NOW() - INTERVAL '8 days',NOW(),'provider_handoff'),
             ($2,'d','u','tok','r',NOW() - INTERVAL '1 day',NOW(),'rejected'),
             ($3,'d','u','tok','r',NOW() - INTERVAL '8 days',NOW(),NULL)`,
    [`r_old_${suffix}`, `r_new_${suffix}`, `r_open_${suffix}`])

    // Audits: 2500 old rows (more than one batch) and one recent row each.
    await pool.query(`INSERT INTO blumi_push_delivery_audit(delivery_id, attempt, outcome, occurred_at)
      SELECT $1, 1, 'sent', NOW() - INTERVAL '31 days' FROM generate_series(1, 2500)`, [`a_${suffix}`])
    await pool.query(`INSERT INTO blumi_push_delivery_audit(delivery_id, attempt, outcome, occurred_at)
      VALUES ($1, 1, 'sent', NOW())`, [`a_${suffix}`])
    await pool.query(`INSERT INTO blumi_notification_policy_audit(user_id, notification_type, reason, dedupe_key, occurred_at)
      SELECT $1, 'message', 'queued', 'k' || n, NOW() - INTERVAL '31 days' FROM generate_series(1, 2500) n`, [`p_${suffix}`])
    await pool.query(`INSERT INTO blumi_notification_policy_audit(user_id, notification_type, reason, dedupe_key, occurred_at)
      VALUES ($1, 'message', 'queued', 'recent', NOW())`, [`p_${suffix}`])

    const result = await createPostgresRetentionService(pool, { batchSize: 1000, maxBatches: 10 }).purgeExpired()
    assert.equal(result.blumi_push_delivery_audit, 2500)
    assert.equal(result.blumi_notification_policy_audit, 2500)

    assert.deepEqual((await pool.query(
      "SELECT message_id FROM blumi_chat_delivery_outbox WHERE message_id = ANY($1) ORDER BY message_id", [messages]
    )).rows.map((row) => row.message_id), [messages[2], messages[1]].sort())
    assert.deepEqual((await pool.query(
      "SELECT ticket_id FROM blumi_push_receipts WHERE ticket_id LIKE $1 ORDER BY ticket_id", [`%${suffix}`]
    )).rows.map((row) => row.ticket_id), [`r_new_${suffix}`, `r_open_${suffix}`])
    assert.equal(await count(pool, "SELECT count(*) FROM blumi_push_delivery_audit WHERE delivery_id = $1", [`a_${suffix}`]), 1)
    assert.equal(await count(pool, "SELECT count(*) FROM blumi_notification_policy_audit WHERE user_id = $1", [`p_${suffix}`]), 1)
    // Messages themselves are never touched by retention.
    assert.equal(await count(pool, "SELECT count(*) FROM blumi_chat_messages WHERE thread_id = $1", [`t_${suffix}`]), 3)

    // A tick is bounded: with a tiny budget it stops early and resumes later.
    await pool.query(`INSERT INTO blumi_push_delivery_audit(delivery_id, attempt, outcome, occurred_at)
      SELECT $1, 1, 'sent', NOW() - INTERVAL '31 days' FROM generate_series(1, 30)`, [`b_${suffix}`])
    const bounded = await createPostgresRetentionService(pool, { batchSize: 10, maxBatches: 2 }).purgeExpired()
    assert.equal(bounded.blumi_push_delivery_audit, 20)
    assert.equal(await count(pool, "SELECT count(*) FROM blumi_push_delivery_audit WHERE delivery_id = $1", [`b_${suffix}`]), 10)
  } finally {
    await pool.end()
  }
})

test("retention policies never name a table that holds user content", () => {
  const tables = RETENTION_POLICIES.map((policy) => policy.table).sort()
  // Idempotency claims appear only with a window far beyond any retry
  // (chat outbox tombstones, message and like push claims: 30 days).
  assert.deepEqual(tables, [
    "blumi_chat_delivery_outbox",
    "blumi_notification_policy_audit",
    "blumi_notification_policy_events",
    "blumi_push_delivery_audit",
    "blumi_push_receipts"
  ])
})

test("push dedupe claims expire only for per-event message and like keys", requirePostgres, async () => {
  const pool = openPool()
  const user = `ret_${randomUUID()}`
  try {
    await pool.query(`INSERT INTO blumi_notification_policy_events(user_id, notification_type, dedupe_key, created_at) VALUES
      ($1, 'message', 'message:old', NOW() - INTERVAL '31 days'),
      ($1, 'message', 'message:new', NOW() - INTERVAL '1 day'),
      ($1, 'like', 'like:old', NOW() - INTERVAL '31 days'),
      ($1, 'match', 'match:old', NOW() - INTERVAL '400 days'),
      ($1, 'discovery_watch', 'discovery_watch:old', NOW() - INTERVAL '400 days')`, [user])
    await createPostgresRetentionService(pool).purgeExpired()
    assert.deepEqual((await pool.query(
      "SELECT dedupe_key FROM blumi_notification_policy_events WHERE user_id = $1 ORDER BY dedupe_key", [user]
    )).rows.map((row) => row.dedupe_key), ["discovery_watch:old", "match:old", "message:new"])
  } finally {
    await pool.query("DELETE FROM blumi_notification_policy_events WHERE user_id = $1", [user])
    await pool.end()
  }
})
