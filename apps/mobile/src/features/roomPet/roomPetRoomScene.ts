import type { RoomPoint2D, RoomV2RenderItem } from "../roomV2/roomV2.types"
import { getRoomV2FloorGridCellPoint, type RoomV2FloorGridProjection } from "../roomV2/roomV2FloorGrid"
import { isRoomV2LayeredFloorPiece } from "../roomV2/roomV2RenderSurface"
import { createMyRoomAvatarDepthNeighbours, getMyRoomAvatarDepthIndex } from "../roomWorld/myRoomAvatarWalkModel"
import type { RoomPetAvatar, RoomPetCell, RoomPetEvent, RoomPetFacing, RoomPetMap, RoomPetState } from "./roomPet.types"
import { isSameRoomPetCell } from "./roomPetGrid"
import {
  getRoomPetClipForHop,
  getRoomPetDrawnHeading,
  getRoomPetSpriteHeading,
  type RoomPetClipName,
  type RoomPetDrawnHeading
} from "./roomPetSprite"

/**
 * Turns the pet engine's state into what the room draws: the stage point of
 * its feet, the clip and heading, and its place in the room's draw order.
 * Pure, so the renderer and the tests share one rule.
 */
export const ROOM_PET_RENDER_ID = "room-pet:own"

const FACING_STEP: Readonly<Record<RoomPetFacing, RoomPetCell>> = {
  east: { column: 1, row: 0 },
  west: { column: -1, row: 0 },
  south: { column: 0, row: 1 },
  north: { column: 0, row: -1 }
}

export interface RoomPetDraw {
  /** Stage point of the pet's feet (normalized shell canvas). */
  readonly foot: RoomPoint2D
  readonly clip: RoomPetClipName
  readonly heading: RoomPetDrawnHeading
  readonly mirrored: boolean
  readonly emote: RoomPetState["emote"]
  /** The pet draws just before this item (null: after every item). Rugs and layered floor pieces are always behind it. */
  readonly beforeRenderId: string | null
  /** How long the move to `foot` takes (one engine step), 0 when it stands. */
  readonly moveMs: number
  /**
   * A hop clip's path: the feet follow the clip's root motion from `from` to
   * `to` frame by frame (`foot` is `to`, where the clip ends). Null for every other clip.
   */
  readonly hop: RoomPetHopPath | null
}

export interface RoomPetHopPath {
  readonly from: RoomPoint2D
  readonly to: RoomPoint2D
}

function getCellPoint(projection: RoomV2FloorGridProjection, cell: RoomPetCell): RoomPoint2D {
  return getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
}

/** The lattice facing as a screen direction: the step from the pet's cell to its neighbour that way. */
function getScreenDirection(projection: RoomV2FloorGridProjection, cell: RoomPetCell, facing: RoomPetFacing): RoomPoint2D {
  const from = getCellPoint(projection, cell)
  const step = FACING_STEP[facing]
  const to = getCellPoint(projection, { column: cell.column + step.column, row: cell.row + step.row })
  return { x: to.x - from.x, y: to.y - from.y }
}

/**
 * The pet's place among the room's upright items, by the same rule as the
 * avatar: feet against each footprint's front edge, else by depth. A perched
 * pet lies on the piece's cushion, so it draws right after that piece.
 */
export function getRoomPetBeforeRenderId(
  renderItems: readonly RoomV2RenderItem[],
  foot: RoomPoint2D,
  perchedOnRenderId: string | null
): string | null {
  const uprightItems = renderItems.filter((item) => !isRoomV2LayeredFloorPiece(item))
  if (perchedOnRenderId) {
    const pieceIndex = uprightItems.findIndex((item) => item.renderId === perchedOnRenderId)
    if (pieceIndex >= 0) return uprightItems[pieceIndex + 1]?.renderId ?? null
  }
  const neighbours = createMyRoomAvatarDepthNeighbours(uprightItems, { layer: "furniture", renderId: ROOM_PET_RENDER_ID })
  const index = getMyRoomAvatarDepthIndex(neighbours, foot.y, foot.x, foot.y)
  return uprightItems[index]?.renderId ?? null
}

