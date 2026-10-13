import { DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { AvatarRigId } from "./avatarRoomContract"

/** The worn slots the rigs draw, in painter's slot order (shoes under bottom under top under hair). */
export const AVATAR_ART_SLOTS = ["shoes", "bottom", "top", "hair"] as const
export type AvatarArtSlot = (typeof AVATAR_ART_SLOTS)[number]

/** The stored body the boy rig draws; every other body is drawn by the girl rig. */
export const AVATAR_BOY_BODY_ID = DEFAULT_MALE_AVATAR_LOADOUT.bodyId

/** Which rig draws this body (read only; the stored profile is never changed). */
export function avatarRigForBody(bodyId: string): AvatarRigId {
  return bodyId === AVATAR_BOY_BODY_ID ? "male" : "female"
}

/**
 * Canonical item ID → the rig item that draws it, per body. IDs never change (AGENTS.md). An item enters here in
 * the same commit as its rig art and its stills (plan §5.5).
 */
export const AVATAR_ITEM_ART: Readonly<Record<AvatarRigId, Readonly<Record<string, string>>>> = {
  female: {
    avatar_v2_hair_ink_pageboy_star: "hair_ink_pageboy_star",
    avatar_v2_top_coral_wave_polo: "top_coral_wave_polo",
    avatar_v2_bottom_coral_wave_pants: "bottom_coral_wave_pants",
    avatar_v2_shoes_mint_ribbon_court_sneakers: "shoes_mint_ribbon_court_sneakers"
  },
  // the boy's 2.5D wardrobe PREVIEW (domain boyWardrobePreview.ts; QA unlock only, no receipts)
  male: {
    avatar_v2_hair_male_blue_black_curls: "hair_male_curls",
    avatar_v2_hair_male_textured_twists: "hair_male_twists",
    avatar_v2_top_male_navy_knit_polo: "top_male_c2",
    avatar_v2_bottom_male_cream_pleated_trousers: "bottom_male_c2",
    avatar_v2_shoes_male_tan_loafers: "shoes_male_c2",
    avatar_v2_top_male_olive_overshirt: "top_male_c3",
    avatar_v2_bottom_male_dark_straight_jeans: "bottom_male_c3",
    avatar_v2_shoes_male_sand_desert_boots: "shoes_male_c3",
    avatar_v2_top_male_forest_collar_sweater: "top_male_c4",
    avatar_v2_bottom_male_charcoal_trousers: "bottom_male_c4",
    avatar_v2_shoes_male_brown_loafers: "shoes_male_c4",
    avatar_v2_top_male_black_embroidered_sweatshirt: "top_male_c12",
    avatar_v2_bottom_male_cream_drawstring_trousers: "bottom_male_c12",
    avatar_v2_shoes_male_cream_chunky_sneakers: "shoes_male_c12",
    avatar_v2_top_male_taupe_waffle_blouson: "top_male_c13",
    avatar_v2_bottom_male_ecru_wide_trousers: "bottom_male_c13",
    avatar_v2_shoes_male_dark_leather_sneakers: "shoes_male_c13",
    avatar_v2_top_male_check_flannel_white_tee: "top_male_c14w",
    avatar_v2_bottom_male_grey_wide_jeans: "bottom_male_c14w",
    avatar_v2_shoes_male_green_skate_shoes: "shoes_male_c14w",
    avatar_v2_top_male_white_basic_tee: "top_male_basic_a",
    avatar_v2_bottom_male_black_straight_trousers: "bottom_male_basic_a",
    avatar_v2_shoes_male_black_clean_sneakers: "shoes_male_basic_a",
    avatar_v2_top_male_black_basic_tee: "top_male_basic_b",
    avatar_v2_bottom_male_black_pocket_trousers: "bottom_male_basic_b",
    avatar_v2_shoes_male_black_everyday_sneakers: "shoes_male_basic_b"
  }
}

/**
 * Draw-only fallback (plan §2.4, review R3): a worn slot whose item has no rig art for that body is drawn as this
 * body's RIG starter piece. It never changes the stored or validated loadout and never affects ownership.
 * The boy (preview) is drawn in the curls and the basic_a outfit until he wears a wardrobe piece.
 */
export const AVATAR_RIG_STARTER: Readonly<Record<AvatarRigId, Readonly<Partial<Record<AvatarArtSlot, string>>>>> = {
  female: {
    hair: "avatar_v2_hair_ink_pageboy_star",
    top: "avatar_v2_top_coral_wave_polo",
    bottom: "avatar_v2_bottom_coral_wave_pants",
    shoes: "avatar_v2_shoes_mint_ribbon_court_sneakers"
  },
  male: {
    hair: "avatar_v2_hair_male_blue_black_curls",
    top: "avatar_v2_top_male_white_basic_tee",
    bottom: "avatar_v2_bottom_male_black_straight_trousers",
    shoes: "avatar_v2_shoes_male_black_clean_sneakers"
  }
}

/** Every (body, canonical item) pair that has rig art: what the stills must cover (plan §10.2, review R4). */
export function listAvatarItemArt(): { rig: AvatarRigId; itemId: string; rigItemId: string }[] {
  return (Object.keys(AVATAR_ITEM_ART) as AvatarRigId[]).flatMap((rig) =>
    Object.entries(AVATAR_ITEM_ART[rig]).map(([itemId, rigItemId]) => ({ rig, itemId, rigItemId })))
}

/** Whether a body's 2.5D rig draws this canonical item (the wardrobe lists it for room preview). */
export function hasAvatarItemRigArt(itemId: string): boolean {
  return Object.values(AVATAR_ITEM_ART).some((art) => itemId in art)
}
