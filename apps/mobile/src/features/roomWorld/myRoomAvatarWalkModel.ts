import { ROOM_LAYER_ORDER, type RoomLayer, type RoomV2RenderItem } from "../roomV2/roomV2.types"
import type { RoomWorldMovementPlan } from "./roomWorldRuntime"
import type { RoomWorldPoint } from "./roomWorldGeometry"

/**
 * One UI-thread timing step: animate to `x`/`y` over `durationMs` with the
 * RoomWorld walk curve (`easeRoomWorldMovement`): linear at cruise speed,
 * ramped only at the start of the first and the end of the last step.
 */
export interface MyRoomWalkStep {
  x: number
  y: number
  durationMs: number
  rampIn: number
  rampOut: number
}

export function createMyRoomWalkTimeline(plan: RoomWorldMovementPlan): MyRoomWalkStep[] {
  return plan.segments.map((segment) => ({
    x: segment.to.x,
    y: segment.to.y,
    durationMs: segment.durationMs,
    rampIn: segment.rampIn ?? 0,
    rampOut: segment.rampOut ?? 0
  }))
}

/** Both coordinates come from the same segment progress, including at turns. */
export function getMyRoomWalkPoint(
  origin: RoomWorldPoint,
  steps: readonly MyRoomWalkStep[],
  progress: number
): RoomWorldPoint {
  "worklet"
  if (steps.length === 0 || progress <= 0) return origin
  const index = Math.min(Math.floor(progress), steps.length - 1)
  const from = index === 0 ? origin : steps[index - 1]!
  const to = steps[index]!
  const fraction = Math.min(1, progress - index)
  if (fraction === 1) return { x: to.x, y: to.y }
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction
  }
}

/**
 * How the walking avatar compares with one other render item, reduced to what
 * can change while it walks (its depth). `layerSign` is the sign of the layer
 * comparison and `avatarFirstOnTie` the render-id tie break of
 * `compareRoomV2RenderItems`.
 */
export interface MyRoomAvatarDepthNeighbour {
  layerSign: number
  depth: number
  avatarFirstOnTie: boolean
}

export function createMyRoomAvatarDepthNeighbours(
  items: readonly RoomV2RenderItem[],
  avatar: { layer: RoomLayer; renderId: string }
): MyRoomAvatarDepthNeighbour[] {
  return items.map((item) => ({
    layerSign: Math.sign(ROOM_LAYER_ORDER[avatar.layer] - ROOM_LAYER_ORDER[item.layer]),
    depth: item.depth,
    avatarFirstOnTie: avatar.renderId.localeCompare(item.renderId) < 0
  }))
}

/**
 * The index `insertRoomV2RenderItemSorted` gives the avatar at `depth`, for
 * items already in render order. Runs on the UI thread so React only
 * re-renders when the avatar actually passes in front of or behind furniture.
 */
export function getMyRoomAvatarDepthIndex(
  neighbours: readonly MyRoomAvatarDepthNeighbour[],
  depth: number
): number {
  "worklet"
  for (let index = 0; index < neighbours.length; index += 1) {
    const neighbour = neighbours[index]!
    if (neighbour.layerSign < 0) return index
    if (neighbour.layerSign > 0) continue
    if (depth < neighbour.depth) return index
    if (depth === neighbour.depth && neighbour.avatarFirstOnTie) return index
  }
  return neighbours.length
}
