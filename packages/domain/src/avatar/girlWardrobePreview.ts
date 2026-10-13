/**
 * The girl's 2.5D wardrobe additions (2026-10-13): the factory-finished white and black crop tops and black high-waist
 * trousers, with the canonical IDs proposed in docs/release/AVATAR_25D_INTEGRATION_PLAN.md (§5.1: girl basics). All are
 * NEW IDs (no old ID is renamed or reused). Like the boy's wardrobe (boyWardrobePreview.ts), during testing they are
 * free and owned by every account: the economy catalog lists them at 0 coins with ownedByDefault (server-authoritative,
 * the inventory self-heal grants them to existing accounts). They have no receipt, are never sold (hidden from the
 * shop) and are loadout-valid for the girl's body only. The crop tops bare her waist (the owner-approved belly,
 * 2026-10-13) and the trousers bring their own torso, arms and seated card (renderer avatar25BodySwap).
 */
export const GIRL_WARDROBE_PREVIEW_ITEM_IDS = {
  hair: [],
  top: ["avatar_v2_top_white_cute_crop_top", "avatar_v2_top_black_cute_crop_top"],
  bottom: ["avatar_v2_bottom_black_highwaist_trousers"],
  shoes: [],
} as const satisfies Record<"hair" | "top" | "bottom" | "shoes", readonly string[]>;

export const GIRL_WARDROBE_PREVIEW_ALL_IDS: readonly string[] = Object.values(GIRL_WARDROBE_PREVIEW_ITEM_IDS).flat();
