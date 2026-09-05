import {
  ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG,
  STARTER_COIN_BALANCE,
  getLegacyAvatarReplacementIds,
  resolveR1PublishedEconomyCatalog,
  type EconomyCatalogItem,
  type EconomyItemType
} from "@blumi/domain"

export { STARTER_COIN_BALANCE, getLegacyAvatarReplacementIds }
export type { EconomyCatalogItem, EconomyItemType }

/**
 * Production is fail-closed: paid catalog entries must be listed in the R1
 * receipt-backed catalog. Development remains capable of exercising planned
 * data, while the production process never receives it from this module.
 */
export function resolveProductionEconomyCatalog(
  catalog: readonly EconomyCatalogItem[] = DOMAIN_ECONOMY_CATALOG
): EconomyCatalogItem[] {
  return resolveR1PublishedEconomyCatalog(catalog)
}

export const ECONOMY_CATALOG: readonly EconomyCatalogItem[] =
  process.env.NODE_ENV === "production"
    ? resolveProductionEconomyCatalog()
    : DOMAIN_ECONOMY_CATALOG

export function findEconomyCatalogItem(
  itemId: string,
  type: EconomyItemType,
  catalog: readonly EconomyCatalogItem[] = ECONOMY_CATALOG
): EconomyCatalogItem | null {
  return catalog.find((item) => item.itemId === itemId && item.type === type) ?? null
}

export function getDefaultOwnedItemIds(
  type: EconomyItemType,
  catalog: readonly EconomyCatalogItem[] = ECONOMY_CATALOG
): string[] {
  return catalog
    .filter((item) => item.type === type && item.ownedByDefault === true)
    .map((item) => item.itemId)
}
