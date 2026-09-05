import { getAvatarV2ItemsByType } from "./avatarV2Selectors"
import { isAvatarV2ItemCompatibleWithBody } from "./avatarBodyCompatibility"
import type {
  AvatarCatalogItem,
  AvatarItemType,
  UserAvatar
} from "./avatarV2.types"

export type WardrobeCategoryId =
  | "body"
  | "face"
  | "eyes"
  | "nose"
  | "mouth"
  | "top"
  | "dress"
  | "bottom"
  | "shoes"
  | "hair"
  | "accessory"

export const WARDROBE_CATEGORIES: readonly {
  id: WardrobeCategoryId
  label: string
}[] = [
  { id: "body", label: "Bases" },
  { id: "face", label: "Face" },
  { id: "top", label: "Tops" },
  { id: "dress", label: "Dresses" },
  { id: "bottom", label: "Bottoms" },
  { id: "shoes", label: "Shoes" },
  { id: "eyes", label: "Eyes" },
  { id: "nose", label: "Nose" },
  { id: "mouth", label: "Lips" },
  { id: "hair", label: "Hair" },
  { id: "accessory", label: "Extras" }
]

export type AvatarStudioSectionId = "appearance" | "closet"

export const AVATAR_STUDIO_SECTIONS = [
  { id: "closet", label: "My Closet" },
  { id: "appearance", label: "Avatar" }
] as const satisfies readonly { id: AvatarStudioSectionId; label: string }[]

const AVATAR_STUDIO_CATEGORY_IDS: Record<
  AvatarStudioSectionId,
  readonly WardrobeCategoryId[]
> = {
  appearance: ["body", "face", "eyes", "nose", "mouth"],
  closet: ["hair", "top", "dress", "bottom", "shoes", "accessory"]
}

export function getAvatarStudioDefaultCategory(
  section: AvatarStudioSectionId
): WardrobeCategoryId {
  return section === "appearance" ? "face" : "top"
}

export function getAvatarStudioCategories(
  section: AvatarStudioSectionId,
  catalog: AvatarCatalogItem[],
  avatar: UserAvatar
): readonly { id: WardrobeCategoryId; label: string }[] {
  const categoriesById = new Map(
    WARDROBE_CATEGORIES.map((category) => [category.id, category] as const)
  )
  return AVATAR_STUDIO_CATEGORY_IDS[section].flatMap((categoryId) => {
    const category = categoriesById.get(categoryId)
    if (!category) return []
    const hasCompatibleChoice = getWardrobeCategoryItems(catalog, categoryId).some(
      (item) => isAvatarV2ItemCompatibleWithBody(item, avatar.bodyId)
    )
    return hasCompatibleChoice ? [category] : []
  })
}

export const WARDROBE_EQUIPPED_SLOTS: readonly {
  id: Extract<AvatarItemType, "hair" | "top" | "bottom" | "shoes" | "accessory">
  label: string
}[] = [
  { id: "hair", label: "Hair" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "shoes", label: "Shoes" },
  { id: "accessory", label: "Extra" }
]

export interface WardrobeVisibleSlot {
  id: "hair" | "top" | "bottom" | "shoes" | "accessory" | "look"
  category: WardrobeCategoryId
  label: string
  item?: AvatarCatalogItem
  itemCount?: number
  accessibilitySummary?: string
}

export const WARDROBE_CAROUSEL_CARD_WIDTH = 148
export const WARDROBE_CAROUSEL_GAP = 10
export const WARDROBE_CAROUSEL_INSET = 20

export function getWardrobeCarouselItemLayout(
  _data: ArrayLike<unknown> | null | undefined,
  index: number
): { length: number; offset: number; index: number } {
  const stride = WARDROBE_CAROUSEL_CARD_WIDTH + WARDROBE_CAROUSEL_GAP
  return {
    length: WARDROBE_CAROUSEL_CARD_WIDTH,
    offset: WARDROBE_CAROUSEL_INSET + stride * index,
    index
  }
}

export function getWardrobeSecondaryCategories(
  catalog: AvatarCatalogItem[],
  avatar: UserAvatar
): readonly { id: WardrobeCategoryId; label: string }[] {
  const hasAtomicLook = catalog.some(
    (item) => item.id === avatar.topId && item.type === "top" && Boolean(item.outfitKey)
  )
  const equippedSlotIds = new Set<string>(WARDROBE_EQUIPPED_SLOTS.map((slot) => slot.id))
  const secondary = WARDROBE_CATEGORIES.filter(
    (category) => !equippedSlotIds.has(category.id)
  )
  if (!hasAtomicLook) return secondary
  return [
    { id: "top", label: "Separates" },
    { id: "bottom", label: "Bottoms" },
    ...secondary
  ]
}

