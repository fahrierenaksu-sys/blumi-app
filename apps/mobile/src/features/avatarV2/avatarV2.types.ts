import type { ImageSourcePropType } from "react-native"

export type AvatarItemType =
  | "body"
  | "face"
  | "eyes"
  | "nose"
  | "mouth"
  | "hair"
  | "top"
  | "bottom"
  | "shoes"
  | "accessory"

export type AvatarAnimationState =
  | "idle_front"
  | "walk_front"
  | "sit_front"
  | "wave_front"

export type AvatarAccessoryGroup =
  | "headwear"
  | "eyewear"
  | "earrings"
  | "neck"
  | "bag"
  | "hairClip"

export interface AvatarLayerAssetRef {
  key: string
  source: ImageSourcePropType
}

export interface AvatarCatalogItem {
  id: string
  type: AvatarItemType
  name: string
  sortOrder: number
  layerOrder: number
  assets: Partial<Record<AvatarAnimationState, AvatarLayerAssetRef>>
  isDefault?: boolean
  ownedByDefault?: boolean
  locked?: boolean
  outfitKey?: string
  pairedItemId?: string
  accessoryGroup?: AvatarAccessoryGroup
  hiddenFromShop?: boolean
  hiddenFromWardrobe?: boolean
  compatibleBodyIds?: string[]
}

export interface UserAvatar {
  bodyId: string
  faceId: string
  eyesId: string
  noseId: string
  mouthId: string
  hairId: string
  topId: string
  bottomId: string
  shoesId: string
  /** Canonical loadout V2 fields. Rendering remains gated separately. */
  dressId?: string | null
  outerwearId?: string | null
  accessoryIds: string[]
}

export interface AvatarInventory {
  ownedItemIds: string[]
}

export interface AvatarCategory {
  type: AvatarItemType
  label: string
}

export interface ResolvedAvatarLayer {
  id: string
  type: AvatarItemType
  layerOrder: number
  asset: AvatarLayerAssetRef
}
