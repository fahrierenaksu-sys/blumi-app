import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createChatService } from "../chat/chatService"
import { createPostgresChatRepository } from "./postgresChatRepository"

// Found by the PostgreSQL social-loop E2E (src/e2e/socialLoop.postgres.test.ts):
// a message sent right after the previous one sometimes reached the partner
// up to a second late, after newer messages. The outbox row's available_at is
// the database NOW() in microseconds; the inline dispatch claims it at once
// with a JavaScript Date, which has millisecond precision. In the same
// millisecond the truncated Date is earlier than NOW(), the targeted claim
// finds nothing, and only the one-second worker delivers the message.

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL }

test("the sender's own dispatch claims a just-committed delivery within the same millisecond", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const suffix = randomUUID()
  const chatService = createChatService({ repository: createPostgresChatRepository(pool) })
  try {
    const threadId = `thread_claim_${suffix}`
    await chatService.createThread({
      threadId, miniRoomId: `room_claim_${suffix}`, participantUserIds: [`ada_${suffix}`, `bora_${suffix}`],
      participants: [{ userId: `ada_${suffix}` }, { userId: `bora_${suffix}` }]
    })
    // Retry until the row's NOW() has a sub-millisecond part (almost always).
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sent = await chatService.sendMessageIdempotently(`ada_${suffix}`, threadId, `hello ${attempt}`, `client-claim-${attempt}-0000`)
      const row = await pool.query<{ micros: string; millis: string }>(
        `SELECT (EXTRACT(MICROSECONDS FROM available_at)::bigint % 1000)::text AS micros,
                (EXTRACT(EPOCH FROM date_trunc('milliseconds', available_at)) * 1000)::bigint::text AS millis
           FROM blumi_chat_delivery_outbox WHERE message_id = $1`, [sent.message.messageId])
      if (row.rows[0]!.micros === "0") continue
      const sameMillisecond = new Date(Number(row.rows[0]!.millis))
      const jobs = await chatService.repository.claimDeliveries({
        now: sameMillisecond, limit: 1, leaseMs: 30_000, messageId: sent.message.messageId
      })
      assert.deepEqual(jobs.map((job) => job.message.messageId), [sent.message.messageId])
      const again = await chatService.repository.claimDeliveries({
        now: sameMillisecond, limit: 1, leaseMs: 30_000, messageId: sent.message.messageId
      })
      assert.deepEqual(again, [], "a leased job is not claimed twice")
      return
    }
    assert.fail("every outbox timestamp landed on a whole millisecond")
  } finally {
    await pool.end()
  }
})
