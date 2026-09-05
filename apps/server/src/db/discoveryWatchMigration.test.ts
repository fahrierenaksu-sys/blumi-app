import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("discovery watch migration is account-scoped, expiring, and constrained", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/028_discovery_watch.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_discovery_watches/i)
  assert.match(sql, /user_id TEXT PRIMARY KEY REFERENCES blumi_accounts\(user_id\) ON DELETE CASCADE/i)
  assert.match(sql, /status TEXT NOT NULL CHECK \(status IN \('active'\)\)/i)
  assert.match(sql, /expires_at TIMESTAMPTZ NOT NULL/i)
  assert.match(sql, /radius_km INTEGER NOT NULL CHECK \(radius_km IN \(25, 50, 100\)\)/i)
})
