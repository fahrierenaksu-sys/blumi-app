import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  isRetiredAvatarItemId
} from "@blumi/domain"
import type {
  AvatarCatalogItem,
  AvatarItemType,
  UserAvatar
} from "./avatarV2.types"

const LEGACY_FEMALE_BODY_ID = "avatar_v2_body_default"

export function isAvatarV2ItemCompatibleWithBody(
  item: AvatarCatalogItem,
  bodyId: string
): boolean {
  if (item.type === "body") return true
  return (item.compatibleBodyIds ?? [LEGACY_FEMALE_BODY_ID]).includes(bodyId)
}

export function getAvatarV2ItemsCompatibleWithBody(
  catalog: AvatarCatalogItem[],
  type: AvatarItemType,
  bodyId: string
): AvatarCatalogItem[] {
  return catalog.filter(
    (item) =>
      item.type === type &&
      item.hiddenFromWardrobe !== true &&
      isAvatarV2ItemCompatibleWithBody(item, bodyId)
  ).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getAvatarV2ShopItemsCompatibleWithBody(
  catalog: AvatarCatalogItem[],
  bodyId: string
): AvatarCatalogItem[] {
  return catalog.filter(
    (item) =>
      item.type !== "body" &&
      item.hiddenFromShop !== true &&
      isAvatarV2ItemCompatibleWithBody(item, bodyId)
  )
}

type StarterSlotKey = "faceId" | "eyesId" | "noseId" | "mouthId" | "hairId" | "topId" | "bottomId" | "shoesId"

function starterLookForBody(bodyId: string): Readonly<Record<StarterSlotKey, string>> | undefined {
  return [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT].find((look) => look.bodyId === bodyId)
}

export function normalizeAvatarV2ForBody(
  avatar: UserAvatar,
  bodyId: string,
  catalog: AvatarCatalogItem[]
): UserAvatar {
  let next = { ...avatar, bodyId, accessoryIds: [...avatar.accessoryIds] }
  const slots: Exclude<AvatarItemType, "body" | "accessory">[] = [
    "face", "eyes", "nose", "mouth", "hair", "top", "bottom", "shoes"
  ]
  for (const slot of slots) {
    const key = `${slot}Id` as keyof UserAvatar
    const selectedId = next[key] as string
    const selected = catalog.find((item) => item.id === selectedId && item.type === slot)
    if (selected && !isRetiredAvatarItemId(selected.id) && isAvatarV2ItemCompatibleWithBody(selected, bodyId)) continue
    const candidates = catalog.filter(
      (item) =>
        item.type === slot &&
        !isRetiredAvatarItemId(item.id) &&
        isAvatarV2ItemCompatibleWithBody(item, bodyId)
    )
    // the body's own starter piece wins over other free pieces (the boy's free wardrobe is also owned by default)
    const starterId = starterLookForBody(bodyId)?.[key as StarterSlotKey]
    const fallback = candidates.find((item) => item.id === starterId)
      ?? [...candidates]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .find((item) => item.ownedByDefault === true || item.isDefault === true)
    if (fallback) next = { ...next, [key]: fallback.id }
  }
  const accessoryIds = next.accessoryIds.filter((id) => {
    const item = catalog.find((entry) => entry.id === id && entry.type === "accessory")
    return item ? isAvatarV2ItemCompatibleWithBody(item, bodyId) : false
  })
  return { ...next, accessoryIds }
}
