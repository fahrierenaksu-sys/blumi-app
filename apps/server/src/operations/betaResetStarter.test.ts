import assert from "node:assert/strict"
import test from "node:test"
import { describeBetaResetStarter, readBetaResetStarter } from "./betaResetStarter"

// What the dry run prints and binds into its hash: the boy gets the 2.5D curls + basic_a look, the girl is unchanged.
test("the beta reset starter hands the boy the curls and basic_a and the girl her 2.5D starter", () => {
  const starter = readBetaResetStarter()
  const described = describeBetaResetStarter(starter)
  const male = described.male as string[]
  const female = described.female as string[]
  for (const id of [
    "avatar_v2_hair_male_blue_black_curls",
    "avatar_v2_top_male_white_basic_tee",
    "avatar_v2_bottom_male_black_straight_trousers",
    "avatar_v2_shoes_male_black_clean_sneakers"
  ]) assert.ok(male.includes(id), id)
  for (const id of [
    "avatar_v2_hair_male_soft_black_side_part",
    "avatar_v2_top_male_powder_blue_crew_tee",
    "avatar_v2_bottom_male_navy_straight_pants",
    "avatar_v2_shoes_male_milk_tea_court"
  ]) assert.equal(male.includes(id), false, `${id} is no longer the boy's starter`)
  for (const id of [
    "avatar_v2_hair_ink_pageboy_star",
    "avatar_v2_top_coral_wave_polo",
    "avatar_v2_bottom_coral_wave_pants",
    "avatar_v2_shoes_mint_ribbon_court_sneakers"
  ]) assert.ok(female.includes(id), id)
  assert.match(String(described.digest), /^[0-9a-f]{16}$/)
})
