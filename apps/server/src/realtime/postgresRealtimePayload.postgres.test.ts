import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresRealtimeFanout, purgeExpiredRealtimePayloads, REALTIME_FANOUT_CHANNEL } from "../db/postgresRealtimeFanout"
import type { RealtimeFanoutMessage } from "./realtimeFanout"

const databaseUrl = process.env.DATABASE_URL?.trim()
test("large payload roundtrips; expired/unknown refs signal gaps and recover", { skip: !databaseUrl, timeout: 10_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const publisher = createPostgresRealtimeFanout(pool)
  const subscriber = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 0 })
  const messages: RealtimeFanoutMessage[] = []
  const gaps: string[] = []
  const unsubscribe = await subscriber.subscribe((message) => { messages.push(message) }, (reason) => { gaps.push(reason) })
  const waitFor = async (condition: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (condition()) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.fail("fanout recovery did not complete")
  }
  try {
    const large = { origin: "publisher", target: { kind: "user", userId: "user" },
      event: { type: "mini_room.ready", payload: { miniRoom: { decor: "x".repeat(20_000) }, mediaSession: {}, participants: [] } } } as unknown as RealtimeFanoutMessage
    await publisher.publish(large)
    await waitFor(() => messages.length === 1)
    const expired = randomUUID()
    await pool.query("INSERT INTO blumi_realtime_payload_refs(payload_id,payload,expires_at) VALUES($1,$2::jsonb,NOW()-INTERVAL '1 second')", [expired, JSON.stringify(large)])
    for (const ref of [expired, randomUUID()]) {
      const previousGaps = gaps.length
      await pool.query("SELECT pg_notify($1,$2)", [REALTIME_FANOUT_CHANNEL, JSON.stringify({ payloadRef: ref, version: 1 })])
      await waitFor(() => gaps.length === previousGaps + 1 && Boolean(subscriber.isHealthy?.()))
    }
    assert.deepEqual(gaps, ["missing_payload", "missing_payload"])
    const small = { ...large, event: { type: "safety.user_blocked", payload: { blockedUserId: "other" } } } as RealtimeFanoutMessage
    await publisher.publish(small)
    await waitFor(() => messages.length === 2)
    assert.deepEqual(messages, [large, small])
    await purgeExpiredRealtimePayloads(pool)
    assert.equal((await pool.query("SELECT * FROM blumi_realtime_payload_refs WHERE payload_id=$1", [expired])).rows.length, 0)
    assert.equal((await pool.query("SELECT * FROM blumi_realtime_payload_refs")).rows.length, 1)
    const budget = await pool.query("SELECT used_bytes FROM blumi_realtime_payload_budget")
    const bytes = await pool.query("SELECT SUM(octet_length(payload::text)) AS total FROM blumi_realtime_payload_refs")
    assert.equal(budget.rows[0].used_bytes, bytes.rows[0].total)
  } finally { await unsubscribe(); await pool.end() }
})
