import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("realtime connection leases are additive, account-bound, indexed, and not client-readable", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/067_realtime_connection_leases.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_realtime_connection_leases/i)
  assert.match(sql, /connection_id\s+TEXT\s+PRIMARY KEY/i)
  assert.match(sql, /user_id\s+TEXT\s+NOT NULL\s+REFERENCES blumi_accounts\s*\(user_id\)\s+ON DELETE CASCADE/i)
  assert.match(sql, /expires_at\s+TIMESTAMPTZ\s+NOT NULL/i)
  assert.match(sql, /ON blumi_realtime_connection_leases\s*\(user_id,\s*expires_at\)/i)
  assert.match(sql, /REVOKE ALL ON TABLE blumi_realtime_connection_leases\s+FROM PUBLIC, anon, authenticated/i)
  assert.doesNotMatch(sql, /ALTER TABLE blumi_accounts|DROP TABLE|TRUNCATE/i)
})
