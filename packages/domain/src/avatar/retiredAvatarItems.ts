import { RETIRING_AVATAR_ITEM_IDS } from "../legacy/legacyItemIds"

/**
 * Old avatar items retired by the 2.5D world (plan X15), plus the boy's pre-2.5D starter pieces (the side part and
 * the interim garments), retired when his starter became the curls and the basic_a outfit (2026-10-13). Stable IDs
 * stay in the catalogs, purchase history, inventories and stored loadouts, and are never deleted or reused; they are
 * only hidden: never sold, listed, offered in the wardrobe or saved into a new look, and a stored look that holds one
 * reads as the body's starter piece for that slot (`coerceAvatarLoadout`).
 */
export const RETIRED_AVATAR_ITEM_IDS: ReadonlySet<string> = new Set<string>(RETIRING_AVATAR_ITEM_IDS)

export function isRetiredAvatarItemId(itemId: string): boolean {
  return RETIRED_AVATAR_ITEM_IDS.has(itemId)
}
