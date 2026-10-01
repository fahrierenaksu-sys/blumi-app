import type { ImageSourcePropType } from "react-native"
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
  /** A locked item currently tried on the stage without saving (MICRO-3). */
  previewing: boolean
  previewSource?: ImageSourcePropType
}

export interface WardrobeCatalogCopy {
  choose: string
  equipped: string
  roomFitPending: string
  switchBase: string
  fullLook: string
  tryOn: string
  lockedInShop: string
}

export function isAvatarItemRoomPreviewSupported(item: AvatarCatalogItem): boolean {
  return item.id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP
}

/**
 * Items shown for a category: body-compatible and room-preview supported;
 * equippable ones first (ownership is decided by the caller's
 * `canEquipItem`, i.e. the server inventory), then, by owner decision, the
 * unowned ones the Shop sells (`isAvailableInShop`) as locked cards. Catalog
 * order is kept within each group.
 */
export function getWardrobeActiveItems(input: {
  catalog: AvatarCatalogItem[]
  category: WardrobeCategoryId
  bodyId: string
  canEquipItem: (item: AvatarCatalogItem) => boolean
  isAvailableInShop?: (item: AvatarCatalogItem) => boolean
}): AvatarCatalogItem[] {
  const fitting = getWardrobeCategoryItems(input.catalog, input.category).filter(
    (item) =>
      isAvatarV2ItemCompatibleWithBody(item, input.bodyId) &&
      isAvatarItemRoomPreviewSupported(item)
  )
  const owned = fitting.filter((item) => input.canEquipItem(item))
  const isAvailableInShop = input.isAvailableInShop
  if (!isAvailableInShop) return owned
  const locked = fitting.filter((item) => !input.canEquipItem(item) && isAvailableInShop(item))
  return [...owned, ...locked]
}

/**
 * Route params for a locked card's "See in Shop": the item's own canonical
 * id (never a derived id) and a fresh request id so a repeat link refocuses.
 */
export function buildWardrobeShopLink(item: AvatarCatalogItem, requestId: number): {
  initialShopMode: "avatar"
  focusProductId: string
  focusRequestId: number
} {
  return { initialShopMode: "avatar", focusProductId: item.id, focusRequestId: requestId }
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
  /** The locked item being previewed on the stage, if any. */
  previewingItemId?: string | null
}): WardrobeCatalogCardModel[] {
  // `avatar` and `inventory` stay in the input for callers; a locked label no
  // longer comes from the (English) Shop catalog presentation.
  const { displayedAvatar, canEquipItem, copy } = input
  return input.items.map((item) => {
    const canEquip = canEquipItem(item)
    const roomPreviewSupported = isAvatarItemRoomPreviewSupported(item)
    const locked = !canEquip || !roomPreviewSupported
    const equipped = isAvatarV2ItemEquipped(displayedAvatar, item) && roomPreviewSupported
    const previewSource = input.getPreviewSource(item)
    const itemStateLabel = !roomPreviewSupported
      ? copy.roomFitPending
      : locked
        ? copy.lockedInShop
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
      previewing: locked && item.id === input.previewingItemId,
      previewSource
    }
  })
}

/**
 * Measured alpha bounds ([canvasW, canvasH, x, y, w, h]) of the starter
 * garments that are previewed straight from their 256x384 room layer, and the
 * box each is fitted into. Presenting the visible garment, not the transparent
 * canvas, keeps them centred in a card; the small shorts get a smaller box so
 * the low-resolution layer is not enlarged into a blur.
 */
const STARTER_LAYER_THUMBNAILS: Readonly<Record<string, {
  bounds: readonly number[]
  box: { readonly width: number; readonly height: number }
}>> = {
  avatar_v2_top_default: {
    bounds: [256, 384, 87, 222, 85, 76],
    box: { width: 100, height: 68 }
  },
  avatar_v2_top_cream_basic_tee: {
    bounds: [256, 384, 87, 222, 85, 76],
    box: { width: 100, height: 68 }
  },
  avatar_v2_bottom_default: {
    bounds: [256, 384, 99, 288, 58, 38],
    box: { width: 72, height: 48 }
  }
}

export function getStarterLayerThumbnail(id: string) {
  return STARTER_LAYER_THUMBNAILS[id]
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
