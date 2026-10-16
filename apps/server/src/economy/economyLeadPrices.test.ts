import assert from "node:assert/strict"
import test from "node:test"
import { BLUMI_R1_RELEASE_CATALOG, ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG, type ReleaseCatalog } from "@blumi/domain"
import { createEconomyService } from "./economyService"
import { STARTER_COIN_BALANCE, type EconomyItemType } from "./economyCatalog"

const GIRL = "avatar_v2_body_default"
const BOY = "avatar_v2_body_male_light"

/**
 * The economy v1 lead price sheet (Workbench economy_2025/LEAD/PRICES.tsv, set under the owner's economy delegation
 * on 2026-10-16) for the 62 items that have no receipt yet: [item id, type, body that wears it, lead price in coins].
 * The server charges what the shared domain catalog says, so any second price table that drifts fails here.
 */
const LEAD_PRICES: ReadonlyArray<readonly [string, EconomyItemType, string | null, number]> = [
  ["glasses_boy_black_soft_rect", "avatar", BOY, 150],
  ["glasses_boy_gunmetal_round", "avatar", BOY, 150],
  ["bag_girl_camel_mini", "avatar", GIRL, 220],
  ["bottom_girl_wine_midi_skirt", "avatar", GIRL, 220],
  ["bottom_girl_wide_jeans", "avatar", GIRL, 220],
  ["bottom_girl_ecru_trousers", "avatar", GIRL, 220],
  ["dress_girl_denim_pinafore_mini", "avatar", GIRL, 320],
  ["dress_girl_sage_shirred_tiered_mini", "avatar", GIRL, 320],
  ["dress_girl_butter_square_puff_mini", "avatar", GIRL, 340],
  ["dress_girl_black_corset_flare_mini", "avatar", GIRL, 360],
  ["dress_girl_cream_one_shoulder_mini", "avatar", GIRL, 360],
  ["dress_girl_wine_gingham_tie", "avatar", GIRL, 380],
  ["dress_girl_denim_milkmaid_button_midi", "avatar", GIRL, 420],
  ["dress_girl_cream_one_shoulder_tie_midi", "avatar", GIRL, 420],
  ["dress_girl_black_corset_slit_maxi", "avatar", GIRL, 520],
  ["dress_girl_terracotta_patchwork_halter_bias_maxi", "avatar", GIRL, 520],
  ["glasses_girl_gold_round", "avatar", GIRL, 150],
  ["glasses_girl_rose_soft_cateye", "avatar", GIRL, 150],
  ["hair_girl_ink_french_bob", "avatar", GIRL, 260],
  ["hair_girl_bun_wine_bow", "avatar", GIRL, 320],
  ["hair_girl_chestnut_butterfly", "avatar", GIRL, 320],
  ["hair_girl_copper_soft_waves", "avatar", GIRL, 380],
  ["hair_girl_ink_twin_braids", "avatar", GIRL, 380],
  ["hair_girl_caramel_braid_crown", "avatar", GIRL, 450],
  ["clip_girl_pearl_bar_pair", "avatar", GIRL, 80],
  ["necklace_girl_pearl_drop", "avatar", GIRL, 150],
  ["shoes_girl_camel_ankle_boots", "avatar", GIRL, 200],
  ["top_girl_camel_vest_tee", "avatar", GIRL, 220],
  ["top_girl_white_poplin_shirt", "avatar", GIRL, 220],
  ["top_girl_breton_stripe", "avatar", GIRL, 220],
  ["top_girl_sage_knit_polo", "avatar", GIRL, 220],
  ["top_girl_rose_pearl_cardigan", "avatar", GIRL, 240],
  ["jacket_girl_light_denim_crop", "avatar", GIRL, 260],
  ["jacket_girl_black_crop_blazer", "avatar", GIRL, 320],
  ["room_v3_bed_japon_sakura", "room", null, 480],
  ["room_v3_bed_oyun_gingham", "room", null, 480],
  ["room_v3_pouf_oyun_bearpurple", "room", null, 120],
  ["room_v3_pouf_oyun_bunnypink", "room", null, 120],
  ["room_v3_rug_oyun_tea", "room", null, 120],
  ["room_v3_rug_japon_tea", "room", null, 150],
  ["room_v3_rug_japon_botanic", "room", null, 180],
  ["room_v3_rug_oyun_checker", "room", null, 180],
  ["room_v3_rug_oyun_cloud", "room", null, 180],
  ["room_v2_chair_blush", "room", null, 250],
  ["room_v3_armchair_japon_cream", "room", null, 300],
  ["room_v3_sofa_japon_cream", "room", null, 480],
  ["room_v3_nightstand_japon_cedar", "room", null, 180],
  ["room_v3_nightstand_oyun_honey", "room", null, 180],
  ["room_v3_bookshelf_japon_rattan", "room", null, 260],
  ["room_v3_bookshelf_oyun_cream", "room", null, 260],
  ["room_v3_clothesrack_japon_bamboo", "room", null, 260],
  ["room_v3_dresser_oyun_honey", "room", null, 300],
  ["room_v3_teaset_japon_zaisu", "room", null, 160],
  ["room_v3_coffeetable_japon_round", "room", null, 200],
  ["room_v3_snacktable_oyun_round", "room", null, 200],
  ["room_v3_teaset_oyun_flower", "room", null, 260],
  ["room_v3_tvunit_japon_rattan", "room", null, 300],
  ["room_v3_tvunit_oyun_game", "room", null, 300],
  ["room_v3_clock_japon_flower", "room", null, 80],
  ["room_v3_frame_japon_sakura", "room", null, 80],
  ["room_v3_poster_oyun_bunny", "room", null, 80],
  ["room_v3_poster_oyun_controller", "room", null, 80],
]

// Every one of these items is still held; lift only the holds, so the purchase runs the real server path.
const HOLDS_LIFTED: ReleaseCatalog = { ...BLUMI_R1_RELEASE_CATALOG, heldScopes: [] }

test("the lead price sheet names 62 distinct items", () => {
  assert.equal(new Set(LEAD_PRICES.map(([itemId]) => itemId)).size, 62)
})

test("every unreceipted economy v1 item stays held in the real release catalog, so none is sold yet", async () => {
  const service = createEconomyService({ catalog: DOMAIN_ECONOMY_CATALOG })
  for (const [itemId, type, bodyId] of LEAD_PRICES) {
    await assert.rejects(
      service.purchaseItem(`user_held_${itemId}`, { itemId, type, avatarBodyId: bodyId ?? GIRL }),
      /not available/,
      itemId
    )
  }
})

test("once its hold lifts, every economy v1 item sells on the server at exactly its lead price", async () => {
  const service = createEconomyService({ catalog: DOMAIN_ECONOMY_CATALOG, releaseCatalog: HOLDS_LIFTED })
  for (const [itemId, type, bodyId, leadPrice] of LEAD_PRICES) {
    const userId = `user_price_${itemId}`
    assert.equal((await service.getInventory(userId)).coins, STARTER_COIN_BALANCE)
    const purchase = await service.purchaseItem(userId, { itemId, type, avatarBodyId: bodyId ?? GIRL })
    assert.equal(purchase.priceCoins, leadPrice, itemId)
    assert.equal(purchase.inventory.coins, STARTER_COIN_BALANCE - leadPrice, itemId)
  }
})
