import assert from "node:assert/strict"
import test from "node:test"
import { performance } from "node:perf_hooks"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { createAdminAnalyticsService } from "./adminAnalyticsService"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("analytics uses the migrated PostgreSQL schema, exact rolling buckets and a five-minute heavy cache", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  let clock = new Date("2026-09-28T10:00:00.000Z")
  try {
    await pool.query(`INSERT INTO blumi_accounts
      (account_id, user_id, phone_number, display_name, age, created_at, updated_at, onboarding_profile_complete)
      VALUES
      ('a_recent', 'u_recent', '+15550000001', 'Recent', 21, '2026-09-28T09:00:00Z', '2026-09-28T09:00:00Z', true),
      ('a_old', 'u_old', '+15550000002', 'Old', 22, '2026-09-20T09:00:00Z', '2026-09-20T09:00:00Z', false),
      ('a_future', 'u_future', '+15550000003', 'Future', 23, '2026-09-29T10:00:00Z', '2026-09-29T10:00:00Z', true)`)
    await pool.query(`INSERT INTO blumi_discovery_decisions
      (from_user_id, to_user_id, decision, decided_at)
      VALUES ('u_recent', 'u_old', 'like', '2026-09-28T09:10:00Z')`)
    await pool.query(`INSERT INTO blumi_matches
      (match_id, participant_a_user_id, participant_b_user_id, matched_at)
      VALUES ('m_recent', 'u_recent', 'u_old', '2026-09-28T09:20:00Z')`)
    await pool.query(`INSERT INTO blumi_chat_threads (thread_id, mini_room_id, created_at)
      VALUES ('t_recent', 'room_recent', '2026-09-28T09:20:00Z')`)
    await pool.query(`INSERT INTO blumi_chat_messages
      (message_id, thread_id, sender_user_id, body, sent_at)
      VALUES ('msg_recent', 't_recent', 'u_recent', 'synthetic', '2026-09-28T09:30:00Z')`)
    await pool.query(`INSERT INTO blumi_safety_reports
      (report_id, actor_user_id, reported_user_id, reason, created_at)
      VALUES ('report_old', 'u_recent', 'u_old', 'spam', '2026-09-28T05:00:00Z')`)

    const service = createAdminAnalyticsService({ pool, environment: "isolated-test", now: () => clock })
    const started = performance.now()
    const first = await service.snapshot("24h", { users: 1, connections: 2 })
    const elapsed = Math.round(performance.now() - started)
    assert.ok(elapsed < 5000, `synthetic analytics snapshot took ${elapsed}ms`)
    assert.equal(first.activity?.registrations, 1)
    assert.equal(first.activity?.matches, 1)
    assert.equal(first.activity?.messages, 1)
    assert.equal(first.activity?.roomInvites, 0)
    assert.equal(first.activity?.roomJoins, 0)
    assert.equal(first.activity?.shopTransactions, 0)
    assert.equal(first.activity?.purchaseCredits, 0)
    assert.equal(first.activity?.purchaseReversals, 0)
    assert.equal(first.funnel?.registered, 1)
    assert.equal(first.funnel?.profileComplete, 1)
    assert.equal(first.funnel?.discovered, 1)
    assert.equal(first.funnel?.messaged, 1)
    assert.equal(first.safety?.pending, 1)
    assert.equal(first.safety?.overdue, 1)
    assert.equal(first.trend?.length, 24)
    assert.equal(first.trend?.reduce((sum, bucket) => sum + bucket.registrations, 0), first.activity?.registrations)
    assert.equal(first.trend?.reduce((sum, bucket) => sum + bucket.matches, 0), first.activity?.matches)
    assert.equal(first.trend?.reduce((sum, bucket) => sum + bucket.messages, 0), first.activity?.messages)

    clock = new Date("2026-09-28T10:01:00.000Z")
    await pool.query(`INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
      VALUES ('a_new', 'u_new', '+15550000004', '2026-09-28T10:00:30Z', '2026-09-28T10:00:30Z')`)
    await pool.query(`INSERT INTO blumi_safety_reports
      (report_id, actor_user_id, reported_user_id, reason, created_at)
      VALUES ('report_new', 'u_new', 'u_old', 'spam', '2026-09-28T10:00:30Z')`)
    const cached = await service.snapshot("24h", { users: 2, connections: 3 })
    assert.equal(cached.activity?.registrations, 1)
    assert.equal(cached.activityUpdatedAt, first.activityUpdatedAt)
    assert.equal(cached.safety?.pending, 2)
    assert.equal(cached.safetyUpdatedAt, clock.toISOString())
    assert.equal(cached.online.users, 2)

    clock = new Date("2026-09-28T10:05:01.000Z")
    const refreshed = await service.snapshot("24h", { users: 2, connections: 3 })
    assert.equal(refreshed.activity?.registrations, 2)
    assert.notEqual(refreshed.activityUpdatedAt, first.activityUpdatedAt)
    assert.equal(refreshed.trend?.reduce((sum, bucket) => sum + bucket.registrations, 0), 2)
    const sevenDays = await service.snapshot("7d", { users: 0, connections: 0 })
    assert.equal(sevenDays.trend?.length, 7)
    assert.equal(sevenDays.activity?.registrations, 2)
    const thirtyDays = await service.snapshot("30d", { users: 0, connections: 0 })
    assert.equal(thirtyDays.trend?.length, 30)
    assert.equal(thirtyDays.activity?.registrations, 3)
    assert.equal(thirtyDays.funnel?.registered, 3)
    console.log(`isolated analytics snapshot: ${elapsed}ms; no production data queried`)
  } finally {
    await pool.end()
  }
})
