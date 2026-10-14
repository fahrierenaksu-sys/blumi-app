import type { ImageSourcePropType } from "react-native"
import { isAvatarV2ItemCompatibleWithBody } from "../avatarBodyCompatibility"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import { getAvatarItemDisplayName } from "../avatarItemDisplayNames"
import type { AppLocale } from "../../session/appLocale"
import { isAvatarV2ItemEquipped } from "../avatarV2Selectors"
import { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } from "../room/avatarRoomProjection"
import { hasAvatarItemRigArt } from "../../avatar/model/avatarItemArt"
import {
  getWardrobeCategoryItems,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"

export interface WardrobeCatalogCardModel {
  item: AvatarCatalogItem
  /** The piece's name in the app's language. */
  name: string
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

/** Preserve unchanged category data so hidden shelves do not rebuild pages. */
export function reuseWardrobeCards(
  previous: readonly WardrobeCatalogCardModel[] | undefined,
  next: WardrobeCatalogCardModel[]
): readonly WardrobeCatalogCardModel[] {
  if (!previous || previous.length !== next.length) return next
  return previous.every((card, index) => {
    const update = next[index]
    return card.item === update.item && card.name === update.name && card.equipped === update.equipped &&
      card.itemStateLabel === update.itemStateLabel && card.locked === update.locked &&
      card.previewing === update.previewing && card.previewSource === update.previewSource
  }) ? previous : next
}

export function isAvatarItemRoomPreviewSupported(item: AvatarCatalogItem): boolean {
  return item.id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP || hasAvatarItemRigArt(item.id)
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
  /** Test seam: which items have room art to preview. The default reads the live projection map. */
  isPreviewSupported?: (item: AvatarCatalogItem) => boolean
}): AvatarCatalogItem[] {
  const isPreviewSupported = input.isPreviewSupported ?? isAvatarItemRoomPreviewSupported
  const fitting = getWardrobeCategoryItems(input.catalog, input.category).filter(
    (item) =>
      isAvatarV2ItemCompatibleWithBody(item, input.bodyId) &&
      isPreviewSupported(item)
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
  displayedAvatar: UserAvatar
  canEquipItem: (item: AvatarCatalogItem) => boolean
  copy: WardrobeCatalogCopy
  /** The app's language for piece names; English names when omitted. */
  locale?: AppLocale
  getPreviewSource: (item: AvatarCatalogItem) => ImageSourcePropType | undefined
  /** The locked item being previewed on the stage, if any. */
  previewingItemId?: string | null
  /** Test seam: which items have room art to preview. The default reads the live projection map. */
  isPreviewSupported?: (item: AvatarCatalogItem) => boolean
}): WardrobeCatalogCardModel[] {
  const { displayedAvatar, canEquipItem, copy } = input
  const isPreviewSupported = input.isPreviewSupported ?? isAvatarItemRoomPreviewSupported
  return input.items.map((item) => {
    const canEquip = canEquipItem(item)
    const roomPreviewSupported = isPreviewSupported(item)
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
      name: getAvatarItemDisplayName(item, input.locale ?? "en"),
      equipped,
      itemStateLabel,
      locked,
      previewing: locked && item.id === input.previewingItemId,
      previewSource
    }
  })
}
