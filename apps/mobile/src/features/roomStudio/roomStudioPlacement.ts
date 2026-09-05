import type {
  PlacedRoomItem,
  RoomAnchor,
  RoomBounds,
  RoomFurnitureRotation,
  RoomPlacementSurface,
  RoomPoint2D,
  RoomWalkablePolygonPoint
} from "../roomV2/roomV2.types"

export interface RoomStudioPlacementGeometry {
  itemId: string
  placementSurface: RoomPlacementSurface
  blocksMovement: boolean
  footprint: { width: number; height: number }
  anchor: RoomAnchor
}

export interface RoomStudioPlacementEnvironment {
  walkablePolygon?: RoomWalkablePolygonPoint[]
  placeableArea?: RoomBounds
  surfacePlacementAreas?: Partial<Record<RoomPlacementSurface, RoomBounds>>
  surfacePlacementExclusions?: Partial<Record<RoomPlacementSurface, RoomBounds[]>>
}

export type RoomStudioPlacementIssue =
  | "unknown_geometry"
  | "invalid_position"
  | "outside_shell"
  | "surface_outside_shell"
  | "surface_exclusion"
  | "blocking_collision"

export interface RoomStudioPlacementResult {
  isValid: boolean
  issue?: RoomStudioPlacementIssue
}

/**
 * Validates the authored physical rectangle, never the transparent bitmap
 * canvas. The shell remains the source of truth for the allowed floor/wall
 * regions, so a visual card cannot create a fake red placement state.
 */
export function validateRoomStudioPlacement(input: {
  item: PlacedRoomItem
  geometry: RoomStudioPlacementGeometry | undefined
  otherItems: readonly PlacedRoomItem[]
  geometryByItemId: ReadonlyMap<string, RoomStudioPlacementGeometry>
  environment: RoomStudioPlacementEnvironment
}): RoomStudioPlacementResult {
  const { item, geometry, environment } = input
  if (!geometry) return { isValid: false, issue: "unknown_geometry" }
  if (!isNormalizedPosition(item.x) || !isNormalizedPosition(item.y)) {
    return { isValid: false, issue: "invalid_position" }
  }

  const bounds = getPlacementBounds(item, geometry)
  if (geometry.placementSurface === "floor") {
    if (environment.placeableArea && !isBoundsInside(bounds, environment.placeableArea)) {
      return { isValid: false, issue: "outside_shell" }
    }
    if (environment.walkablePolygon && !boundsCornersInsidePolygon(bounds, environment.walkablePolygon)) {
      return { isValid: false, issue: "outside_shell" }
    }
  } else {
    const surface = environment.surfacePlacementAreas?.[geometry.placementSurface]
    if (!surface || !isBoundsInside(bounds, surface)) {
      return { isValid: false, issue: "surface_outside_shell" }
    }
    const exclusions = environment.surfacePlacementExclusions?.[geometry.placementSurface] ?? []
    if (exclusions.some((exclusion) => boundsOverlap(bounds, exclusion))) {
      return { isValid: false, issue: "surface_exclusion" }
    }
  }

  if (geometry.blocksMovement && input.otherItems.some((other) => {
    if (other.instanceId === item.instanceId) return false
    const otherGeometry = input.geometryByItemId.get(other.itemId)
    return otherGeometry?.blocksMovement === true &&
      otherGeometry.placementSurface === "floor" &&
      boundsOverlap(bounds, getPlacementBounds(other, otherGeometry))
  })) {
    return { isValid: false, issue: "blocking_collision" }
  }

  return { isValid: true }
}

export function getPlacementBounds(
  item: Pick<PlacedRoomItem, "x" | "y">,
  geometry: Pick<RoomStudioPlacementGeometry, "footprint" | "anchor">
): RoomBounds {
  const minX = item.x - geometry.footprint.width * geometry.anchor.x
  const minY = item.y - geometry.footprint.height * geometry.anchor.y
  return {
    minX,
    maxX: minX + geometry.footprint.width,
    minY,
    maxY: minY + geometry.footprint.height
  }
}

function isNormalizedPosition(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isBoundsInside(bounds: RoomBounds, region: RoomBounds): boolean {
  return bounds.minX >= region.minX &&
    bounds.maxX <= region.maxX &&
    bounds.minY >= region.minY &&
    bounds.maxY <= region.maxY
}

function boundsOverlap(a: RoomBounds, b: RoomBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

function boundsCornersInsidePolygon(
  bounds: RoomBounds,
  polygon: readonly RoomWalkablePolygonPoint[]
): boolean {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY }
  ].every((point) => pointInPolygon(point, polygon))
}

function pointInPolygon(
  point: RoomPoint2D,
  polygon: readonly RoomWalkablePolygonPoint[]
): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!
    const previousPoint = polygon[previous]!
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y)) &&
      point.x < (previousPoint.x - currentPoint.x) *
        (point.y - currentPoint.y) /
        (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

// Kept as a contract reminder: runtime directions remain four-valued, but
// candidate art must not be mirrored or rotated until real directional assets
// are approved by the visual gate.
export function isRoomStudioDirection(value: string): value is RoomFurnitureRotation {
  return value === "front" || value === "right" || value === "back" || value === "left"
}
