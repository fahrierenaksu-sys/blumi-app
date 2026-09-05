import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("chat message retry migration is additive and creates a sender-scoped unique key", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/029_chat_message_idempotency.sql"),
    "utf8"
  )

  assert.match(sql, /ADD COLUMN IF NOT EXISTS client_message_id TEXT/i)
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS blumi_chat_messages_sender_client_message_uq/i)
  assert.match(sql, /\(thread_id, sender_user_id, client_message_id\)/i)
  assert.match(sql, /WHERE client_message_id IS NOT NULL/i)
})
