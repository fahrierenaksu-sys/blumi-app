import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2.mock"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import type { RoomV2AssetRef } from "../roomV2/roomV2.types"
import { previewAvatarShopItem } from "./shopAvatarDraft"

/** Prefetch only assets added by the product, never the full catalog or current outfit. */
export function getShopPreviewAddedAssets(
  avatar: UserAvatar,
  item: AvatarCatalogItem
): RoomV2AssetRef[] {
  const current = getIdleAssets(avatar)
  const preview = getIdleAssets(previewAvatarShopItem(avatar, item, AVATAR_V2_CATALOG))
  const currentKeys = new Set(current.map((asset) => asset.key))
  const unique = new Map<string, RoomV2AssetRef>()
  for (const asset of preview) {
    if (!currentKeys.has(asset.key)) unique.set(asset.key, asset)
  }
  return [...unique.values()]
}

function getIdleAssets(avatar: UserAvatar): RoomV2AssetRef[] {
  const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
    avatar,
    avatarCatalog: AVATAR_V2_CATALOG,
    roomAvatarCatalog: ROOM_AVATAR_CATALOG
  })
  return getRoomAvatarRenderLayers({ appearance, catalog: ROOM_AVATAR_CATALOG })
    .map((layer) => layer.asset)
}
