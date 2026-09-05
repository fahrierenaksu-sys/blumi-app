import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("room showcase snapshot migration is additive, private by default, and revision-safe", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/043_room_showcase_snapshots.sql"),
    "utf8"
  )
  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_room_showcase_snapshots/i)
  assert.match(sql, /user_id TEXT PRIMARY KEY REFERENCES blumi_accounts/i)
  assert.match(sql, /room_revision INTEGER NOT NULL CHECK \(room_revision > 0\)/i)
  assert.match(sql, /asset_key TEXT NOT NULL UNIQUE/i)
  assert.match(sql, /mime_type TEXT NOT NULL CHECK \(mime_type = 'image\/webp'\)/i)
  assert.match(sql, /is_public BOOLEAN NOT NULL DEFAULT FALSE/i)
  assert.match(sql, /headline TEXT NULL/i)
  assert.match(sql, /body BYTEA NOT NULL/i)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS blumi_room_showcase_snapshots_public_idx/i)
  assert.doesNotMatch(sql, /DROP TABLE/i)
  assert.doesNotMatch(sql, /DELETE FROM/i)
})
