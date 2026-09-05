import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("chat room invite migration preserves legacy data while enforcing one pending durable invite per thread", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/026_chat_room_invites.sql"),
    "utf8"
  )

  assert.match(sql, /ADD COLUMN IF NOT EXISTS source_thread_id TEXT/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ/i)
  assert.match(sql, /'expired'/i)
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS blumi_mini_room_invites_one_pending_thread_uidx[\s\S]*source_thread_id[\s\S]*status = 'pending'/i
  )
  assert.match(sql, /ALTER COLUMN room_id DROP NOT NULL/i)
  assert.match(sql, /ALTER COLUMN sender_spot_id DROP NOT NULL/i)
})
