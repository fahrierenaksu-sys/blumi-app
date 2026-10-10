import { createRoomAvatar25dRoomCalibration, ROOM_AVATAR_25D_WALK_SPEEDS } from "../roomV2/calibration/roomAvatar25dRoomCalibration"
import { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } from "../roomV2/furniture/layeredFurnitureAssets"
import { createRoomAvatar25dFurnitureCatalog } from "../roomV2/furniture/layeredFurnitureCatalog"
import { avatarRigForBody } from "./model/avatarItemArt"
import { resolveAvatarDraw, resolveAvatarMovementTiming } from "./model/resolveAvatarDraw"
import { AVATAR_RIG_DATA } from "./renderer/avatar25Assets"
import { installRoomAvatarSeam } from "./roomAvatarSeam"
import { coerceAvatarLoadout } from "@blumi/domain"

/**
 * Installs the room seam with the real art: both rigs, the measured room and the layered furniture. Imported once,
 * first, by `App.tsx`; never by a test.
 */
installRoomAvatarSeam({
  enabled: true,
  // each avatar's own rig from its coerced body (the boy for avatar_v2_body_male_light, else the girl)
  resolveRoomAvatar25d: (input) => resolveAvatarDraw(AVATAR_RIG_DATA, input),
  // each body's own pace (0.2138 × its height); the walk cycle follows the distance, so feet stay planted
  movementTiming: (base, loadout) => {
    const rigId = avatarRigForBody(coerceAvatarLoadout(loadout, {}).bodyId)
    return resolveAvatarMovementTiming(base, AVATAR_RIG_DATA[rigId], ROOM_AVATAR_25D_WALK_SPEEDS[rigId])
  },
  roomCalibration: createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS),
  furnitureCatalog: createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
})
