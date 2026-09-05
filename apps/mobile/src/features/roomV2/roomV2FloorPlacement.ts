import {
  pointInRoomWorldPolygon,
  projectRoomWorldPointToPolygon,
  type RoomWorldPoint
} from "../roomWorld/roomWorldGeometry"
import type { RoomAnchor, RoomFootprint, RoomWalkablePolygonPoint } from "./roomV2.types"

export function clampRoomV2FloorFootprintToPolygon(input: {
  point: RoomWorldPoint
  polygon: RoomWalkablePolygonPoint[]
  footprint: RoomFootprint
  anchor: RoomAnchor
}): RoomWorldPoint {
  if (input.polygon.length < 3) return { ...input.point }
  const edgePoint = projectRoomWorldPointToPolygon(input.point, input.polygon)
  const vertexAverage = input.polygon.reduce(
    (total, point) => ({
      x: total.x + point.x / input.polygon.length,
      y: total.y + point.y / input.polygon.length
    }),
    { x: 0, y: 0 }
  )
  const interiorPoint = findVerifiedInteriorPoint(
    input.polygon,
    vertexAverage
  )
  if (!interiorPoint) return { ...input.point }

  for (let step = 0; step <= 48; step += 1) {
    const progress = step / 48
    const candidate = {
      x: edgePoint.x + (interiorPoint.x - edgePoint.x) * progress,
      y: edgePoint.y + (interiorPoint.y - edgePoint.y) * progress
    }
    if (isRoomV2FloorFootprintInsidePolygon({
      point: candidate,
      polygon: input.polygon,
      footprint: input.footprint,
      anchor: input.anchor
    })) {
      return candidate
    }
  }

  return { ...input.point }
}

export function isRoomV2FloorFootprintInsidePolygon(input: {
  point: RoomWorldPoint
  polygon: RoomWalkablePolygonPoint[]
  footprint: RoomFootprint
  anchor: RoomAnchor
}): boolean {
  const rectangle = getFootprintCorners(
    input.point,
    input.footprint,
    input.anchor
  )
  if (!rectangle.every((point) =>
    pointInRoomWorldPolygon(point, input.polygon)
  )) {
    return false
  }

  const rectangleEdges = getClosedEdges(rectangle.slice(1))
  const polygonEdges = getClosedEdges(input.polygon)
  return !rectangleEdges.some(([start, end]) =>
    polygonEdges.some(([polygonStart, polygonEnd]) =>
      segmentsProperlyIntersect(start, end, polygonStart, polygonEnd)
    )
  )
}

function getFootprintCorners(
  point: RoomWorldPoint,
  footprint: RoomFootprint,
  anchor: RoomAnchor
): RoomWorldPoint[] {
  const minX = point.x - footprint.width * anchor.x
  const maxX = minX + footprint.width
  const minY = point.y - footprint.height * anchor.y
  const maxY = minY + footprint.height
  return [
    point,
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY }
  ]
}

function getClosedEdges(
  points: RoomWorldPoint[]
): [RoomWorldPoint, RoomWorldPoint][] {
  return points.map((point, index) => [
    point,
    points[(index + 1) % points.length]
  ])
}

function segmentsProperlyIntersect(
  a: RoomWorldPoint,
  b: RoomWorldPoint,
  c: RoomWorldPoint,
  d: RoomWorldPoint
): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  )
}

function cross(
  a: RoomWorldPoint,
  b: RoomWorldPoint,
  point: RoomWorldPoint
): number {
  return (
    (b.x - a.x) * (point.y - a.y) -
    (b.y - a.y) * (point.x - a.x)
  )
}

function findVerifiedInteriorPoint(
  polygon: RoomWalkablePolygonPoint[],
  preferred: RoomWorldPoint
): RoomWorldPoint | null {
  if (pointInRoomWorldPolygon(preferred, polygon)) return preferred
  const minX = Math.min(...polygon.map((point) => point.x))
  const maxX = Math.max(...polygon.map((point) => point.x))
  const minY = Math.min(...polygon.map((point) => point.y))
  const maxY = Math.max(...polygon.map((point) => point.y))

  for (let row = 1; row < 20; row += 1) {
    for (let column = 1; column < 20; column += 1) {
      const candidate = {
        x: minX + ((maxX - minX) * column) / 20,
        y: minY + ((maxY - minY) * row) / 20
      }
      if (pointInRoomWorldPolygon(candidate, polygon)) return candidate
    }
  }
  return null
}
