/**
 * The boy's 2.5D wardrobe (2026-10-13, branch wip/boy-wardrobe-preview): 8 outfits × top/bottom/shoes + 2 hairs, with
 * the canonical IDs proposed in docs/release/AVATAR_25D_INTEGRATION_PLAN.md §5.1. The two basic_b bottom/shoes IDs are
 * minted here (§5.1 lists five basic IDs for six pieces). All are NEW IDs (no old ID is renamed or reused). By the
 * owner's decision for testing they are free and owned by every account: the economy catalog lists them at 0 coins with
 * ownedByDefault (server-authoritative, the inventory self-heal grants them to existing accounts). They have no receipt
 * and are never sold (hidden from the shop).
 *
 * 2026-10-15 (owner price yes): the four starters stay free and owned by default; the other 22 pieces are listed in the
 * Shop and sold at R1_WARDROBE_PRICE_COINS (economyCatalog.ts) through their receipts. Rows already granted stay owned.
 */
export const BOY_WARDROBE_PREVIEW_ITEM_IDS = {
  hair: ["avatar_v2_hair_male_blue_black_curls", "avatar_v2_hair_male_textured_twists"],
  top: [
    "avatar_v2_top_male_navy_knit_polo",
    "avatar_v2_top_male_olive_overshirt",
    "avatar_v2_top_male_forest_collar_sweater",
    "avatar_v2_top_male_black_embroidered_sweatshirt",
    "avatar_v2_top_male_taupe_waffle_blouson",
    "avatar_v2_top_male_check_flannel_white_tee",
    "avatar_v2_top_male_white_basic_tee",
    "avatar_v2_top_male_black_basic_tee",
  ],
  bottom: [
    "avatar_v2_bottom_male_cream_pleated_trousers",
    "avatar_v2_bottom_male_dark_straight_jeans",
    "avatar_v2_bottom_male_charcoal_trousers",
    "avatar_v2_bottom_male_cream_drawstring_trousers",
    "avatar_v2_bottom_male_ecru_wide_trousers",
    "avatar_v2_bottom_male_grey_wide_jeans",
    "avatar_v2_bottom_male_black_straight_trousers",
    "avatar_v2_bottom_male_black_pocket_trousers",
  ],
  shoes: [
    "avatar_v2_shoes_male_tan_loafers",
    "avatar_v2_shoes_male_sand_desert_boots",
    "avatar_v2_shoes_male_brown_loafers",
    "avatar_v2_shoes_male_cream_chunky_sneakers",
    "avatar_v2_shoes_male_dark_leather_sneakers",
    "avatar_v2_shoes_male_green_skate_shoes",
    "avatar_v2_shoes_male_black_clean_sneakers",
    "avatar_v2_shoes_male_black_everyday_sneakers",
  ],
} as const;

export const BOY_WARDROBE_PREVIEW_ALL_IDS: readonly string[] = Object.values(BOY_WARDROBE_PREVIEW_ITEM_IDS).flat();
