import { R1_WARDROBE_PRICE_COINS } from "@blumi/domain"
import { findEconomyCatalogItem, type EconomyCatalogItem } from "./economyCatalog"

/**
 * Prices are for new accounts only (owner, PRICES_TR 2026-10-15: "fiyat sadece yeni hesaplar içindir"). Every account
 * created before the R1 price launch keeps, free, each wardrobe piece that was free and owned by default while the
 * wardrobes were in testing: the 26 pieces the approved table now prices (`R1_WARDROBE_PRICE_COINS`).
 *
 * This is a server rule, not a data backfill: the inventory read grants the pieces through the same self-heal that
 * grants default-owned items, the first time an eligible account reads its inventory. No row is written for any other
 * account, and the client never decides eligibility.
 */

/** The R1 price launch: the owner's price approval, 2026-10-15 11:17 +0300 (OWNER_DECISIONS.md). */
export const R1_PRICE_LAUNCH_AT = "2026-10-15T08:17:00.000Z"

const R1_PRICE_LAUNCH_MS = Date.parse(R1_PRICE_LAUNCH_AT)

/** The pieces that were free before the launch and are priced after it. */
export const LEGACY_FREE_WARDROBE_ITEM_IDS: readonly string[] = Object.freeze(Object.keys(R1_WARDROBE_PRICE_COINS))

/** True only for an account whose creation time is known and strictly before the price launch. */
export function isLegacyFreeWardrobeAccount(accountCreatedAt: string | null | undefined): boolean {
  if (typeof accountCreatedAt !== "string") return false
  const createdMs = Date.parse(accountCreatedAt)
  return Number.isFinite(createdMs) && createdMs < R1_PRICE_LAUNCH_MS
}

/** The legacy free pieces this catalog carries as avatar items (a catalog without them grants nothing). */
export function legacyFreeWardrobeItemIdsIn(catalog: readonly EconomyCatalogItem[]): readonly string[] {
  return LEGACY_FREE_WARDROBE_ITEM_IDS.filter((itemId) => findEconomyCatalogItem(itemId, "avatar", catalog) !== null)
}

/** Looks up when an account was created (ISO time), or null when the account is unknown. */
export type AccountCreatedAtLookup = (userId: string) => Promise<string | null>

/** Accounts remembered as not eligible before the memory is reset (creation times never change). */
const MAX_REMEMBERED_INELIGIBLE_ACCOUNTS = 50_000

/**
 * Decides, per inventory read, which legacy free pieces the account must hold. An account that already holds them
 * all, or that is known to be created after the launch, costs no lookup.
 */
export function createLegacyFreeWardrobeGrant(input: {
  catalog: readonly EconomyCatalogItem[]
  getAccountCreatedAt?: AccountCreatedAtLookup
}): (userId: string, ownedAvatarItemIds: readonly string[]) => Promise<readonly string[]> {
  const grantableIds = legacyFreeWardrobeItemIdsIn(input.catalog)
  const lookup = input.getAccountCreatedAt
  let ineligibleUserIds = new Set<string>()

  return async (userId, ownedAvatarItemIds) => {
    if (!lookup || grantableIds.length === 0) return []
    if (grantableIds.every((itemId) => ownedAvatarItemIds.includes(itemId))) return []
    if (ineligibleUserIds.has(userId)) return []
    if (isLegacyFreeWardrobeAccount(await lookup(userId))) return grantableIds
    if (ineligibleUserIds.size >= MAX_REMEMBERED_INELIGIBLE_ACCOUNTS) ineligibleUserIds = new Set<string>()
    ineligibleUserIds.add(userId)
    return []
  }
}
