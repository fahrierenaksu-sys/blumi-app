import type { UserAvatar } from "../avatarV2.types"
import { AVATAR_V2_CATALOG } from "../avatarV2.mock"
import type { RoomV2AssetRef } from "../../roomV2/roomV2.types"
import { ROOM_AVATAR_CATALOG } from "./avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "./avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "./avatarRoomSelectors"

/** The current front/idle outfit only; never expand this to the catalog or motion frames. */
export function getIdleAvatarLayerAssets(avatar: UserAvatar): RoomV2AssetRef[] {
  const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
    avatar,
    avatarCatalog: AVATAR_V2_CATALOG,
    roomAvatarCatalog: ROOM_AVATAR_CATALOG
  })
  return getRoomAvatarRenderLayers({
    appearance,
    catalog: ROOM_AVATAR_CATALOG,
    direction: "front",
    state: "idle"
  }).map((layer) => layer.asset)
}
