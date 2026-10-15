import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import { Pool } from "pg"
import { CHAT_HIDE_POINT_MIGRATION_ID, createChatHidePointSchemaProbe, createChatHideSchemaProbe } from "../chat/chatHideSchema"
import { createSchemaReadinessCheck } from "../operations/schemaReadiness"
import { disposablePostgresSkip, disposablePostgresUrl } from "./disposablePostgres"
import { runMigrations } from "./migrate"
import { createPostgresChatRepository } from "./postgresChatRepository"

// The rollback documented in docs/release/DATABASE_RELEASE_RUNBOOK.md for 075.
// The gate database is disposable and has every migration; removing 075's
// columns and ledger row recreates the state in which this binary deploys
// before the owner applies it.
const ROLL_BACK_075 = `ALTER TABLE blumi_chat_thread_participants
  DROP COLUMN IF EXISTS hidden_through_message_id,
  DROP COLUMN IF EXISTS hidden_through_message_sent_at`

const THREAD: ChatThread = {
  threadId: "pre075_thread",
  miniRoomId: "pre075_room",
  participantUserIds: ["pre075_a", "pre075_b"],
  participants: [{ userId: "pre075_a" }, { userId: "pre075_b" }],
  createdAt: "2026-10-15T08:00:00.000Z"
}
const [ADA, BORA] = THREAD.participantUserIds

function message(id: string, sentAt: string): ChatMessage {
  return { messageId: `pre075_${id}`, threadId: THREAD.threadId, senderUserId: BORA, body: id, sentAt }
}

test("before 075 hiding keeps 071's time rule; after it the exact point applies and older points fall back", {
  skip: disposablePostgresSkip().skip ? "PostgreSQL contract runs in the isolated gate" : false
}, async () => {
  const databaseUrl = disposablePostgresUrl(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  try {
    await pool.query(ROLL_BACK_075)
    await pool.query("DELETE FROM blumi_migrations WHERE id = $1", [CHAT_HIDE_POINT_MIGRATION_ID])
    await createSchemaReadinessCheck(pool)()

    const probe = createChatHidePointSchemaProbe(pool, { ttlMs: 0 })
    const hideSchema = createChatHideSchemaProbe(pool, { ttlMs: 0 })
    const current = createPostgresChatRepository(pool, { hideSchema, hidePointSchema: probe })
    // A binary built before 075: it never names the new columns.
    const older = createPostgresChatRepository(pool, { hideSchema })
    const history = async () => (await current.listMessages(THREAD.threadId, { limit: 50, viewerUserId: ADA })).map((item) => item.body)
    // The thread row names the same point as history; unread counts are a time rule.
    const row = async () => {
      const listed = (await current.listThreads(ADA)).find((item) => item.threadId === THREAD.threadId)!
      const bySender = await current.countUnreadMessagesBySender(ADA)
      return {
        hiddenThroughMessageId: listed.hiddenThroughMessageId,
        unreadCount: listed.unreadCount,
        unreadFromBora: bySender.find((item) => item.senderUserId === BORA)?.unreadCount ?? 0
      }
    }
    const fullyHidden = { hiddenThroughMessageId: undefined, unreadCount: 0, unreadFromBora: 0 }
    assert.equal(await probe.isReady(), false)
    await current.saveThread(THREAD)
    const t1 = "2026-10-15T08:01:00.000Z"
    for (const value of [message("a1", t1), message("a2", t1)]) await current.createMessage(value)

    // Before 075 every statement keeps 071's SQL: the columns do not exist.
    const pre = await current.hideThreadForParticipant({ threadId: THREAD.threadId, userId: ADA, throughMessageId: "pre075_a1" })
    assert.equal(pre?.hiddenThrough, t1)
    assert.deepEqual(await history(), [], "071 hides everything in the hidden message's millisecond")
    assert.deepEqual(await row(), fullyHidden, "before 075 the row and unread counts use the time only")

    const applied = await runMigrations({ databaseUrl, migrationsDirectory: resolve(__dirname, "../../db/migrations") })
    assert.deepEqual(applied.applied, [CHAT_HIDE_POINT_MIGRATION_ID])
    await createSchemaReadinessCheck(pool)()
    assert.equal(await probe.isReady(), true)
    assert.deepEqual(await history(), [], "a point stored before 075 keeps its time rule")
    assert.deepEqual(await row(), fullyHidden, "so do its row and unread counts")

    const t2 = "2026-10-15T08:02:00.000Z"
    for (const value of [message("b1", t2), message("b2", t2)]) await current.createMessage(value)
    await current.hideThreadForParticipant({ threadId: THREAD.threadId, userId: ADA, throughMessageId: "pre075_b1" })
    assert.deepEqual(await history(), ["b2"], "after 075 the hidden message is the point")
    assert.deepEqual(await row(), { hiddenThroughMessageId: "pre075_b1", unreadCount: 0, unreadFromBora: 0 },
      "the row names the point; unread stays a time rule, so b2 shows but is not unread")
    const stored = await pool.query(`SELECT hidden_through_message_id AS id, hidden_through_message_sent_at = hidden_through AS exact
      FROM blumi_chat_thread_participants WHERE thread_id = $1 AND user_id = $2`, [THREAD.threadId, ADA])
    assert.deepEqual(stored.rows[0], { id: "pre075_b1", exact: true })

    // An older binary still serving during a rolling deploy moves only hidden_through.
    const t3 = "2026-10-15T08:03:00.000Z"
    for (const value of [message("c1", t3), message("c2", t3)]) await current.createMessage(value)
    await older.hideThreadForParticipant({ threadId: THREAD.threadId, userId: ADA, throughMessageId: "pre075_c1" })
    assert.deepEqual(await history(), [], "a point moved by an older binary falls back to its time rule")
    assert.deepEqual(await row(), fullyHidden, "and so do its row and unread counts")

    const t4 = "2026-10-15T08:04:00.000Z"
    for (const value of [message("d1", t4), message("d2", t4)]) await current.createMessage(value)
    assert.deepEqual(await history(), ["d1", "d2"])
    await current.hideThreadForParticipant({ threadId: THREAD.threadId, userId: ADA, throughMessageId: "pre075_d1" })
    assert.deepEqual(await history(), ["d2"], "the next hide stores an exact point again")
    assert.deepEqual(await row(), { hiddenThroughMessageId: "pre075_d1", unreadCount: 0, unreadFromBora: 0 })
    assert.deepEqual((await current.listMessages(THREAD.threadId, { limit: 50, viewerUserId: BORA })).map((item) => item.body),
      ["a1", "a2", "b1", "b2", "c1", "c2", "d1", "d2"], "the partner's history never changes")
  } finally {
    await pool.end()
  }
})
