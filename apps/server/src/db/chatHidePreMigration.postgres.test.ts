import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import { CHAT_HIDE_MIGRATION_ID, createChatHideSchemaProbe } from "../chat/chatHideSchema"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import { ChatHideUnavailableError, createChatService } from "../chat/chatService"
import { createSchemaReadinessCheck } from "../operations/schemaReadiness"
import { runMigrations } from "./migrate"
import { createPostgresChatRepository } from "./postgresChatRepository"

// The column rollback documented in docs/release/MIGRATION_071_RUNBOOK.md.
// The gate database is disposable and has every migration; removing 071's
// column and ledger row recreates the production state in which this binary
// deploys before the owner applies it.
const ROLL_BACK_071_COLUMN =
  "ALTER TABLE blumi_chat_thread_participants DROP COLUMN IF EXISTS hidden_through"

test("before 071 chat and /ready work on PostgreSQL with server hide off; applying 071 turns it on without a restart", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES === "1" ? false : "PostgreSQL contract runs in the isolated gate"
}, async () => {
  const databaseUrl = process.env.DATABASE_URL
  assert.ok(databaseUrl, "Use the isolated postgres-gate runner.")
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  try {
    await pool.query(ROLL_BACK_071_COLUMN)
    await pool.query("DELETE FROM blumi_migrations WHERE id = $1", [CHAT_HIDE_MIGRATION_ID])

    await createSchemaReadinessCheck(pool)()
    const probe = createChatHideSchemaProbe(pool, { ttlMs: 0 })
    assert.equal(await probe.isReady(), false)
    const chatService = createChatService({
      repository: createPostgresChatRepository(pool, {
        receiptSchema: createChatReceiptSchemaProbe(pool),
        hideSchema: probe
      })
    })
    await chatService.createThread({
      threadId: "pre071_thread",
      miniRoomId: "pre071_room",
      participantUserIds: ["pre071_a", "pre071_b"],
      participants: [{ userId: "pre071_a" }, { userId: "pre071_b" }]
    })
    const first = await chatService.sendMessage("pre071_a", "pre071_thread", "one", new Date("2026-10-02T10:00:00.000Z"))

    // Every read path keeps its pre-071 SQL (none names hidden_through).
    assert.deepEqual((await chatService.listMessages("pre071_b", "pre071_thread")).map((item) => item.messageId), [first.messageId])
    assert.equal((await chatService.listThreads("pre071_b"))[0]?.unreadCount, 1)
    assert.equal(await chatService.countUnreadMessages("pre071_b"), 1)
    await assert.rejects(chatService.hideThreadForMe("pre071_b", "pre071_thread"), ChatHideUnavailableError)
    assert.equal((await chatService.listThreads("pre071_b")).length, 1, "nothing was hidden")

    // The owner applies 071 with the migrator: the running service picks it
    // up on the next probe.
    const applied = await runMigrations({
      databaseUrl,
      migrationsDirectory: resolve(__dirname, "../../db/migrations")
    })
    assert.deepEqual(applied.applied, [CHAT_HIDE_MIGRATION_ID])
    await createSchemaReadinessCheck(pool)()
    assert.equal(await probe.isReady(), true)

    const hidden = await chatService.hideThreadForMe("pre071_b", "pre071_thread")
    assert.equal(hidden.hiddenThrough, first.sentAt)
    assert.deepEqual(await chatService.listThreads("pre071_b"), [])
    assert.deepEqual(await chatService.listMessages("pre071_b", "pre071_thread"), [])
    assert.equal(await chatService.countUnreadMessages("pre071_b"), 0)
    assert.equal((await chatService.listMessages("pre071_a", "pre071_thread")).length, 1)
    const second = await chatService.sendMessage("pre071_a", "pre071_thread", "two", new Date("2026-10-02T10:01:00.000Z"))
    assert.deepEqual((await chatService.listMessages("pre071_b", "pre071_thread")).map((item) => item.messageId), [second.messageId])
    assert.equal((await chatService.listThreads("pre071_b"))[0]?.unreadCount, 1)
  } finally {
    await pool.end()
  }
})
