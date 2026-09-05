import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("personal Room decor migration is additive, owner-bound, and revision-safe", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/039_personal_room_decor.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_personal_room_decor/i)
  assert.match(sql, /user_id TEXT PRIMARY KEY/i)
  assert.match(
    sql,
    /REFERENCES blumi_accounts\(user_id\) ON DELETE CASCADE/i
  )
  assert.match(sql, /revision INTEGER NOT NULL CHECK \(revision > 0\)/i)
  assert.match(sql, /decor JSONB NOT NULL/i)
  assert.match(sql, /updated_at TIMESTAMPTZ NOT NULL/i)
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS blumi_personal_room_decor_updated_idx/i
  )
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i)
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i)
})
