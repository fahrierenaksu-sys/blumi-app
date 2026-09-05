import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import {
  MALE_WARDROBE_REDESIGN_ITEMS,
  MALE_WARDROBE_REDESIGN_PLAN,
} from "./male-wardrobe-redesign-plan.mjs"

const repo = resolve(import.meta.dirname, "../../..")
const room = resolve(repo, "apps/mobile/src/features/avatarV2/assets/room")
const manifestPath = resolve(
  repo,
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/asset-manifest.json",
)

const runtimeWearables = readdirSync(room)
  .filter((name) => /^avatar_room_(top|bottom|shoes)_male_.*_v1\.png$/.test(name))
  .sort()

test("redesign plan locks the complete 54-item runtime wardrobe", () => {
  assert.equal(MALE_WARDROBE_REDESIGN_ITEMS.length, 54)
  assert.deepEqual(
    Object.fromEntries(
      ["top", "bottom", "shoes"].map((category) => [
        category,
        MALE_WARDROBE_REDESIGN_ITEMS.filter((item) => item.category === category).length,
      ]),
    ),
    { top: 27, bottom: 19, shoes: 8 },
  )

  assert.deepEqual(
    MALE_WARDROBE_REDESIGN_ITEMS.map(
      (item) => item.replacesRuntimeFilename ?? item.runtimeFilename,
    ).sort(),
    runtimeWearables,
  )
  assert.equal(
    new Set(MALE_WARDROBE_REDESIGN_ITEMS.map((item) => item.slug)).size,
    54,
  )
})

test("rejected technical tops are replaced by two distinct casual designs", () => {
  const bySlug = new Map(
    MALE_WARDROBE_REDESIGN_ITEMS.map((item) => [item.slug, item]),
  )

  assert.equal(bySlug.has("diagonal_seam_zip_mock_neck"), false)
  assert.equal(bySlug.has("cropped_cocoa_moto_jacket"), false)

  assert.equal(
    bySlug.get("dusty_blue_weekend_crew_sweatshirt")?.replacesRuntimeFilename,
    "avatar_room_top_male_diagonal_seam_zip_mock_neck_v1.png",
  )
  assert.equal(
    bySlug.get("cocoa_sage_canvas_shacket")?.replacesRuntimeFilename,
    "avatar_room_top_male_cropped_cocoa_moto_jacket_v1.png",
  )
})

test("every item has one construction-aware family and the full 4W+1S target", () => {
  const allowedFamilies = new Set([
    "tshirt_closed_crew",
    "shirt_open_camp_collar",
    "polo_placket_opening",
    "hoodie_or_sweat_closed_neck",
    "jacket_open_lapel",
    "jacket_closed_high_neck",
    "male_slim_tapered",
    "male_straight",
    "male_relaxed_baggy",
    "male_cargo_parachute_track",
    "male_shorts",
    "court_trainer",
    "canvas_skate",
    "loafer_mule",
    "runner_trail",
  ])
  const requiredStates = [
    "static",
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04",
    "sitting_front_f01",
  ]

  for (const item of MALE_WARDROBE_REDESIGN_ITEMS) {
    assert.equal(allowedFamilies.has(item.family), true, `${item.slug} family`)
    assert.deepEqual(item.requiredStates, requiredStates, `${item.slug} states`)
    assert.equal(item.status, "planned", `${item.slug} starts as planned`)
    assert.match(item.candidateRoot, /^docs\/avatar-motion-pipeline\/male-wardrobe-redesign\/2026-07-27\/candidates\//)
  }
})

test("plan is candidate-only until the user approves the complete board", () => {
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.promotionEligible, false)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.liveCatalogPromoted, false)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.runtimePromotionAllowed, false)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.userApprovalRequired, true)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.board.rows, 6)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.board.columns, 9)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.board.itemCount, 54)
  assert.equal(MALE_WARDROBE_REDESIGN_PLAN.motionMethod, "approved-static-seed-strip-first")
})

test("continuity manifest mirrors the executable plan without claiming false approvals", () => {
  assert.equal(existsSync(manifestPath), true)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.rigId, "blumi_2_5d_layered_v1")
  assert.equal(manifest.fitProfileId, "blumi_male_room_avatar_v1")
  assert.equal(manifest.items.length, 54)
  assert.equal(manifest.promotionEligible, false)
  assert.equal(manifest.liveCatalogPromoted, false)
  assert.equal(manifest.runtimePromotionAllowed, false)
  assert.equal(manifest.items.every((item) => item.status === "planned"), true)
  assert.equal(manifest.items.every((item) => item.userApproved === false), true)
  assert.deepEqual(
    manifest.items.map((item) => item.slug),
    MALE_WARDROBE_REDESIGN_ITEMS.map((item) => item.slug),
  )
})
