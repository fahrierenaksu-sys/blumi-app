import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import type { ServerEvent } from "@blumi/contracts"
import { createChatReceiptSchemaProbe, CHAT_RECEIPTS_MIGRATION_ID } from "../chat/chatReceiptSchema"
import { createChatReceiptService } from "../chat/chatReceiptService"
import { createChatService } from "../chat/chatService"
import { createSchemaReadinessCheck } from "../operations/schemaReadiness"
import { runMigrations } from "./migrate"
import { createPostgresChatRepository } from "./postgresChatRepository"

// The rollback documented in docs/release/MIGRATION_070_RUNBOOK.md. The gate
// database is disposable and has every migration; removing 070 here recreates
// the production state in which this binary deploys before the owner applies it.
const ROLL_BACK_070 = [
  "ALTER TABLE blumi_chat_thread_participants DROP CONSTRAINT IF EXISTS blumi_chat_participants_delivered_cursor_check",
  "ALTER TABLE blumi_chat_thread_participants DROP CONSTRAINT IF EXISTS blumi_chat_participants_read_cursor_check",
  `ALTER TABLE blumi_chat_thread_participants
     DROP COLUMN IF EXISTS last_delivered_at,
     DROP COLUMN IF EXISTS last_delivered_message_id,
     DROP COLUMN IF EXISTS last_read_message_id`,
  "DROP TABLE IF EXISTS blumi_chat_privacy_preferences"
]

test("before 070 chat and /ready work on PostgreSQL with receipts off; applying 070 turns them on without a restart", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES === "1" ? false : "PostgreSQL contract runs in the isolated gate"
}, async () => {
  const databaseUrl = process.env.DATABASE_URL
  assert.ok(databaseUrl, "Use the isolated postgres-gate runner.")
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  try {
    for (const statement of ROLL_BACK_070) await pool.query(statement)
    await pool.query("DELETE FROM blumi_migrations WHERE id = $1", [CHAT_RECEIPTS_MIGRATION_ID])

    await createSchemaReadinessCheck(pool)()
    const probe = createChatReceiptSchemaProbe(pool, { ttlMs: 0 })
    assert.equal(await probe.isReady(), false)

    const chatService = createChatService({
      repository: createPostgresChatRepository(pool, { receiptSchema: probe })
    })
    const events: Array<{ userId: string; event: ServerEvent }> = []
    const errors: unknown[] = []
    const receipts = createChatReceiptService({
      chatService,
      blockPolicy: { async hasBlockBetween() { return false } },
      // Even a manifest that rolled receipts out early cannot enable them.
      isRolledOutFor: () => true,
      emit: (userId, event) => { events.push({ userId, event }) },
      reportError: (error) => { errors.push(error) }
    })
    await chatService.createThread({
      threadId: "pre070_thread",
      miniRoomId: "pre070_room",
      participantUserIds: ["pre070_a", "pre070_b"],
      participants: [{ userId: "pre070_a" }, { userId: "pre070_b" }]
    })
    const first = await chatService.sendMessage("pre070_a", "pre070_thread", "one", new Date("2026-10-01T10:00:00.000Z"))
    const second = await chatService.sendMessage("pre070_a", "pre070_thread", "two", new Date("2026-10-01T10:00:01.000Z"))

    const history = await chatService.listMessages("pre070_b", "pre070_thread")
    assert.deepEqual(history.map((item) => item.messageId), [first.messageId, second.messageId])
    await receipts.noteHistoryLoaded("pre070_b", "pre070_thread", history)
    await receipts.acknowledgeDelivered("pre070_b", "pre070_thread", second.messageId)
    assert.deepEqual(await receipts.markRead("pre070_b", "pre070_thread", { upToMessageId: first.messageId }), {
      readAt: first.sentAt,
      participantUserIds: ["pre070_a", "pre070_b"]
    })
    const threads = await chatService.listThreads("pre070_b")
    assert.equal(threads[0]?.unreadCount, 1)
    assert.equal((await receipts.projectThreads("pre070_b", threads))[0]?.partnerReceipts, undefined)
    assert.equal(await receipts.getPartnerReceipts("pre070_a", "pre070_thread"), undefined)
    assert.deepEqual(await receipts.getPreferences("pre070_a"), { preferences: { readReceiptsEnabled: false }, available: false })
    const legacy = await receipts.markRead("pre070_b", "pre070_thread", {}, new Date("2026-10-01T10:05:00.000Z"))
    assert.equal(legacy.readAt, "2026-10-01T10:05:00.000Z")
    assert.equal((await chatService.listThreads("pre070_b"))[0]?.unreadCount, 0)
    assert.equal(events.length, 0, "no receipt event before 070")
    assert.equal(errors.length, 0)

    // The owner applies 070 with the migrator: the same running services
    // pick it up on the next probe.
    const applied = await runMigrations({
      databaseUrl,
      migrationsDirectory: resolve(__dirname, "../../db/migrations")
    })
    assert.deepEqual(applied.applied, [CHAT_RECEIPTS_MIGRATION_ID])
    await createSchemaReadinessCheck(pool)()
    assert.equal(await probe.isReady(), true)
    await receipts.acknowledgeDelivered("pre070_b", "pre070_thread", second.messageId)
    assert.deepEqual(events.map(({ userId, event }) => [userId, event.type]), [["pre070_a", "chat.receipt_updated"]])
    assert.deepEqual(await receipts.getPartnerReceipts("pre070_a", "pre070_thread"), {
      deliveredUpTo: { sentAt: second.sentAt, messageId: second.messageId }
    })
    // The pre-070 unread cursor keeps counting unread messages but is never
    // published as a read receipt: only a read that names a shown message is.
    const rows = await chatService.repository.listReceiptParticipants(["pre070_thread"])
    assert.equal(rows.find((row) => row.userId === "pre070_b")?.readUpTo, undefined)
    assert.equal((await chatService.listThreads("pre070_b"))[0]?.unreadCount, 0)
    await receipts.markRead("pre070_b", "pre070_thread", { upToMessageId: second.messageId })
    assert.deepEqual((await chatService.repository.listReceiptParticipants(["pre070_thread"]))
      .find((row) => row.userId === "pre070_b")?.readUpTo, { sentAt: second.sentAt, messageId: second.messageId })
    assert.deepEqual(errors, [])
  } finally {
    await pool.end()
  }
})
