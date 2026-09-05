import type {
  AvatarCatalogItem,
  UserAvatar
} from "../avatarV2/avatarV2.types"
import type { ShopCombinationDraft } from "./shopCombinationState"

export function previewAvatarShopItem(
  avatar: UserAvatar,
  item: AvatarCatalogItem,
  catalog: readonly AvatarCatalogItem[]
): UserAvatar {
  if (item.type === "accessory" && avatar.accessoryIds.includes(item.id)) {
    return cloneAvatar(avatar)
  }
  if (item.type === "accessory") {
    const group = item.accessoryGroup ?? "eyewear"
    return {
      ...avatar,
      accessoryIds: [
        ...avatar.accessoryIds.filter((id) => {
          const equipped = catalog.find((entry) => entry.id === id)
          return (equipped?.accessoryGroup ?? "eyewear") !== group
        }),
        item.id
      ]
    }
  }
  if (item.type === "top") {
    const pairedBottom = item.pairedItemId
      ? catalog.find(
          (entry) => entry.id === item.pairedItemId && entry.type === "bottom"
        )
      : undefined
    return {
      ...avatar,
      topId: pairedBottom ? avatar.topId : item.id,
      bottomId: avatar.bottomId,
      dressId: pairedBottom ? item.id : null,
      accessoryIds: [...avatar.accessoryIds]
    }
  }
  if (item.type === "bottom") {
    return {
      ...avatar,
      bottomId: item.id,
      dressId: null,
      accessoryIds: [...avatar.accessoryIds]
    }
  }
  const key = `${item.type}Id` as keyof UserAvatar
  return {
    ...avatar,
    [key]: item.id,
    accessoryIds: [...avatar.accessoryIds]
  }
}

export function isAvatarShopItemPreviewing(
  avatar: UserAvatar,
  item: AvatarCatalogItem
): boolean {
  if (item.type === "accessory") return avatar.accessoryIds.includes(item.id)
  if (item.type === "top" && item.outfitKey) {
    return avatar.dressId === item.id
  }
  const key = `${item.type}Id` as keyof UserAvatar
  return avatar[key] === item.id
}

export function restoreAvatarShopItemPreview(
  draft: UserAvatar,
  equipped: UserAvatar,
  item: AvatarCatalogItem,
  catalog: readonly AvatarCatalogItem[]
): UserAvatar {
  if (item.type === "accessory") {
    const group = item.accessoryGroup ?? "eyewear"
    const accessoryIds = [
      ...draft.accessoryIds.filter((id) => {
        const entry = catalog.find((candidate) => candidate.id === id)
        return (entry?.accessoryGroup ?? "eyewear") !== group
      }),
      ...equipped.accessoryIds.filter((id) => {
        const entry = catalog.find((candidate) => candidate.id === id)
        return (entry?.accessoryGroup ?? "eyewear") === group
      })
    ]
    return { ...draft, accessoryIds: uniqueIds(accessoryIds) }
  }
  if (item.type === "top" && item.outfitKey) {
    return {
      ...draft,
      topId: equipped.topId,
      bottomId: equipped.bottomId,
      dressId: equipped.dressId ?? null,
      accessoryIds: [...draft.accessoryIds]
    }
  }
  const key = `${item.type}Id` as keyof UserAvatar
  return {
    ...draft,
    [key]: equipped[key],
    accessoryIds: [...draft.accessoryIds]
  }
}

export function avatarToShopCombinationDraft(
  avatar: UserAvatar
): ShopCombinationDraft {
  return {
    body: avatar.bodyId,
    face: avatar.faceId,
    eyes: avatar.eyesId,
    nose: avatar.noseId,
    mouth: avatar.mouthId,
    hair: avatar.hairId,
    dress: avatar.dressId ?? null,
    top: avatar.topId,
    bottom: avatar.bottomId,
    outerwear: avatar.outerwearId ?? null,
    shoes: avatar.shoesId,
    accessoryIds: [...avatar.accessoryIds]
  }
}

export function shopCombinationDraftToAvatar(
  draft: ShopCombinationDraft,
  fallback: UserAvatar
): UserAvatar {
  return {
    bodyId: draft.body ?? fallback.bodyId,
    faceId: draft.face ?? fallback.faceId,
    eyesId: draft.eyes ?? fallback.eyesId,
    noseId: draft.nose ?? fallback.noseId,
    mouthId: draft.mouth ?? fallback.mouthId,
    hairId: draft.hair ?? fallback.hairId,
    dressId: draft.dress ?? null,
    topId: draft.top ?? fallback.topId,
    bottomId: draft.bottom ?? fallback.bottomId,
    outerwearId: draft.outerwear === undefined
      ? fallback.outerwearId ?? null
      : draft.outerwear,
    shoesId: draft.shoes ?? fallback.shoesId,
    accessoryIds: [...(draft.accessoryIds ?? fallback.accessoryIds)]
  }
}

export function hasAvatarDraftChanges(
  equipped: UserAvatar,
  draft: UserAvatar
): boolean {
  return equipped.bodyId !== draft.bodyId ||
    equipped.faceId !== draft.faceId ||
    equipped.eyesId !== draft.eyesId ||
    equipped.noseId !== draft.noseId ||
    equipped.mouthId !== draft.mouthId ||
    equipped.hairId !== draft.hairId ||
    equipped.topId !== draft.topId ||
    equipped.bottomId !== draft.bottomId ||
    equipped.shoesId !== draft.shoesId ||
    (equipped.dressId ?? null) !== (draft.dressId ?? null) ||
    (equipped.outerwearId ?? null) !== (draft.outerwearId ?? null) ||
    !sameIds(equipped.accessoryIds, draft.accessoryIds)
}

function cloneAvatar(avatar: UserAvatar): UserAvatar {
  return { ...avatar, accessoryIds: [...avatar.accessoryIds] }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((id, index) => id === right[index])
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}
