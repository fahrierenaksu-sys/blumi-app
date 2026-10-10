import type { RoomAvatar25dRigId, RoomAvatar25dRoomCalibration } from "../../avatar/roomAvatarSeamContract"
import {
  calibrateLayeredFurnitureRenderItem,
  LAYERED_FURNITURE_SPECS,
  type LayeredFurnitureAssets
} from "../furniture/layeredFurniture"
import {
  calibrateLayeredWallRenderItem,
  LAYERED_WALL_SPECS,
  snapLayeredWallItem,
  type LayeredWallAssets
} from "../furniture/layeredWallFurniture"
import { avatarFigureHeightPx, ROOM_CALIBRATION } from "./roomCalibration"
import {
  calibrateFurnitureRenderItem,
  calibrateRoomShell,
  calibrateRoomWalkGeometry,
  resolveCalibratedTapTarget,
  snapCalibratedWallItem
} from "./roomCalibrationScene"

/**
 * The girl's height in the room, N = 1.965 world units (owner decision 2026-10-09, Workbench
 * avatar25-v2/scale/SCALE_ADDENDUM_2026-10-09_heights.md: 0.934 of the painted door's 2.105 u, 191 cm at 0.974 m/u).
 * Her camera-facing card is P = N x cos(pitch) = 1.827 units tall, about 178.7 px on the 714 px shell. It replaces
 * the calibration file's `avatar.height_world` (2.105, the door) for drawing her only; the door, the scale and every
 * piece of furniture stay as they are (seats were sized at N 2.105 and must fit 1.965-2.063). This is the one height
 * My Room and MiniRoom both draw her at (`avatarFigureHeightPx`). The walk keeps its feet planted at any size: the
 * cycle advances by the drawn feet's own on-screen travel, which scales with her figure (RoomAvatar25dBody).
 */
export const ROOM_AVATAR_25D_GIRL_HEIGHT = 1.965
/** The boy's height, N = 2.063 world units (0.98 of the door, 201 cm; same addendum). His card is 1.918 units tall. */
export const ROOM_AVATAR_25D_BOY_HEIGHT = 2.063
/** Each drawn body's height as every room surface draws it (My Room and MiniRoom alike). */
export const ROOM_AVATAR_25D_WORLD_HEIGHTS: Readonly<Record<RoomAvatar25dRigId, number>> = {
  female: ROOM_AVATAR_25D_GIRL_HEIGHT,
  male: ROOM_AVATAR_25D_BOY_HEIGHT
}
/**
 * Walk speed per world unit of height (lab: speed = 0.2138 x N units/s), so the girl walks 0.420 u/s and the boy
 * 0.441 u/s. The rigs' own `motion.walkSpeed` (0.45 / 0.472, older lab values) is no longer read: the girl's rig
 * file is checksummed and stays as approved. The walk cycle follows the distance covered, so planted feet stay
 * planted at any speed.
 */
export const ROOM_AVATAR_25D_WALK_SPEED_PER_HEIGHT = 0.2138
export const ROOM_AVATAR_25D_WALK_SPEEDS: Readonly<Record<RoomAvatar25dRigId, number>> = {
  female: ROOM_AVATAR_25D_WALK_SPEED_PER_HEIGHT * ROOM_AVATAR_25D_GIRL_HEIGHT,
  male: ROOM_AVATAR_25D_WALK_SPEED_PER_HEIGHT * ROOM_AVATAR_25D_BOY_HEIGHT
}
/** The girl's height (the default rig), kept for callers that draw her only. */
export const ROOM_AVATAR_25D_WORLD_HEIGHT = ROOM_AVATAR_25D_WORLD_HEIGHTS.female

export function createRoomAvatar25dRoomCalibration(
  layeredAssets: LayeredFurnitureAssets = {},
  layeredWallAssets: LayeredWallAssets = {}
): RoomAvatar25dRoomCalibration {
  // a layered wall piece: the drawing of the wall it hangs on (only on a wall; elsewhere it is an ordinary piece)
  const layeredWall = (item: { itemId: string; placementSurface?: string }) => {
    const spec = LAYERED_WALL_SPECS[item.itemId]
    const art = layeredWallAssets[item.itemId]
    return spec && art && item.placementSurface === "wall" ? { spec, art } : undefined
  }
  return {
    calibrateShell: (shell) => calibrateRoomShell(shell),
    calibrateFurnitureItem: (item) => {
      const wall = layeredWall(item)
      if (wall) return calibrateLayeredWallRenderItem(item, wall.spec, wall.art, ROOM_CALIBRATION)
      const spec = LAYERED_FURNITURE_SPECS[item.itemId]
      const art = layeredAssets[item.itemId]
      return spec && art
        ? calibrateLayeredFurnitureRenderItem(item, spec, art, ROOM_CALIBRATION)
        : calibrateFurnitureRenderItem(item)
    },
    calibrateWalkGeometry: (geometry, shell) => calibrateRoomWalkGeometry(geometry, shell),
    snapWallItem: (item, point) => {
      const wall = layeredWall(item)
      return wall
        ? snapLayeredWallItem(wall.spec, point, item.surfacePlacementPolicy, ROOM_CALIBRATION)
        : snapCalibratedWallItem(item, point)
    },
    resolveTapTarget: (point, shell) => resolveCalibratedTapTarget(point, shell),
    avatarFigureHeightPx: (stageHeightPx, rig = "female") =>
      avatarFigureHeightPx(ROOM_CALIBRATION, ROOM_AVATAR_25D_WORLD_HEIGHTS[rig], stageHeightPx),
    // a layered piece has all four rotations drawn
    furnitureRotations: (itemId) =>
      LAYERED_FURNITURE_SPECS[itemId] && layeredAssets[itemId] ? ["front", "right", "back", "left"] : undefined
  }
}
