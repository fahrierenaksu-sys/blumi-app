import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const sql = readFileSync(
  resolve(__dirname, "../../db/migrations/017_male_avatar_loadout.sql"),
  "utf8"
)
const avatarSelectionSql = readFileSync(
  resolve(__dirname, "../../db/migrations/016_avatar_selection.sql"),
  "utf8"
)

test("legacy preset-only male rows start with the motion-ready canonical basics", () => {
  assert.match(avatarSelectionSql, /avatar_v2_top_male_powder_blue_crew_tee/)
  assert.match(avatarSelectionSql, /avatar_v2_bottom_male_navy_straight_pants/)
})

test("male avatar migration repairs incompatible slots without wiping valid clothes", () => {
  assert.match(sql, /UPDATE blumi_accounts/i)
  assert.match(sql, /UPDATE blumi_room_presence/i)
  assert.match(sql, /avatar_v2_face_male_warm_friendly/)
  assert.match(sql, /avatar_v2_hair_male_espresso_crop/)
  assert.match(sql, /avatar_v2_top_male_cream_basic_tee/)
  assert.match(sql, /avatar_v2_top_male_powder_blue_crew_tee/)
  assert.match(sql, /avatar_v2_bottom_male_sage_cuffed_shorts/)
  assert.match(sql, /avatar_v2_bottom_male_navy_straight_pants/)
  assert.match(sql, /avatar_v2_shoes_male_milk_tea_court/)
  assert.match(sql, /CASE\s+WHEN avatar_selection->>'topId' IN/is)
  assert.match(sql, /CASE\s+WHEN avatar_selection->>'bottomId' IN/is)
  assert.match(sql, /IS DISTINCT FROM/i)
  assert.equal((sql.match(/IS DISTINCT FROM/g) ?? []).length, 2)
  assert.equal((sql.match(/avatar_revision = avatar_revision \+ 1/g) ?? []).length, 2)
  assert.equal((sql.match(/updated_at = NOW\(\)/g) ?? []).length, 2)
})
