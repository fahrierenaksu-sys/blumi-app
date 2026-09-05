import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("avatar selection migration backfills complete female and male loadouts", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/016_avatar_selection.sql"),
    "utf8"
  )

  assert.match(sql, /blumi_accounts[\s\S]*avatar_selection\s+JSONB/i)
  assert.match(sql, /avatar_revision\s+INTEGER/i)
  assert.match(sql, /avatar_v2_body_male_light/i)
  assert.match(sql, /avatar_v2_body_default/i)
  assert.match(sql, /schemaVersion/i)
  for (const field of [
    "bodyId",
    "faceId",
    "eyesId",
    "noseId",
    "mouthId",
    "hairId",
    "topId",
    "bottomId",
    "shoesId",
    "accessoryIds"
  ]) {
    assert.match(sql, new RegExp(field, "i"))
  }
  assert.match(sql, /avatar_revision\s*=\s*0/i)
  assert.match(sql, /ALTER COLUMN avatar_revision SET DEFAULT 0/i)
  assert.match(sql, /blumi_room_presence[\s\S]*avatar_selection\s+JSONB/i)
})
