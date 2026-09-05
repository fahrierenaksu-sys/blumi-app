import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"

interface OutfitDefaults {
  topId: string
  bottomId: string
}

export function applyAvatarOutfitSelection(
  avatar: UserAvatar,
  item: AvatarCatalogItem,
  catalog: AvatarCatalogItem[],
  defaults: OutfitDefaults
): UserAvatar {
  if (item.type === "top") {
    const pairedBottom = item.pairedItemId
      ? catalog.find((entry) => entry.id === item.pairedItemId && entry.type === "bottom")
      : undefined
    if (pairedBottom) {
      const currentTop = catalog.find((entry) => entry.id === avatar.topId)
      const currentBottom = catalog.find((entry) => entry.id === avatar.bottomId)
      return {
        ...avatar,
        dressId: item.id,
        topId: currentTop?.outfitKey ? defaults.topId : avatar.topId,
        bottomId: currentBottom?.outfitKey ? defaults.bottomId : avatar.bottomId
      }
    }

    const currentBottom = catalog.find((entry) => entry.id === avatar.bottomId)
    return {
      ...avatar,
      topId: item.id,
      bottomId: currentBottom?.outfitKey ? defaults.bottomId : avatar.bottomId,
      dressId: null
    }
  }

  if (item.type === "bottom") {
    const currentTop = catalog.find((entry) => entry.id === avatar.topId)
    return {
      ...avatar,
      topId: currentTop?.outfitKey ? defaults.topId : avatar.topId,
      bottomId: item.id,
      dressId: null
    }
  }

  return avatar
}

export function projectSemanticDressForLegacyRenderer(
  avatar: UserAvatar,
  catalog: readonly AvatarCatalogItem[]
): UserAvatar {
  if (!avatar.dressId) return avatar

  const dressTop = catalog.find(
    (item) => item.id === avatar.dressId && item.type === "top" && Boolean(item.outfitKey)
  )
  const pairedBottom = dressTop?.pairedItemId
    ? catalog.find(
        (item) => item.id === dressTop.pairedItemId && item.type === "bottom"
      )
    : undefined

  if (!dressTop || !pairedBottom) return avatar
  return {
    ...avatar,
    topId: dressTop.id,
    bottomId: pairedBottom.id
  }
}

export function normalizeAvatarOutfitSelection(
  avatar: UserAvatar,
  catalog: AvatarCatalogItem[],
  defaults: OutfitDefaults
): UserAvatar {
  const top = catalog.find((item) => item.id === avatar.topId && item.type === "top")
  const pairedBottom = top?.pairedItemId
    ? catalog.find((item) => item.id === top.pairedItemId && item.type === "bottom")
    : undefined

  if (pairedBottom && avatar.bottomId !== pairedBottom.id) {
    return { ...avatar, bottomId: pairedBottom.id }
  }

  const bottom = catalog.find((item) => item.id === avatar.bottomId && item.type === "bottom")
  if (!top?.outfitKey && bottom?.outfitKey) {
    return { ...avatar, bottomId: defaults.bottomId }
  }

  return avatar
}
