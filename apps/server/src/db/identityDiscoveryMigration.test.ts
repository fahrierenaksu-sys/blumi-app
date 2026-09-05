import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("identity and discovery preferences migrate additively without deriving avatar body", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/027_identity_discovery_preferences.sql"),
    "utf8"
  )

  assert.match(sql, /ADD COLUMN IF NOT EXISTS identity_gender TEXT/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS discovery_genders TEXT\[\]/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS discovery_age_min INTEGER/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS discovery_age_max INTEGER/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS discovery_radius_km INTEGER/i)
  assert.match(sql, /SET identity_gender = gender/i)
  assert.doesNotMatch(sql, /SET\s+avatar_(selection|preset_id)/i)
  assert.match(sql, /CHECK \(identity_gender IS NULL OR identity_gender IN \('woman', 'man'\)\)/i)
  assert.match(sql, /CHECK \(discovery_radius_km IN \(25, 50, 100\)\)/i)
})
