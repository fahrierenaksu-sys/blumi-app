import type { ImageSourcePropType } from "react-native"
import { buildAvatarShopCatalogItem } from "../../shop/shopCatalog"
import { isAvatarV2ItemCompatibleWithBody } from "../avatarBodyCompatibility"
import type { AvatarCatalogItem, AvatarInventory, UserAvatar } from "../avatarV2.types"
import { isAvatarV2ItemEquipped } from "../avatarV2Selectors"
import { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } from "../room/avatarRoomProjection"
import {
  getWardrobeCategoryItems,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"

export interface WardrobeCatalogCardModel {
  item: AvatarCatalogItem
  equipped: boolean
  itemStateLabel: string
  locked: boolean
  previewSource?: ImageSourcePropType
}

export interface WardrobeCatalogCopy {
  choose: string
  equipped: string
  roomFitPending: string
  switchBase: string
  fullLook: string
  tryOn: string
}

export function isAvatarItemRoomPreviewSupported(item: AvatarCatalogItem): boolean {
  return item.id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP
}

/**
 * Items shown for a category: body-compatible, room-preview supported, and
 * equippable (ownership is decided by the caller's `canEquipItem`).
 */
export function getWardrobeActiveItems(input: {
  catalog: AvatarCatalogItem[]
  category: WardrobeCategoryId
  bodyId: string
  canEquipItem: (item: AvatarCatalogItem) => boolean
}): AvatarCatalogItem[] {
  return getWardrobeCategoryItems(input.catalog, input.category).filter(
    (item) =>
      isAvatarV2ItemCompatibleWithBody(item, input.bodyId) &&
      isAvatarItemRoomPreviewSupported(item) &&
      input.canEquipItem(item)
  )
}

/** Equipped items first; otherwise the incoming order is preserved. */
export function sortWardrobeItemsEquippedFirst(
  items: readonly AvatarCatalogItem[],
  avatar: UserAvatar
): AvatarCatalogItem[] {
  return [...items].sort((left, right) => {
    const leftEquipped = isAvatarV2ItemEquipped(avatar, left)
    const rightEquipped = isAvatarV2ItemEquipped(avatar, right)
    if (leftEquipped === rightEquipped) return 0
    return leftEquipped ? -1 : 1
  })
}

export function resolveWardrobeEquippedLabel(input: {
  items: readonly AvatarCatalogItem[]
  displayedAvatar: UserAvatar
  categoryLabel: string
  copy: Pick<WardrobeCatalogCopy, "choose" | "equipped" | "roomFitPending">
}): string {
  const equipped = input.items.find((item) =>
    isAvatarV2ItemEquipped(input.displayedAvatar, item)
  )
  if (!equipped) return `${input.copy.choose}: ${input.categoryLabel}`
  if (!isAvatarItemRoomPreviewSupported(equipped)) {
    return `${equipped.name}: ${input.copy.roomFitPending}`
  }
  return `${equipped.name} ${input.copy.equipped}`
}

export function buildWardrobeCards(input: {
  items: readonly AvatarCatalogItem[]
  avatar: UserAvatar
  displayedAvatar: UserAvatar
  inventory: AvatarInventory
  canEquipItem: (item: AvatarCatalogItem) => boolean
  copy: WardrobeCatalogCopy
  getPreviewSource: (item: AvatarCatalogItem) => ImageSourcePropType | undefined
}): WardrobeCatalogCardModel[] {
  const { avatar, displayedAvatar, inventory, canEquipItem, copy } = input
  return input.items.map((item) => {
    const catalogItem = buildAvatarShopCatalogItem({
      item,
      avatar,
      inventory
    })
    const canEquip = canEquipItem(item)
    const roomPreviewSupported = isAvatarItemRoomPreviewSupported(item)
    const locked = !canEquip || !roomPreviewSupported
    const equipped = isAvatarV2ItemEquipped(displayedAvatar, item) && roomPreviewSupported
    const previewSource = input.getPreviewSource(item)
    const itemStateLabel = !roomPreviewSupported
      ? copy.roomFitPending
      : locked
        ? catalogItem.stateLabel
        : item.type === "body"
          ? copy.switchBase
          : item.outfitKey
            ? copy.fullLook
            : copy.tryOn

    return {
      item,
      equipped,
      itemStateLabel,
      locked,
      previewSource
    }
  })
}

export function getAvatarItemPreviewImageStyle(
  item: AvatarCatalogItem
): {
  width: number
  height: number
  transform: { translateY: number }[]
} {
  if (item.type === "top") {
    if (
      item.id === "avatar_v2_top_default" ||
      item.id === "avatar_v2_top_cream_basic_tee"
    ) {
      return { width: 170, height: 255, transform: [{ translateY: -24 }] }
    }
    return { width: 178, height: 267, transform: [{ translateY: -60 }] }
  }
  if (item.type === "bottom") {
    return { width: 196, height: 294, transform: [{ translateY: -116 }] }
  }
  if (item.type === "shoes") {
    return { width: 196, height: 294, transform: [{ translateY: -130 }] }
  }
  if (item.type === "hair") {
    return { width: 100, height: 100, transform: [{ translateY: 0 }] }
  }
  if (item.type === "eyes" || item.type === "nose" || item.type === "mouth") {
    return { width: 172, height: 172, transform: [{ translateY: -8 }] }
  }
  return { width: 142, height: 213, transform: [{ translateY: -32 }] }
}
