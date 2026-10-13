import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2Catalog"
import { getIdleAvatarLayerAssets } from "../avatarV2/room/avatarIdleAssets"
import type { AvatarRoomProjectionSource } from "../avatarV2/room/avatarRoomProjection"
import type { RoomV2AssetRef } from "../roomV2/roomV2.types"
import { previewAvatarShopItem } from "./shopAvatarDraft"

/** Prefetch only assets added by the product, never the full catalog or current outfit. */
export function getShopPreviewAddedAssets(
  avatar: UserAvatar,
  item: AvatarCatalogItem,
  source: AvatarRoomProjectionSource = {}
): RoomV2AssetRef[] {
  const current = getIdleAvatarLayerAssets(avatar, source)
  const preview = getIdleAvatarLayerAssets(
    previewAvatarShopItem(avatar, item, source.avatarCatalog ?? AVATAR_V2_CATALOG),
    source
  )
  const currentKeys = new Set(current.map((asset) => asset.key))
  const unique = new Map<string, RoomV2AssetRef>()
  for (const asset of preview) {
    if (!currentKeys.has(asset.key)) unique.set(asset.key, asset)
  }
  return [...unique.values()]
}
