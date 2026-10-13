import { RETIRING_AVATAR_ITEM_IDS } from "../legacy/legacyItemIds"

/**
 * The boy has no 2.5D outfit in the repo yet (plan X15 prerequisite "first boy outfit or the bare-base
 * fallback"). Until his outfit 2 lands, his three old free starter garments stay active so his look stays
 * valid under the strict rules (top, bottom and shoes are required); the 2.5D renderers draw them as his
 * bare base. The commit that adds outfit 2 retires them like every other old item.
 */
export const INTERIM_MALE_STARTER_ITEM_IDS: readonly string[] = Object.freeze([
  "avatar_v2_top_male_powder_blue_crew_tee",
  "avatar_v2_bottom_male_navy_straight_pants",
  "avatar_v2_shoes_male_milk_tea_court"
])

/**
 * Old avatar items retired by the 2.5D world (plan X15). Stable IDs stay in the catalogs, purchase history,
 * inventories and stored loadouts, and are never deleted or reused; they are only hidden: never sold, listed,
 * offered in the wardrobe or saved into a new look, and a stored look that holds one reads as the body's
 * starter piece for that slot (`coerceAvatarLoadout`).
 */
export const RETIRED_AVATAR_ITEM_IDS: ReadonlySet<string> = new Set<string>(
  RETIRING_AVATAR_ITEM_IDS.filter((itemId) => !INTERIM_MALE_STARTER_ITEM_IDS.includes(itemId))
)

export function isRetiredAvatarItemId(itemId: string): boolean {
  return RETIRED_AVATAR_ITEM_IDS.has(itemId)
}
