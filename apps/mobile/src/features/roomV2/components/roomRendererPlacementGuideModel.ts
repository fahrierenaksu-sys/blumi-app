import type { RoomPlacementLane, RoomShell } from "../roomV2.types"

/** The walkable span of a placement guide lane (the lane clipped to the floor polygon). */
export function getPlacementGuideSpan(
  lane: RoomPlacementLane,
  shell: RoomShell
): { minX: number; maxX: number } {
  const fallbackMinX = lane.minX ?? shell.placeableArea?.minX ?? 0
  const fallbackMaxX = lane.maxX ?? shell.placeableArea?.maxX ?? 1
  const polygonSpan = getPolygonHorizontalSpanAtY(shell.walkablePolygon, lane.y)
  if (!polygonSpan) {
    return {
      minX: fallbackMinX,
      maxX: fallbackMaxX
    }
  }

  return {
    minX: Math.max(fallbackMinX, polygonSpan.minX),
    maxX: Math.min(fallbackMaxX, polygonSpan.maxX)
  }
}

function getPolygonHorizontalSpanAtY(
  polygon: RoomShell["walkablePolygon"],
  y: number
): { minX: number; maxX: number } | null {
  if (!polygon || polygon.length < 3) return null
  const intersections: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const crosses =
      (start.y <= y && end.y > y) ||
      (end.y <= y && start.y > y)
    if (!crosses) continue
    const dy = end.y - start.y
    if (Math.abs(dy) <= 0.0001) continue
    const t = (y - start.y) / dy
    intersections.push(start.x + (end.x - start.x) * t)
  }
  if (intersections.length < 2) return null
  intersections.sort((a, b) => a - b)
  return {
    minX: intersections[0],
    maxX: intersections[intersections.length - 1]
  }
}
