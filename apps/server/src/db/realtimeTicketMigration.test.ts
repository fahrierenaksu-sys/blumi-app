import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("realtime ticket migration removes raw bearer storage", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/038_realtime_ticket_session_hash.sql"),
    "utf8"
  )

  assert.match(sql, /ADD COLUMN IF NOT EXISTS session_token_hash/i)
  assert.match(sql, /sha256/i)
  assert.match(sql, /DROP COLUMN session_token/i)
  assert.match(sql, /session_token_hash CHAR\(64\)/i)
  assert.match(sql, /ALTER COLUMN session_token_hash SET NOT NULL/i)
})
