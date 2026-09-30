import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("session reuse and Firebase uid binding migration is additive and nullable", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/068_session_reuse_detection_and_firebase_uid.sql"),
    "utf8"
  )

  assert.match(sql, /ALTER TABLE blumi_sessions\s+ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ,/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ,/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS replaced_by_token_hash TEXT;/i)
  assert.match(sql, /ALTER TABLE blumi_accounts\s+ADD COLUMN IF NOT EXISTS firebase_uid TEXT;/i)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS blumi_accounts_firebase_uid_key\s+ON blumi_accounts\(firebase_uid\)\s+WHERE firebase_uid IS NOT NULL/i)
  // Existing rows stay valid for the previous binary: no NOT NULL, no rewrite.
  assert.doesNotMatch(sql, /ADD COLUMN[^,;]*(NOT NULL|DEFAULT)|SET NOT NULL|DROP |TRUNCATE|^\s*UPDATE /im)
})