export function shouldUseWardrobeSlotCompactLayout(fontScale: number): boolean {
  return fontScale >= 1.3
}

/**
 * Equipped-slot previews use the full 256x384 room-layer canvas. The visible
 * garment occupies only a portion of that canvas, so a small, category-aware
 * scale keeps the product readable inside the compact rail thumbnail without
 * changing the canonical room artwork.
 */
export function getWardrobeEquippedSlotPreviewScale(
  type: AvatarItemType
): number {
  switch (type) {
    case "hair":
      return 1.7
    case "top":
      return 2.35
    case "bottom":
      return 2.75
    case "shoes":
      return 3.1
    case "accessory":
      return 1.9
    default:
      return 1
  }
}

export function getWardrobeCategoryItems(
  catalog: AvatarCatalogItem[],
  category: WardrobeCategoryId
): AvatarCatalogItem[] {
  if (category === "dress") {
    return getAvatarV2ItemsByType(catalog, "top").filter((item) =>
      Boolean(item.outfitKey)
    )
  }
  return getAvatarV2ItemsByType(catalog, category).filter(
    (item) => !item.outfitKey
  )
}

export function getWardrobeEquippedSlotItem(
  catalog: AvatarCatalogItem[],
  avatar: UserAvatar,
  slot: (typeof WARDROBE_EQUIPPED_SLOTS)[number]["id"]
): AvatarCatalogItem | undefined {
  const equippedId = slot === "accessory"
    ? avatar.accessoryIds[0]
    : slot === "hair"
      ? avatar.hairId
      : slot === "top"
        ? avatar.topId
        : slot === "bottom"
          ? avatar.bottomId
          : avatar.shoesId

  return catalog.find((item) => item.id === equippedId && item.type === slot)
}

export function getWardrobeCarouselProgress(
  offsetX: number,
  contentWidth: number,
  viewportWidth: number
): number {
  const scrollableWidth = Math.max(0, contentWidth - viewportWidth)
  if (scrollableWidth === 0) return 1
  return Math.max(0, Math.min(1, offsetX / scrollableWidth))
}

export function getWardrobeCarouselIndicator(
  offsetX: number,
  contentWidth: number,
  viewportWidth: number
): { thumbFraction: number; positionFraction: number } {
  if (contentWidth <= 0 || viewportWidth <= 0 || contentWidth <= viewportWidth) {
    return { thumbFraction: 1, positionFraction: 0 }
  }
  return {
    thumbFraction: Math.max(0, Math.min(1, viewportWidth / contentWidth)),
    positionFraction: getWardrobeCarouselProgress(
      offsetX,
      contentWidth,
      viewportWidth
    )
  }
}

export function shouldUseWardrobeVerticalFallback(
  viewportHeight: number,
  fontScale: number
): boolean {
  return viewportHeight < 760 || fontScale > 1.15
}

export function getWardrobeVisibleSlots(
  catalog: AvatarCatalogItem[],
  avatar: UserAvatar
): WardrobeVisibleSlot[] {
  const equippedTop = catalog.find(
    (item) => item.id === avatar.topId && item.type === "top"
  )
  const equippedAccessories = avatar.accessoryIds.flatMap((id) => {
    const item = catalog.find((entry) => entry.id === id && entry.type === "accessory")
    return item ? [item] : []
  })
  const slots: WardrobeVisibleSlot[] = WARDROBE_EQUIPPED_SLOTS.map((slot) => {
    if (slot.id !== "accessory") {
      return {
        ...slot,
        category: slot.id,
        item: getWardrobeEquippedSlotItem(catalog, avatar, slot.id)
      }
    }
    const count = equippedAccessories.length
    const first = equippedAccessories[0]
    return {
      ...slot,
      category: slot.id,
      item: first,
      itemCount: count,
      label: count > 1 ? `Extras · ${count}` : slot.label,
      accessibilitySummary: count === 0
        ? "nothing"
        : count === 1
          ? first?.name
          : `${first?.name} and ${count - 1} more`
    }
  })

  if (!equippedTop?.outfitKey) return slots

  return slots.flatMap((slot): WardrobeVisibleSlot[] => {
    if (slot.id === "top") {
      return [{
        id: "look",
        category: "dress",
        label: "Look",
        item: equippedTop
      }]
    }
    if (slot.id === "bottom") return []
    return [slot]
  })
}
