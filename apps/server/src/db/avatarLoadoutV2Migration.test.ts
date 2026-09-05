import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("avatar loadout V2 migration accepts only exact V1 or exact V2 shapes without backfill", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/041_avatar_loadout_v2.sql"),
    "utf8"
  )

  for (const table of ["blumi_accounts", "blumi_room_presence"]) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table}`, "i"))
    assert.match(sql, new RegExp(`${table}_avatar_selection_shape_check`, "i"))
  }
  assert.match(sql, /avatar_selection->'schemaVersion'\s*=\s*'1'::jsonb/i)
  assert.match(sql, /avatar_selection->'schemaVersion'\s*=\s*'2'::jsonb/i)
  assert.match(sql, /dressId/i)
  assert.match(sql, /outerwearId/i)
  assert.match(sql, /avatar_selection\s*-\s*ARRAY\[/i)
  assert.doesNotMatch(sql, /UPDATE\s+blumi_(accounts|room_presence)/i)
  assert.doesNotMatch(sql, /DELETE\s+FROM/i)
})
