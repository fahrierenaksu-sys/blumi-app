import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import type { MiniRoomParticipantAvatarSnapshot } from "./scene/miniRoomSceneTypes"

export function createCurrentUserAvatarSnapshot(input: {
  userId: string
  displayName: string
  avatar: Parameters<typeof projectAvatarV2ToRoomAvatarAppearance>[0]["avatar"]
  avatarCatalog: Parameters<typeof projectAvatarV2ToRoomAvatarAppearance>[0]["avatarCatalog"]
}): MiniRoomParticipantAvatarSnapshot {
  const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
    avatar: input.avatar,
    avatarCatalog: input.avatarCatalog,
    roomAvatarCatalog: ROOM_AVATAR_CATALOG
  })

  return {
    userId: input.userId,
    displayName: input.displayName,
    role: "local",
    source: "avatar_v2_current_user",
    appearance: {
      base: "avatar_base_01",
      snapshotSource: "avatar_v2_current_user",
      roomAvatarAppearance: appearance,
      roomAvatarLayers: getRoomAvatarRenderLayers({
        appearance,
        catalog: ROOM_AVATAR_CATALOG
      })
    }
  }
}
