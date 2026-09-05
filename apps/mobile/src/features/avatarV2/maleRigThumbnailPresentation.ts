import type { AvatarItemType } from "./avatarV2.types"

export type MaleRigThumbnailSurface = "shop" | "wardrobe"

export interface MaleRigLayerThumbnailPresentation {
  scale: number
  top: number
}

const PRESENTATIONS: Readonly<
  Record<
    MaleRigThumbnailSurface,
    Partial<Record<AvatarItemType, MaleRigLayerThumbnailPresentation>>
  >
> = {
  shop: {
    hair: { scale: 2.7, top: 17 },
    top: { scale: 4, top: -39 },
    bottom: { scale: 5.5, top: -103 },
    shoes: { scale: 7.2, top: -163 },
    accessory: { scale: 4, top: 6 }
  },
  wardrobe: {
    hair: { scale: 3.2, top: 29 },
    top: { scale: 2.7, top: -60 },
    bottom: { scale: 3, top: -116 },
    shoes: { scale: 3, top: -130 },
    accessory: { scale: 3, top: 0 }
  }
}

export function getMaleRigLayerThumbnailPresentation(
  itemType: AvatarItemType,
  surface: MaleRigThumbnailSurface
): MaleRigLayerThumbnailPresentation | undefined {
  return PRESENTATIONS[surface][itemType]
}
