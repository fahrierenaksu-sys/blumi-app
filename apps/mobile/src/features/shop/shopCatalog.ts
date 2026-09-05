import {
  findEconomyCatalogItem,
  type EconomyCatalogItem
} from "@blumi/domain"
import {
  AVATAR_V2_CATALOG
} from "../avatarV2/avatarV2.mock"
import { getAvatarV2ShopItemsCompatibleWithBody } from "../avatarV2/avatarBodyCompatibility"
import {
  isAvatarV2ItemEquipped,
  isAvatarV2ItemOwned
} from "../avatarV2/avatarV2Selectors"
import type {
  AvatarInventory,
  AvatarCatalogItem,
  UserAvatar
} from "../avatarV2/avatarV2.types"
import type { BlumiInventorySnapshot } from "../inventory/inventoryStore"
import { ROOM_V2_FURNITURE_CATALOG } from "../roomV2/roomV2.mock"
import type {
  FurnitureItem,
  UserRoomDecor
} from "../roomV2/roomV2.types"

export type ShopCatalogItemKind =
  | "avatarWearable"
  | "roomItem"
  | "roomShell"
  | "roomSurface"
  | "architecturalDecor"

export type ShopPreviewType = "avatar" | "room"

export type ShopActionType =
  | "avatarUnlock"
  | "avatarEquip"
  | "roomUnlock"
  | "roomPlace"
  | "disabled"

export type ShopSectionId = "avatar" | "room"

export interface ShopCatalogItem {
  id: string
  kind: ShopCatalogItemKind
  title: string
  description: string
  priceCoins: number | null
  owned: boolean
  previewType: ShopPreviewType
  actionType: ShopActionType
  sourceItemId: string
  sectionId: ShopSectionId
  eyebrow: string
  stateLabel: string
  actionLabel: string
  disabledReason?: string
  avatarItem?: AvatarCatalogItem
  roomItem?: FurnitureItem
  placedCount?: number
}

export interface BuildShopCatalogItemsInput {
  inventory: BlumiInventorySnapshot
  avatar: UserAvatar
  roomDecor: UserRoomDecor
  economyCatalog?: readonly EconomyCatalogItem[]
  /**
   * Production release projection. When present, Shop must not render an
   * asset outside its immutable receipt-backed catalog.
   */
  publishedItemIds?: readonly string[]
  /**
   * An explicitly resolved runtime room catalog. Omit it for the production
   * catalog; QA callers pass only a development-gated, trusted resolver.
   */
  roomFurnitureCatalog?: readonly FurnitureItem[]
  /** Development-only ownership granted by an isolated QA catalog. */
  qaOwnedRoomItemIds?: readonly string[]
}

export interface BuildAvatarShopCatalogItemInput {
  item: AvatarCatalogItem
  inventory: AvatarInventory
  avatar: UserAvatar
  economyCatalog?: readonly EconomyCatalogItem[]
}

const SHOP_AVATAR_TYPES = new Set([
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory"
])

export const INITIAL_SHOP_ITEM_ID = "avatar:avatar_v2_top_blush_lace_cardigan"

export function buildShopCatalogItems(
  input: BuildShopCatalogItemsInput
): ShopCatalogItem[] {
  return [
    ...buildAvatarShopItems(input),
    ...buildRoomShopItems(input)
  ]
}

function buildAvatarShopItems(input: BuildShopCatalogItemsInput): ShopCatalogItem[] {
  const avatarInventory = {
    ownedItemIds: input.inventory.ownedAvatarItemIds
  }
  const publishedItemIds = input.publishedItemIds
    ? new Set(input.publishedItemIds)
    : undefined

  return getAvatarV2ShopItemsCompatibleWithBody(
    AVATAR_V2_CATALOG,
    input.avatar.bodyId
  )
    .filter((item) => SHOP_AVATAR_TYPES.has(item.type))
    .filter((item) => !publishedItemIds || publishedItemIds.has(item.id))
    .map((item) =>
      buildAvatarShopCatalogItem({
        item,
        inventory: avatarInventory,
        avatar: input.avatar,
        economyCatalog: input.economyCatalog
      })
    )
}

export function buildAvatarShopCatalogItem(
  input: BuildAvatarShopCatalogItemInput
): ShopCatalogItem {
  const { item } = input
  const owned = isAvatarV2ItemOwned(input.inventory, item)
  const equipped = isAvatarV2ItemEquipped(input.avatar, item)
  const priceCoins = getAvatarShopPrice(item, input.economyCatalog)
  const actionType = getAvatarActionType({ owned, equipped, priceCoins })
  const isAtomicOutfit = Boolean(item.outfitKey)
  return {
    id: `avatar:${item.id}`,
    kind: "avatarWearable",
    title: item.name,
    description: getAvatarDescription(priceCoins, isAtomicOutfit),
    priceCoins,
    owned,
    previewType: "avatar",
    actionType,
    sourceItemId: item.id,
    sectionId: "avatar",
    eyebrow: getAvatarEyebrow(item),
    stateLabel: getAvatarStateLabel({ owned, equipped, priceCoins, isAtomicOutfit }),
    actionLabel: getAvatarActionLabel({ actionType, equipped, priceCoins, isAtomicOutfit }),
    disabledReason: actionType === "disabled"
      ? equipped
        ? undefined
        : "This wearable needs catalog pricing before it can be unlocked."
      : undefined,
    avatarItem: item
  }
}

