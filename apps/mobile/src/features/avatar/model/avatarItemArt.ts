import { AVATAR_ITEM_RULES, DEFAULT_MALE_AVATAR_LOADOUT, findAvatarRuleItem, type AvatarItemRules } from "@blumi/domain"
import type { Rig25, Rig25Item } from "../renderer/rigTypes"
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
    avatar_v2_shoes_mint_ribbon_court_sneakers: "shoes_mint_ribbon_court_sneakers",
    // the girl's 2.5D wardrobe additions (domain girlWardrobePreview.ts)
    avatar_v2_hair_mocha_ribbon_waves: "hair_girl_waves",
    avatar_v2_shoes_white_clean_sneakers: "shoes_white_sneakers",
    hair_girl_bob: "hair_girl_bob",
    hair_girl_pigtails: "hair_girl_pigtails",
    avatar_v2_top_white_cute_crop_top: "top_crop_white",
    avatar_v2_top_black_cute_crop_top: "top_crop_black",
    avatar_v2_bottom_black_highwaist_trousers: "bottom_black_highwaist_straight",
    top_sage_ribbon_knit_jacket: "top_sage_ribbon_knit_jacket",
    top_powder_blue_ribbon_corset_top: "top_powder_blue_ribbon_corset_top",
    jacket_girl_light_denim_crop: "jacket_girl_light_denim_crop",
    jacket_girl_black_crop_blazer: "jacket_girl_black_crop_blazer",
    clip_girl_pearl_bar_pair: "clip_girl_pearl_bar_pair",
    hair_girl_bun_wine_bow: "hair_girl_bun_wine_bow",
    hair_girl_chestnut_butterfly: "hair_girl_chestnut_butterfly",
    hair_girl_ink_french_bob: "hair_girl_ink_french_bob",
    top_girl_camel_vest_tee: "top_girl_camel_vest_tee",
    top_girl_white_poplin_shirt: "top_girl_white_poplin_shirt",
    top_girl_rose_pearl_cardigan: "top_girl_rose_pearl_cardigan",
    top_girl_breton_stripe: "top_girl_breton_stripe",
    top_girl_sage_knit_polo: "top_girl_sage_knit_polo"
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

/** Accessory groups whose rig item must say so, because the exporter gives them their own draw order. */
const RIG_ORDERED_ACCESSORY_GROUPS: ReadonlySet<string> = new Set(["earrings"])

/** Why a rig item cannot draw this catalog item, or null when its slot agrees with the catalog. Pure. */
function rigSlotProblem(item: Rig25Item, rule: ReturnType<typeof findAvatarRuleItem>): string | null {
  const isEyewear = rule?.slot === "accessory" && rule.accessoryGroup === "eyewear"
  if ((item.slot === "glasses") !== isEyewear) return `rig slot ${item.slot}, catalog ${rule?.slot ?? "none"}/${rule?.accessoryGroup ?? "-"}`
  if ((item.slot === "dress") !== (rule?.slot === "dress")) return `rig slot ${item.slot}, catalog slot ${rule?.slot ?? "none"}`
  if (item.slot === "accessory" && rule?.slot !== "accessory") return `rig accessory, catalog slot ${rule?.slot ?? "none"}`
  if (item.group !== undefined && item.group !== rule?.accessoryGroup) return `rig group ${item.group}, catalog group ${rule?.accessoryGroup ?? "-"}`
  if (item.slot === "accessory" && RIG_ORDERED_ACCESSORY_GROUPS.has(rule?.accessoryGroup ?? "") && item.group !== rule?.accessoryGroup) {
    return `catalog group ${rule?.accessoryGroup} needs the rig group (its own draw order)`
  }
  return null
}

/**
 * Tree-wide guard (review slots_1330 MEDIUM-2): the room picks glasses and accessories by the rig slot, the server by
 * the catalog `accessoryGroup`. For every art entry and view: rig `glasses` exactly when the catalog item is eyewear,
 * rig `dress` exactly when the catalog slot is `dress`, rig `accessory` only for another accessory, and a rig `group`
 * equal to the catalog group (required for earrings). Returns one line per problem; [] when all agree. Pure.
 */
export function avatarItemArtSlotProblems(
  art: Readonly<Record<AvatarRigId, Readonly<Record<string, string>>>>,
  rigs: Readonly<Record<AvatarRigId, Rig25>>,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): string[] {
  return (Object.keys(art) as AvatarRigId[]).flatMap((rig) => Object.entries(art[rig]).flatMap(([itemId, rigItemId]) =>
    (["front", "back"] as const).flatMap((view) => {
      const item = rigs[rig].views[view].items[rigItemId]
      const problem = item ? rigSlotProblem(item, findAvatarRuleItem(rules, itemId)) : null
      return problem ? [`${rig} ${view} ${itemId}: ${problem}`] : []
    })))
}
