import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("chat metadata migration is additive and keeps an append-only edit audit", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/042_chat_message_metadata.sql"),
    "utf8"
  )

  for (const column of ["delivered_at", "read_at", "edited_at"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} TIMESTAMPTZ`, "i"))
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_chat_message_edit_audit/i)
  assert.match(sql, /thread_id TEXT NOT NULL/i)
  assert.match(sql, /PRIMARY KEY \(message_id, revision\)/i)
  assert.match(sql, /body_before TEXT NOT NULL/i)
  assert.match(sql, /body_after TEXT NOT NULL/i)
  assert.match(sql, /blumi_chat_messages_delivered_at_order_check/i)
  assert.match(sql, /blumi_chat_messages_read_at_order_check/i)
  assert.match(sql, /blumi_chat_messages_edited_at_window_check/i)
  assert.equal(
    (sql.match(/conrelid\s*=\s*'blumi_chat_messages'::regclass/gi) ?? []).length,
    3
  )
  assert.doesNotMatch(sql, /REFERENCES\s+blumi_chat_messages/i)
  assert.match(sql, /survives source message deletion/i)
  assert.doesNotMatch(sql, /UPDATE\s+blumi_chat_messages/i)
  assert.doesNotMatch(sql, /DELETE\s+FROM/i)
})
