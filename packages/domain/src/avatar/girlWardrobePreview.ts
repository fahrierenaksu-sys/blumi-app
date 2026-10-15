/**
 * The girl's 2.5D wardrobe additions (2026-10-13, release/2.5d-beta-3): the factory-finished ribbon waves hair and
 * white sneakers, with the canonical IDs proposed in docs/release/AVATAR_25D_INTEGRATION_PLAN.md (§5.1: girl hairs,
 * girl basics). Both are NEW IDs (no old ID is renamed or reused). Like the boy's wardrobe (boyWardrobePreview.ts),
 * during testing they are free and owned by every account: the economy catalog lists them at 0 coins with
 * ownedByDefault (server-authoritative, the inventory self-heal grants them to existing accounts). They have no
 * receipt, are never sold (hidden from the shop) and are loadout-valid for the girl's body only.
 *
 * 2026-10-13 (wip/body-replacement-2): the white and black crop tops and the black high-waist trousers join on the same
 * terms (girl basics, NEW IDs). The crop tops bare her waist (the owner-approved belly, 2026-10-13) and the trousers
 * bring their own torso, arms and seated card (renderer avatar25BodySwap).
 *
 * 2026-10-14 (wip/girl-hairs): the factory-finished bob (side clip) and pigtails (bows) join on the same terms. They are
 * new designs with no planned `avatar_v2_` ID, so they keep the item IDs their art and rig use (`hair_girl_bob`,
 * `hair_girl_pigtails`); no old ID is renamed or reused.
 *
 * 2026-10-14 (wip/girl-jacket): the factory-finished sage ribbon knit jacket joins on the same terms. It is the 2.5D
 * redraw of the retired `avatar_v2_top_sage_ribbon_knit_jacket` (X15; that ID stays retired, priced and untouched, as
 * the plan does for every redrawn old piece) and keeps the item ID its art and rig use, `top_sage_ribbon_knit_jacket`.
 */
export const GIRL_WARDROBE_PREVIEW_ITEM_IDS = {
  hair: ["avatar_v2_hair_mocha_ribbon_waves", "hair_girl_bob", "hair_girl_pigtails"],
  top: ["avatar_v2_top_white_cute_crop_top", "avatar_v2_top_black_cute_crop_top", "top_sage_ribbon_knit_jacket"],
  bottom: ["avatar_v2_bottom_black_highwaist_trousers"],
  shoes: ["avatar_v2_shoes_white_clean_sneakers"],
} as const satisfies Record<"hair" | "top" | "bottom" | "shoes", readonly string[]>;

export const GIRL_WARDROBE_PREVIEW_ALL_IDS: readonly string[] = Object.values(GIRL_WARDROBE_PREVIEW_ITEM_IDS).flat();
