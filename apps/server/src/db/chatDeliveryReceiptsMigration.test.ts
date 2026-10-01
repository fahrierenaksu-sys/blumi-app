import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { CHAT_RECEIPTS_MIGRATION_ID } from "../chat/chatReceiptSchema"
import { OPTIONAL_READINESS_MIGRATIONS } from "../operations/schemaReadiness"

const MIGRATIONS = resolve(__dirname, "../../db/migrations")

test("migration 070 is the next number and leaves every applied file untouched", async () => {
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort()
  assert.equal(files.at(-1), CHAT_RECEIPTS_MIGRATION_ID)
  assert.equal(files.filter((name) => name.startsWith("070_")).length, 1)
  // The known ledger quirks stay as they are: two 032 files and no 044.
  assert.equal(files.filter((name) => name.startsWith("032_")).length, 2)
  assert.equal(files.some((name) => name.startsWith("044_")), false)
})

test("migration 070 adds nullable receipt cursors and a default-off, non-public preference table", async () => {
  const sql = await readFile(resolve(MIGRATIONS, CHAT_RECEIPTS_MIGRATION_ID), "utf8")

  for (const column of ["last_delivered_at TIMESTAMPTZ", "last_delivered_message_id TEXT", "last_read_message_id TEXT"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}[,;]\\n`, "i"), column)
  }
  assert.doesNotMatch(sql, /ADD COLUMN[^;]*NOT NULL/i, "existing rows need no rewrite or default")
  assert.match(sql, /CHECK \(\(last_delivered_at IS NULL\) = \(last_delivered_message_id IS NULL\)\)/)
  assert.match(sql, /CHECK \(last_read_message_id IS NULL OR last_read_at IS NOT NULL\)/)
  assert.equal((sql.match(/conrelid = 'blumi_chat_thread_participants'::regclass/g) ?? []).length, 2)

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_chat_privacy_preferences/i)
  assert.match(sql, /user_id TEXT PRIMARY KEY REFERENCES blumi_accounts\(user_id\) ON DELETE CASCADE/i)
  assert.match(sql, /read_receipts_enabled BOOLEAN NOT NULL DEFAULT false/i)
  assert.match(sql, /ALTER TABLE blumi_chat_privacy_preferences ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE blumi_chat_privacy_preferences\s+FROM PUBLIC, anon, authenticated/i)

  // Forward only: no backfill, rewrite or removal of anything that exists.
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|INSERT|TRUNCATE)\b/im)
  assert.doesNotMatch(sql, /\bDROP\b/i)
  assert.doesNotMatch(sql, /ALTER COLUMN|RENAME/i)
})

test("migration 070 is optional for /ready so the binary can ship before it", () => {
  assert.deepEqual([...OPTIONAL_READINESS_MIGRATIONS], [CHAT_RECEIPTS_MIGRATION_ID])
})
