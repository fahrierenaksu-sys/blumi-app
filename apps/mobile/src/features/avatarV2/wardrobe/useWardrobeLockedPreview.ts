import { ECONOMY_CATALOG, resolveR1PublishedEconomyCatalog } from "@blumi/domain"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AccessibilityInfo } from "react-native"
import { hapticSelection } from "../../../ui/haptics"
import { getShopProductThumbnailSource } from "../../shop/shopAssets"
import { isAvatarItemSoldInShop } from "../../shop/shopListingModel"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import { equipAvatarV2Item } from "../avatarV2Selectors"
import { buildWardrobeShopLink } from "./wardrobeCatalogModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"

interface WardrobeLockedPreviewNavigation {
  addListener: (event: "blur", callback: () => void) => () => void
  navigate: (
    route: "CosmeticShop",
    params: ReturnType<typeof buildWardrobeShopLink>
  ) => void
}

/**
 * Locked wardrobe items (owner decision, MICRO-3). The closet shows the
 * unowned items the production Shop sells as locked cards; tapping one tries
 * it on the stage only (never saved, never equipped: ownership still comes
 * only from the server inventory) and offers "See in Shop", which opens that
 * product by its canonical id. Leaving the screen or switching category ends
 * the preview.
 */
export function useWardrobeLockedPreview(input: {
  navigation: WardrobeLockedPreviewNavigation
  displayedAvatar: UserAvatar
  copy: WardrobeStudioCopy
}) {
  const { navigation, displayedAvatar, copy } = input
  const [lockedItem, setLockedItem] = useState<AvatarCatalogItem | null>(null)
  const isAvailableInShop = useMemo(() => {
    const listing = {
      publishedCatalog: resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG),
      hasShopThumbnail: (itemId: string) => getShopProductThumbnailSource(itemId) !== undefined
    }
    return (item: AvatarCatalogItem) => isAvatarItemSoldInShop(item, listing)
  }, [])

  useEffect(() => navigation.addListener("blur", () => setLockedItem(null)), [navigation])

  const previewLockedItem = useCallback((item: AvatarCatalogItem): void => {
    hapticSelection()
    setLockedItem((current) => (current?.id === item.id ? null : item))
    AccessibilityInfo.announceForAccessibility(copy.lockedPreviewTitle(item.name))
  }, [copy])
  const clearLockedPreview = useCallback((): void => setLockedItem(null), [])
  const openLockedItemInShop = useCallback((): void => {
    if (!lockedItem) return
    navigation.navigate("CosmeticShop", buildWardrobeShopLink(lockedItem, Date.now()))
  }, [lockedItem, navigation])

  const stageAvatar = useMemo(
    () => (lockedItem ? equipAvatarV2Item(displayedAvatar, lockedItem) : displayedAvatar),
    [displayedAvatar, lockedItem]
  )
  return {
    lockedItem,
    stageAvatar,
    isAvailableInShop,
    previewLockedItem,
    clearLockedPreview,
    openLockedItemInShop
  }
}
