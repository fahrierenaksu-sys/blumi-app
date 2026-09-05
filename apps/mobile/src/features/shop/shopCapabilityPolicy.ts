import type { CapabilityMap } from "@blumi/contracts"

type ShopSessionMode = "production" | "demo"

export function isShopMultiItemApplyEnabled(
  sessionMode: ShopSessionMode,
  capabilities: Readonly<CapabilityMap>
): boolean {
  if (sessionMode !== "production") return true
  return capabilities.shop_multi_item_apply === true
}

export function canMerchandiseSemanticOutfits(
  sessionMode: ShopSessionMode,
  _capabilities: Readonly<CapabilityMap>,
  options: { fullCatalogQaPreview?: boolean } = {}
): boolean {
  if (sessionMode !== "production") return true
  if (options.fullCatalogQaPreview === true) return true
  // The server key combines dress and outerwear rendering. Mobile can project
  // dresses today but cannot render outerwear, so it must not claim or consume
  // the combined production capability until the complete contract exists.
  return false
}

/**
 * V2 outerwear is preserve-only until mobile has a dedicated catalog type,
 * renderer layer, compatibility metadata and approved assets. Existing
 * cardigans remain regular tops; the UI must not advertise a fake slot.
 */
export function isMobileOuterwearMerchandisingEnabled(): boolean {
  return false
}
