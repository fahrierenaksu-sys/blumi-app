import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("moderation phone ban migration is additive, hash-keyed and not client-readable", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/069_moderation_phone_bans.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_moderation_phone_bans/i)
  assert.match(sql, /phone_hash TEXT PRIMARY KEY\s+CHECK \(phone_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i)
  assert.match(sql, /source TEXT NOT NULL\s+CHECK \(source IN \('account_deletion', 'phone_change'\)\)/i)
  assert.match(sql, /created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp\(\)/i)
  assert.match(sql, /ALTER TABLE blumi_moderation_phone_bans ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE blumi_moderation_phone_bans\s+FROM PUBLIC, anon, authenticated/i)
  // No plain phone column, and nothing the previous binary depends on changes.
  assert.doesNotMatch(sql, /phone_number/i)
  assert.doesNotMatch(sql, /ALTER TABLE blumi_accounts|DROP |TRUNCATE|^\s*UPDATE /im)
})
