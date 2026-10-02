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
    "blumi_account_recovery_requests",
    "blumi_chat_delivery_outbox",
    "blumi_media_revocations",
    "blumi_notification_policy_audit",
    "blumi_notification_policy_events",
    "blumi_push_delivery_audit",
    "blumi_push_receipts",
    "blumi_sessions"
  ])
})

test("dead session families and stale media revocations are purged, live ones kept", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const accountId = `acct_${suffix}`
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id, user_id, phone_number, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())`, [accountId, `user_${suffix}`, "+905550000001"])
    const session = (name: string, expires: string, familyExpires: string | null, rotated: boolean) => pool.query(
      `INSERT INTO blumi_sessions(session_token_hash, session_id, account_id, user_id, expires_at, family_expires_at, rotated_at)
       VALUES ($1, $1, $2, $3, NOW() + $4::interval, NOW() + $5::interval, CASE WHEN $6 THEN NOW() - INTERVAL '100 days' END)`,
      [`${name}_${suffix}`, accountId, `user_${suffix}`, expires, familyExpires, rotated])
    // A family that ended 10 days ago: both its rotated and its last row go.
    await session("dead_rotated", "-100 days", "-10 days", true)
    await session("dead_last", "-10 days", "-10 days", false)
    // An open family keeps its rotated rows for reuse detection.
    await session("open_rotated", "-30 days", "+30 days", true)
    await session("open_live", "+20 days", "+30 days", false)
    // Before migration 068: an expired unrotated row goes, a rotated one stays.
    await session("legacy_expired", "-8 days", null, false)
    await session("legacy_rotated", "-30 days", null, true)
    await session("legacy_live", "+5 days", null, false)

    await pool.query(`INSERT INTO blumi_media_revocations(room_name, user_id, available_at, completed_at) VALUES
      ($1, 'a', NOW() - INTERVAL '8 days', NULL),
      ($1, 'b', NOW() - INTERVAL '1 day', NULL)`, [`room_${suffix}`])

    const result = await createPostgresRetentionService(pool).purgeExpired()
    assert.equal(result.blumi_sessions, 3)
    assert.deepEqual((await pool.query(
      "SELECT session_token_hash FROM blumi_sessions WHERE account_id = $1 ORDER BY 1", [accountId]
    )).rows.map((row) => String(row.session_token_hash).replace(`_${suffix}`, "")),
    ["legacy_live", "legacy_rotated", "open_live", "open_rotated"])
    assert.deepEqual((await pool.query(
      "SELECT user_id FROM blumi_media_revocations WHERE room_name = $1", [`room_${suffix}`]
    )).rows.map((row) => row.user_id), ["b"])
  } finally {
    await pool.query("DELETE FROM blumi_media_revocations WHERE room_name = $1", [`room_${suffix}`])
    await pool.query("DELETE FROM blumi_accounts WHERE account_id = $1", [accountId])
    await pool.end()
  }
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

test("only long-rejected recovery requests are purged", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  try {
    await pool.query(`INSERT INTO blumi_account_recovery_requests(request_id, new_phone_number, status, created_at, resolved_at) VALUES
      ($1 || '_rejected_old', '+905550000002', 'rejected', NOW() - INTERVAL '120 days', NOW() - INTERVAL '100 days'),
      ($1 || '_rejected_new', '+905550000003', 'rejected', NOW() - INTERVAL '120 days', NOW() - INTERVAL '10 days'),
      ($1 || '_review_old', '+905550000004', 'manual_review_required', NOW() - INTERVAL '120 days', NOW() - INTERVAL '100 days'),
      ($1 || '_pending_old', '+905550000005', 'pending', NOW() - INTERVAL '120 days', NULL)`, [suffix])
    await createPostgresRetentionService(pool).purgeExpired()
    assert.deepEqual((await pool.query(
      "SELECT request_id FROM blumi_account_recovery_requests WHERE request_id LIKE $1 ORDER BY 1", [`${suffix}%`]
    )).rows.map((row) => String(row.request_id).slice(suffix.length + 1)), ["pending_old", "rejected_new", "review_old"])
  } finally {
    await pool.query("DELETE FROM blumi_account_recovery_requests WHERE request_id LIKE $1", [`${suffix}%`])
    await pool.end()
  }
})
