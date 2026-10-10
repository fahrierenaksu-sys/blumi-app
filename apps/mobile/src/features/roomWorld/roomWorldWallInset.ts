import type { RoomWorldGeometry, RoomWorldPoint } from "./roomWorldGeometry"

/**
 * The floor with its two back-wall edges (the edges meeting at the topmost corner) moved inward by `distance`
 * (metric units, i.e. canvas widths): feet that stop there stay on the visible floor in front of the skirting,
 * while the front lip keeps the floor's own margin. Every other point and setting of the geometry is kept.
 */
export function insetRoomWorldBackWalls(geometry: RoomWorldGeometry, distance: number): RoomWorldGeometry {
  if (!(distance > 0)) return geometry
  const sy = geometry.metric?.y ?? 1
  const sx = geometry.metric?.x ?? 1
  return {
    ...geometry,
    walkableAreas: geometry.walkableAreas.map((area) => {
      const points = area.points
      const n = points.length
      if (n < 4) return area
      let top = 0
      for (let i = 1; i < n; i += 1) if (points[i]!.y < points[top]!.y) top = i
      const at = (i: number) => {
        const p = points[(i + n) % n]!
        return { x: p.x * sx, y: p.y * sy }
      }
      const inward = signedArea(points) > 0 ? 1 : -1
      const offset = (a: Point, b: Point) => {
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
        // the edge's normal toward the polygon's inside (`inward`: the outline's winding, y down)
        const nx = (-dy / len) * inward, ny = (dx / len) * inward
        return { a: { x: a.x + nx * distance, y: a.y + ny * distance }, b: { x: b.x + nx * distance, y: b.y + ny * distance } }
      }
      const prev = at(top - 1), corner = at(top), next = at(top + 1)
      const left = offset(prev, corner)
      const right = offset(corner, next)
      const newCorner = intersect(left.a, left.b, right.a, right.b)
      const newPrev = intersect(left.a, left.b, at(top - 2), prev)
      const newNext = intersect(right.a, right.b, next, at(top + 2))
      if (!newCorner || !newPrev || !newNext) return area
      const back = (p: Point): RoomWorldPoint => ({ x: p.x / sx, y: p.y / sy })
      const out = points.map((p) => ({ x: p.x, y: p.y }))
      out[top] = back(newCorner)
      out[(top - 1 + n) % n] = back(newPrev)
      out[(top + 1) % n] = back(newNext)
      return { ...area, points: out }
    })
  }
}

type Point = { x: number; y: number }

function signedArea(points: readonly RoomWorldPoint[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!, b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Intersection of the infinite line a1–a2 with the infinite line b1–b2, or null when parallel. */
function intersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x)
  if (Math.abs(d) < 1e-12) return null
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) }
}
