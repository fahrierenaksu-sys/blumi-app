import type { RoomWorldGeometry, RoomWorldPoint } from "../roomWorld/roomWorldGeometry"
import type { RoomWorldMovementTiming } from "../roomWorld/roomWorldRuntime"
import type { FurnitureItem, RoomFurnitureRotation, RoomShell, RoomV2FurnitureRenderItem } from "../roomV2/roomV2.types"
import type { AvatarDrawInput, AvatarDrawSpec, AvatarLiveProps, AvatarRigId } from "./model/avatarRoomContract"

/**
 * Types of the room seam (`roomAvatarSeam.ts`): how shared room code (My Room, the editor, the MiniRoom) reaches
 * the 2.5D avatar and the measured room. Types only, no code. The names keep the experiment's so its diffs apply;
 * later commits inline the seam and these aliases go with it.
 */
export type RoomAvatar25dRigId = AvatarRigId
export type RoomAvatar25dSpec = AvatarDrawSpec
export type RoomAvatar25dResolveInput = AvatarDrawInput
export type RoomAvatar25dBodyProps = AvatarLiveProps
/** The worn loadout as it was stored or received (anyone's, never trusted): the resolver coerces it. */
export type RoomAvatar25dLoadout = unknown

/**
 * The measured room camera (`roomV2/calibration/room_calibration.json`) applied to the room model at runtime.
 * Stored rooms, item ids and server state are never changed by it.
 */
export interface RoomAvatar25dRoomCalibration {
  /** The shell with the calibrated painted floor as its outline (same object back for other shells). */
  calibrateShell: (shell: RoomShell) => RoomShell
  /** A floor piece with a floor-cell (diamond) footprint, flush against a back wall when it stands in the last row. */
  calibrateFurnitureItem: (item: RoomV2FurnitureRenderItem) => RoomV2FurnitureRenderItem
  /** Walk geometry on the calibrated walkable floor (the painted floor less her foot radius). */
  calibrateWalkGeometry: (geometry: RoomWorldGeometry, shell: RoomShell | null | undefined) => RoomWorldGeometry
  /**
   * The wall magnet: a wall piece held at a stage point → its anchor's spot flush on the measured back wall under
   * it (whole steps along and up the wall, between skirting and cap, slid off the door, window and niche).
   */
  snapWallItem: (item: RoomV2FurnitureRenderItem, point: RoomWorldPoint) => RoomWorldPoint
  /** A stage tap → the floor point she walks to (a wall tap: straight below it, in front of the skirting). */
  resolveTapTarget: (point: RoomWorldPoint, shell: RoomShell | null | undefined) => RoomWorldPoint
  /** The drawn height (px) of that body (default the girl) on a stage this tall: each rig has its own world height. */
  avatarFigureHeightPx: (stageHeightPx: number, rig?: RoomAvatar25dRigId) => number
  /** The rotations the editor offers for a piece drawn from room-camera layers; undefined = the catalog's own. */
  furnitureRotations: (itemId: string) => RoomFurnitureRotation[] | undefined
}

export interface RoomAvatarSeam {
  /** True once the app has installed the room art (`roomAvatarSeamInstall.ts`); false only in plain Node tests. */
  enabled: boolean
  /** What to draw for one avatar; null only while the seam is not installed. */
  resolveRoomAvatar25d: (input: RoomAvatar25dResolveInput) => RoomAvatar25dSpec | null
  /** The walk timing at the pace of the body this loadout wears (the girl when unset). */
  movementTiming: (base: RoomWorldMovementTiming, loadout?: RoomAvatar25dLoadout) => RoomWorldMovementTiming
  /** The room calibration; null only while the seam is not installed. */
  roomCalibration: RoomAvatar25dRoomCalibration | null
  /** The layered 2.5D furniture (canonical ids), appended to the room catalog. */
  furnitureCatalog: readonly FurnitureItem[]
}
