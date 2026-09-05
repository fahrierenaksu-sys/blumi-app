import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("session family migration permits rotated token tombstones", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/015_session_families.sql"),
    "utf8"
  )

  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS blumi_sessions_session_id_key/i
  )
  assert.match(sql, /CREATE INDEX IF NOT EXISTS blumi_sessions_session_id_idx/i)
  assert.doesNotMatch(sql, /CREATE UNIQUE INDEX/i)
})
