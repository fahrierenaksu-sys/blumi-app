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
  ["starter", { itemId: "avatar_v2_hair_ink_pageboy_star", type: "avatar", avatarBodyId: "avatar_v2_body_default" }],
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
      const inventory = await service.getInventory(userId)
      results[userId] = { error: error.message, coins: inventory.coins, owned: inventory.ownedAvatarItemIds }
    }
  }
  process.stdout.write(JSON.stringify(results))
})()
`

test("production economy sells no old avatarV2 item after X15 and refuses held, retired, legacy room and owned starter ones", () => {
  const output = execFileSync(process.execPath, ["-e", PRODUCTION_PURCHASE_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      ECONOMY_SERVICE_MODULE: require.resolve("./economyService")
    }
  })
  const results = JSON.parse(output) as Record<string, { purchasedItemId?: string; owned?: string[]; error?: string; coins?: number }>

  // the old avatarV2 items lost their receipts (plan X15): production never sells them again
  for (const userId of ["female_top", "female_dress", "male_top", "held", "retired", "room"]) {
    assert.equal(results[userId]?.purchasedItemId, undefined, userId)
    assert.equal(results[userId]?.error, "That shop item is not available.", userId)
  }
  // the girl starter is free and already owned by every production account: no purchase, no charge
  assert.equal(results.starter?.purchasedItemId, undefined)
  assert.equal(results.starter?.error, "You already own this item.")
  assert.ok(results.starter?.owned?.includes("avatar_v2_hair_ink_pageboy_star"))
  assert.equal(results.starter?.coins, results.female_top?.coins)
})
