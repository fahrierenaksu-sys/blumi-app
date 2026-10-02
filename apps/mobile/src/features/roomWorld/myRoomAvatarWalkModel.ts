import { ROOM_LAYER_ORDER, type RoomLayer, type RoomV2RenderItem } from "../roomV2/roomV2.types"
import type { RoomWorldMovementPlan } from "./roomWorldRuntime"
import { getRoomWorldBlockerShape, type RoomWorldPoint } from "./roomWorldGeometry"

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
 * can change while it walks. `layerSign` is the sign of the layer comparison
 * and `avatarFirstOnTie` the render-id tie break of `compareRoomV2RenderItems`.
 *
 * An upright piece standing on the floor also carries its footprint (a flat
 * stage polygon, x0, y0, x1, y1, ...): the avatar is in front of it exactly
 * when its feet are below the footprint's front edge at the feet's x. A pivot
 * depth alone put an avatar beside a coffee table behind it while its feet
 * were already in front of the table's front edge (2026-10-02).
 */
export interface MyRoomAvatarDepthNeighbour {
  layerSign: number
  depth: number
  avatarFirstOnTie: boolean
  footprint?: number[]
}

export function createMyRoomAvatarDepthNeighbours(
  items: readonly RoomV2RenderItem[],
  avatar: { layer: RoomLayer; renderId: string }
): MyRoomAvatarDepthNeighbour[] {
  return items.map((item) => {
    const footprint = getRoomV2RenderItemDepthFootprint(item)
    return {
      layerSign: Math.sign(ROOM_LAYER_ORDER[avatar.layer] - ROOM_LAYER_ORDER[item.layer]),
      depth: item.depth,
      avatarFirstOnTie: avatar.renderId.localeCompare(item.renderId) < 0,
      ...(footprint ? { footprint } : {})
    }
  })
}

/**
 * The footprint an avatar's feet are compared with: the calibrated contact
 * polygon, else the footprint box at the floor pivot. Only upright floor
 * pieces that block walking have one; rugs and wall art sort by depth.
 */
function getRoomV2RenderItemDepthFootprint(item: RoomV2RenderItem): number[] | undefined {
  if (item.kind !== "furniture" || !item.blocksMovement) return undefined
  if ((item.placementSurface ?? "floor") !== "floor" || item.sceneProjection === "floor_plane") return undefined
  const size = item.footprint ?? { width: item.width, height: item.height }
  const shape = getRoomWorldBlockerShape({
    x: item.x,
    y: item.y,
    width: size.width,
    height: size.height,
    anchor: item.anchor,
    ...(item.collisionPolygon ? { polygon: item.collisionPolygon } : {})
  })
  return shape.flatMap((point) => [point.x, point.y])
}

/**
 * Whether feet at (x, y) stand in front of a footprint: below its front
 * (lower) edge at x, the edge clamped to the footprint's horizontal extent.
 */
export function isRoomFootPointInFrontOfFootprint(footprint: readonly number[], x: number, y: number): boolean {
  "worklet"
  let minX = Infinity
  let maxX = -Infinity
  for (let index = 0; index < footprint.length; index += 2) {
    minX = Math.min(minX, footprint[index]!)
    maxX = Math.max(maxX, footprint[index]!)
  }
  const atX = Math.min(maxX, Math.max(minX, x))
  let frontY = -Infinity
  const count = footprint.length / 2
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    const ax = footprint[index * 2]!
    const ay = footprint[index * 2 + 1]!
    const bx = footprint[next * 2]!
    const by = footprint[next * 2 + 1]!
    if (atX < Math.min(ax, bx) || atX > Math.max(ax, bx)) continue
    const edgeY = ax === bx ? Math.max(ay, by) : ay + (by - ay) * (atX - ax) / (bx - ax)
    frontY = Math.max(frontY, edgeY)
  }
  return y > frontY
}

/**
 * The index the avatar takes among items already in render order. Feet on
 * the floor (`footX`/`footY`) are compared with each footprint's front edge;
 * a pinned depth (the avatar owns a seat) or an item without a footprint
 * compares by depth, as `insertRoomV2RenderItemSorted` does. Runs on the UI
 * thread so React only re-renders when the avatar actually passes in front
 * of or behind furniture.
 */
export function getMyRoomAvatarDepthIndex(
  neighbours: readonly MyRoomAvatarDepthNeighbour[],
  depth: number,
  footX?: number,
  footY?: number
): number {
  "worklet"
  for (let index = 0; index < neighbours.length; index += 1) {
    const neighbour = neighbours[index]!
    if (neighbour.layerSign < 0) return index
    if (neighbour.layerSign > 0) continue
    if (footX !== undefined && footY !== undefined && neighbour.footprint) {
      if (!isRoomFootPointInFrontOfFootprint(neighbour.footprint, footX, footY)) return index
      continue
    }
    if (depth < neighbour.depth) return index
    if (depth === neighbour.depth && neighbour.avatarFirstOnTie) return index
  }
  return neighbours.length
}
