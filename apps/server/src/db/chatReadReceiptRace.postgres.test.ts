import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import { createPostgresChatRepository } from "./postgresChatRepository"

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test("two reads by id that run at the same moment never move the read receipt backwards", requirePostgres, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  const repository = createPostgresChatRepository(pool, { receiptSchema: createChatReceiptSchemaProbe(pool) })
  const suffix = randomUUID()
  const [sender, reader] = [`user_sender_${suffix}`, `user_reader_${suffix}`]
  const threadId = `thread_${suffix}`
  const holder = await pool.connect()
  try {
    await repository.saveThread({
      threadId, miniRoomId: `room_${suffix}`, participantUserIds: [sender, reader],
      participants: [{ userId: sender, displayName: "Ada" }, { userId: reader, displayName: "Bo" }],
      createdAt: "2026-10-01T10:00:00.000Z"
    })
    const older = { messageId: `${threadId}_m5`, threadId, senderUserId: sender, body: "five", sentAt: "2026-10-01T10:05:00.000Z" }
    const newer = { messageId: `${threadId}_m6`, threadId, senderUserId: sender, body: "six", sentAt: "2026-10-01T10:06:00.000Z" }
    await repository.createMessage(older)
    await repository.createMessage(newer)

    // Hold the reader's participant row so both reads take their snapshot
    // first and then wait: the newer read gets the row first.
    await holder.query("BEGIN")
    await holder.query("SELECT 1 FROM blumi_chat_thread_participants WHERE thread_id = $1 AND user_id = $2 FOR UPDATE", [threadId, reader])
    const readNewer = repository.advanceReadCursor({ threadId, userId: reader, upToMessageId: newer.messageId })
    await pause(150)
    const readOlder = repository.advanceReadCursor({ threadId, userId: reader, upToMessageId: older.messageId })
    await pause(150)
    await holder.query("COMMIT")
    const [newerResult, olderResult] = await Promise.all([readNewer, readOlder])

    assert.deepEqual(newerResult?.readUpTo, { sentAt: newer.sentAt, messageId: newer.messageId })
    assert.equal(olderResult?.readUpTo, undefined, "the older read publishes nothing")
    const rows = await repository.listReceiptParticipants([threadId])
    assert.deepEqual(rows.find((row) => row.userId === reader)?.readUpTo, { sentAt: newer.sentAt, messageId: newer.messageId })
  } finally {
    holder.release()
    await pool.end()
  }
})