export function resolveRoomPetDraw(input: {
  readonly isEnabled: boolean
  readonly projection: RoomV2FloorGridProjection | null
  readonly map: RoomPetMap | null
  readonly state: RoomPetState | null
  readonly renderItems: readonly RoomV2RenderItem[]
}): RoomPetDraw | null {
  const { isEnabled, projection, map, state } = input
  if (!isEnabled || !projection || !map || !state) return null
  const perchSpot = state.perchSpotId ? map.spots.find((spot) => spot.id === state.perchSpotId) : undefined
  const floorFoot = getCellPoint(projection, state.cell)
  const foot = perchSpot?.perchAnchor ?? floorFoot
  const direction = getScreenDirection(projection, state.cell, state.facing)
  const drawn = getRoomPetDrawnHeading(getRoomPetSpriteHeading(direction.x, direction.y))
  const isMoving = state.pose === "walk" || state.pose === "run"
  const hopGoal = state.goal?.kind === "hop" ? state.goal : null
  const clip = state.mode === "greet" && state.pose === "happy" ? "greet" : getRoomPetClipForHop(state.pose, hopGoal ? hopGoal.phase : null)
  const hopSpot = state.pose === "hop" && hopGoal ? map.spots.find((spot) => spot.id === hopGoal.spotId) : undefined
  const hop = getHopPath(clip, foot, floorFoot, hopSpot?.perchAnchor ?? null)
  const depthSpotId = perchSpot?.id ?? (hop && hopSpot ? hopSpot.id : null)
  return {
    foot,
    clip,
    heading: drawn.heading,
    mirrored: drawn.mirrored,
    emote: state.emote,
    beforeRenderId: getRoomPetBeforeRenderId(input.renderItems, foot, depthSpotId),
    moveMs: isMoving ? state.stepMs : 0,
    hop
  }
}

/** hopUp runs floor -> seat, hopDown seat -> floor, hopPlay jumps in place; a hop without a seat point plays in place. */
function getHopPath(clip: RoomPetClipName, foot: RoomPoint2D, floorFoot: RoomPoint2D, seat: RoomPoint2D | null): RoomPetHopPath | null {
  if (clip === "hopPlay" || ((clip === "hopUp" || clip === "hopDown") && !seat)) return { from: foot, to: foot }
  if (clip === "hopUp" && seat) return { from: floorFoot, to: seat }
  if (clip === "hopDown" && seat) return { from: seat, to: floorFoot }
  return null
}

/** The engine events for an owner change between two room snapshots (null: not in the room). */
export function getRoomPetOwnerEvents(previous: RoomPetAvatar | null, next: RoomPetAvatar | null): RoomPetEvent[] {
  if (!next) return previous ? [{ type: "ownerLeft" }] : []
  if (!previous) {
    const arrived: RoomPetEvent = { type: "ownerArrived", cell: next.cell }
    return next.seatFurnitureId
      ? [arrived, { type: "ownerSat", cell: next.cell, seatFurnitureId: next.seatFurnitureId }]
      : [arrived]
  }
  if (next.seatFurnitureId && next.seatFurnitureId !== previous.seatFurnitureId) {
    return [{ type: "ownerSat", cell: next.cell, seatFurnitureId: next.seatFurnitureId }]
  }
  if (!next.seatFurnitureId && previous.seatFurnitureId) return [{ type: "ownerStood", cell: next.cell }]
  return isSameRoomPetCell(previous.cell, next.cell) ? [] : [{ type: "ownerMoved", cell: next.cell }]
}

/** The time the engine next has something to do (a step, a timed mode's end, a greeting deadline); null when idle-forever. */
export function getRoomPetNextWakeMs(state: RoomPetState): number | null {
  const times: number[] = []
  if (state.path.length > 0) times.push(state.nextMoveAtMs)
  if (state.modeEndsAtMs !== null) times.push(state.modeEndsAtMs)
  if (state.goal?.kind === "greet" && !state.goal.greeted) times.push(state.goal.deadlineMs)
  if (state.emote) times.push(state.emoteUntilMs)
  return times.length > 0 ? Math.min(...times) : null
}
