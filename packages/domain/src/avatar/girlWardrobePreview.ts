/**
 * The girl's 2.5D wardrobe additions (2026-10-13, release/2.5d-beta-3): the factory-finished ribbon waves hair and
 * white sneakers, with the canonical IDs proposed in docs/release/AVATAR_25D_INTEGRATION_PLAN.md (§5.1: girl hairs,
 * girl basics). Both are NEW IDs (no old ID is renamed or reused). Like the boy's wardrobe (boyWardrobePreview.ts),
 * during testing they are free and owned by every account: the economy catalog lists them at 0 coins with
 * ownedByDefault (server-authoritative, the inventory self-heal grants them to existing accounts). They have no
 * receipt, are never sold (hidden from the shop) and are loadout-valid for the girl's body only.
 *
 * 2026-10-14 (wip/girl-hairs): the factory-finished bob (side clip) and pigtails (bows) join on the same terms. They are
 * new designs with no planned `avatar_v2_` ID, so they keep the item IDs their art and rig use (`hair_girl_bob`,
 * `hair_girl_pigtails`); no old ID is renamed or reused.
 *
 * 2026-10-15 (owner price yes): all four are listed in the Shop and sold at R1_WARDROBE_PRICE_COINS (economyCatalog.ts)
 * through their receipts. Rows already granted while they were free stay owned.
 */
export const GIRL_WARDROBE_PREVIEW_ITEM_IDS = {
  hair: ["avatar_v2_hair_mocha_ribbon_waves", "hair_girl_bob", "hair_girl_pigtails"],
  top: [],
  bottom: [],
  shoes: ["avatar_v2_shoes_white_clean_sneakers"],
} as const satisfies Record<"hair" | "top" | "bottom" | "shoes", readonly string[]>;

export const GIRL_WARDROBE_PREVIEW_ALL_IDS: readonly string[] = Object.values(GIRL_WARDROBE_PREVIEW_ITEM_IDS).flat();