function buildRoomShopItems(input: BuildShopCatalogItemsInput): ShopCatalogItem[] {
  const publishedItemIds = input.publishedItemIds
    ? new Set(input.publishedItemIds)
    : undefined
  const roomFurnitureCatalog = (input.roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG)
    .filter((item) => !publishedItemIds || publishedItemIds.has(item.id))
  const qaOwnedRoomItemIds = new Set(input.qaOwnedRoomItemIds ?? [])
  return roomFurnitureCatalog.map((item) => {
    const owned = input.inventory.ownedRoomItemIds.includes(item.id) ||
      qaOwnedRoomItemIds.has(item.id)
    const priceCoins = getRoomShopPrice(item, input.economyCatalog)
    const placedCount = input.roomDecor.placedItems.filter(
      (placedItem) => placedItem.itemId === item.id
    ).length
    const actionType: ShopActionType = owned
      ? placedCount > 0
        ? "disabled"
        : "roomPlace"
      : priceCoins !== null
        ? "roomUnlock"
        : "disabled"
    return {
      id: `room:${item.id}`,
      kind: "roomItem",
      title: item.name,
      description: getRoomDescription(item),
      priceCoins,
      owned,
      previewType: "room",
      actionType,
      sourceItemId: item.id,
      sectionId: "room",
      eyebrow: getRoomEyebrow(item),
      stateLabel: owned
        ? placedCount > 0
          ? `${placedCount} placed`
          : "Owned"
        : priceCoins !== null
          ? `${priceCoins.toLocaleString()} coins`
          : "Try style",
      actionLabel: placedCount > 0 ? "Placed" : getShopActionLabel(actionType, priceCoins),
      disabledReason: actionType === "disabled"
        ? placedCount > 0
          ? undefined
          : "This style is in the studio."
        : undefined,
      roomItem: item,
      placedCount
    } satisfies ShopCatalogItem
  })
}

function getAvatarShopPrice(
  item: AvatarCatalogItem,
  economyCatalog?: readonly EconomyCatalogItem[]
): number | null {
  return findEconomyCatalogItem(item.id, "avatar", economyCatalog)?.priceCoins ?? null
}

function getRoomShopPrice(
  item: FurnitureItem,
  economyCatalog?: readonly EconomyCatalogItem[]
): number | null {
  return findEconomyCatalogItem(item.id, "room", economyCatalog)?.priceCoins ?? null
}

function getAvatarActionType(input: {
  owned: boolean
  equipped: boolean
  priceCoins: number | null
}): ShopActionType {
  if (input.equipped) return "disabled"
  if (input.owned) return "avatarEquip"
  if (input.priceCoins !== null) return "avatarUnlock"
  return "disabled"
}

function getAvatarStateLabel(input: {
  owned: boolean
  equipped: boolean
  priceCoins: number | null
  isAtomicOutfit: boolean
}): string {
  if (input.equipped) return input.isAtomicOutfit ? "Wearing outfit" : "Wearing"
  if (input.owned) return input.isAtomicOutfit ? "Owned outfit" : "Owned"
  if (input.priceCoins !== null) return `${input.priceCoins.toLocaleString()} coins`
  return "Try style"
}

function getAvatarActionLabel(input: {
  actionType: ShopActionType
  equipped: boolean
  priceCoins: number | null
  isAtomicOutfit: boolean
}): string {
  if (input.equipped) return input.isAtomicOutfit ? "Wearing outfit" : "Wearing"
  if (input.isAtomicOutfit && input.actionType === "avatarUnlock" && input.priceCoins !== null) {
    return `Unlock outfit for ${input.priceCoins.toLocaleString()} coins`
  }
  if (input.isAtomicOutfit && input.actionType === "avatarEquip") return "Wear outfit"
  return getShopActionLabel(input.actionType, input.priceCoins)
}

function getShopActionLabel(
  actionType: ShopActionType,
  priceCoins: number | null
): string {
  if (actionType === "avatarUnlock" && priceCoins !== null) {
    return `Unlock for ${priceCoins.toLocaleString()} coins`
  }
  if (actionType === "roomUnlock" && priceCoins !== null) {
    return `Unlock for ${priceCoins.toLocaleString()} coins`
  }
  if (actionType === "avatarEquip") return "Wear now"
  if (actionType === "roomPlace") return "Place now"
  return "Try style"
}

function getAvatarEyebrow(item: AvatarCatalogItem): string {
  if (item.outfitKey) return "Avatar outfit"
  if (item.type === "accessory") return "Avatar accessory"
  return `Avatar ${item.type}`
}

function getAvatarDescription(priceCoins: number | null, isAtomicOutfit: boolean): string {
  if (isAtomicOutfit) {
    return priceCoins !== null && priceCoins > 0
      ? "A complete outfit for your Blumi avatar. Preview the full look before you unlock it."
      : "A complete outfit that updates your avatar as one look."
  }
  if (priceCoins !== null && priceCoins > 0) {
    return "A premium wearable for your Blumi avatar. Preview the look before you unlock it."
  }
  return "A wardrobe piece that updates your avatar look when equipped."
}

function getRoomEyebrow(item: FurnitureItem): string {
  if (item.category === "wallDecor") return "Room wall decor"
  return `Room ${item.category}`
}

function getRoomDescription(item: FurnitureItem): string {
  if (item.interactionType === "seat") {
    return "A grounded room piece that can be placed into your saved My Room layout."
  }
  return "A cozy decor piece that can be placed into your saved My Room layout."
}
