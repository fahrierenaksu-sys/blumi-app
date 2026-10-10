import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

// ECONOMY_CATALOG is chosen from NODE_ENV when the module loads, so the
// production catalog is exercised in a fresh process.
const PRODUCTION_PURCHASE_SCRIPT = `
const { createEconomyService } = require(process.env.ECONOMY_SERVICE_MODULE)
const purchases = [
  ["female_top", { itemId: "avatar_v2_top_sage_ribbon_knit_jacket", type: "avatar", avatarBodyId: "avatar_v2_body_default" }],
  ["female_dress", { itemId: "avatar_v2_top_boho_patchwork_maxi_dress", type: "avatar", avatarBodyId: "avatar_v2_body_default" }],
  ["male_top", { itemId: "avatar_v2_top_male_tonal_geometric_camp_collar_shirt", type: "avatar", avatarBodyId: "avatar_v2_body_male_light" }],
  ["room", { itemId: "room_v2_cute_bookshelf", type: "room" }],
  ["held", { itemId: "avatar_v2_top_cherry_heart_milkmaid_blouse", type: "avatar", avatarBodyId: "avatar_v2_body_default" }],
  ["retired", { itemId: "avatar_v2_top_male_acid_washed_boxy_sweatshirt", type: "avatar", avatarBodyId: "avatar_v2_body_male_light" }]
]
;(async () => {
  const service = createEconomyService()
  const results = {}
  for (const [userId, input] of purchases) {
    try {
      const result = await service.purchaseItem(userId, input)
      results[userId] = {
        purchasedItemId: result.purchasedItemId,
        owned: input.type === "room" ? result.inventory.ownedRoomItemIds : result.inventory.ownedAvatarItemIds
      }
    } catch (error) {
      results[userId] = { error: error.message }
    }
  }
  process.stdout.write(JSON.stringify(results))
})()
`

test("production economy sells receipted women's and men's items and refuses held, retired and retired room ones", () => {
  const output = execFileSync(process.execPath, ["-e", PRODUCTION_PURCHASE_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      ECONOMY_SERVICE_MODULE: require.resolve("./economyService")
    }
  })
  const results = JSON.parse(output) as Record<string, { purchasedItemId?: string; owned?: string[]; error?: string }>

  assert.equal(results.female_top?.purchasedItemId, "avatar_v2_top_sage_ribbon_knit_jacket")
  assert.equal(results.female_dress?.purchasedItemId, "avatar_v2_top_boho_patchwork_maxi_dress")
  assert.ok(results.female_dress?.owned?.includes("avatar_v2_bottom_boho_patchwork_maxi_dress"))
  assert.equal(results.male_top?.purchasedItemId, "avatar_v2_top_male_tonal_geometric_camp_collar_shirt")
  // the old flat furniture is in the legacy registry: never sold again, even while its receipt still exists
  assert.equal(results.room?.error, "That shop item is not available.")
  assert.equal(results.held?.error, "That shop item is not available.")
  assert.equal(results.retired?.error, "That shop item is not available.")
})
