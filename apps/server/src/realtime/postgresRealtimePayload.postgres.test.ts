import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresRealtimeFanout, purgeExpiredRealtimePayloads, REALTIME_FANOUT_CHANNEL } from "../db/postgresRealtimeFanout"
import type { RealtimeFanoutMessage } from "./realtimeFanout"

const databaseUrl = process.env.DATABASE_URL?.trim()
test("large ready payload roundtrips across PostgreSQL; expired/unknown refs are ignored and purged", { skip: !databaseUrl, timeout: 10_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const publisher = createPostgresRealtimeFanout(pool)
  const subscriber = createPostgresRealtimeFanout(pool)
  const messages: RealtimeFanoutMessage[] = []
  let received!: () => void
  const ready = new Promise<void>((resolve) => { received = resolve })
  const unsubscribe = await subscriber.subscribe((message) => { messages.push(message); if (messages.length === 2) received() })
  try {
    const large = { origin: "publisher", target: { kind: "user", userId: "user" },
      event: { type: "mini_room.ready", payload: { miniRoom: { decor: "x".repeat(20_000) }, mediaSession: {}, participants: [] } } } as unknown as RealtimeFanoutMessage
    await publisher.publish(large)
    const expired = randomUUID()
    await pool.query("INSERT INTO blumi_realtime_payload_refs(payload_id,payload,expires_at) VALUES($1,$2::jsonb,NOW()-INTERVAL '1 second')", [expired, JSON.stringify(large)])
    for (const ref of [expired, randomUUID()]) {
      await pool.query("SELECT pg_notify($1,$2)", [REALTIME_FANOUT_CHANNEL, JSON.stringify({ payloadRef: ref, version: 1 })])
    }
    const small = { ...large, event: { type: "safety.user_blocked", payload: { blockedUserId: "other" } } } as RealtimeFanoutMessage
    await publisher.publish(small)
    await ready
    assert.deepEqual(messages, [large, small])
    await purgeExpiredRealtimePayloads(pool)
    assert.equal((await pool.query("SELECT * FROM blumi_realtime_payload_refs WHERE payload_id=$1", [expired])).rows.length, 0)
    assert.equal((await pool.query("SELECT * FROM blumi_realtime_payload_refs")).rows.length, 1)
    const budget = await pool.query("SELECT used_bytes FROM blumi_realtime_payload_budget")
    const bytes = await pool.query("SELECT SUM(octet_length(payload::text)) AS total FROM blumi_realtime_payload_refs")
    assert.equal(budget.rows[0].used_bytes, bytes.rows[0].total)
  } finally { await unsubscribe(); await pool.end() }
})
