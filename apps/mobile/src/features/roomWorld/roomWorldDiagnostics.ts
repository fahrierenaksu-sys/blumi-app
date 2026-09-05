import {
  isRoomWorldPointWalkable,
  pointInRoomWorldPolygon,
  resolveRoomWorldPath,
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "./roomWorldGeometry"
import { ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "./roomWorldRuntime"

export type RoomWorldMotionReadinessLevel =
  | "ready"
  | "constrained"
  | "blocked"

export type RoomWorldMotionIssueId =
  | "no_walkable_floor"
  | "spawn_blocked"
  | "no_reachable_targets"
  | "limited_reachable_floor"

export interface RoomWorldMotionReadinessSummary {
  level: RoomWorldMotionReadinessLevel
  issueIds: RoomWorldMotionIssueId[]
  walkableSampleCount: number
  reachableSampleCount: number
  reachableRatio: number
}

const DEFAULT_SAMPLE_COLUMNS = 6
const DEFAULT_SAMPLE_ROWS = 5
const CONSTRAINED_REACHABLE_RATIO = 0.45

export function getRoomWorldMotionReadinessSummary(input: {
  geometry: RoomWorldGeometry
  spawn: RoomWorldPoint
  clearance?: number
}): RoomWorldMotionReadinessSummary {
  const clearance = input.clearance ?? ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  const issueIds: RoomWorldMotionIssueId[] = []
  const samples = getRoomWorldWalkableSamples(input.geometry, { clearance })

  if (samples.length === 0) {
    issueIds.push("no_walkable_floor")
  }

  const spawnIsWalkable = isRoomWorldPointWalkable(input.geometry, input.spawn, {
    clearance
  })
  if (!spawnIsWalkable) {
    issueIds.push("spawn_blocked")
  }

  const reachableSamples = spawnIsWalkable
    ? samples.filter((sample) =>
        resolveRoomWorldPath({
          geometry: input.geometry,
          from: input.spawn,
          to: sample,
          clearance
        })
      )
    : []

  if (samples.length > 0 && reachableSamples.length === 0) {
    issueIds.push("no_reachable_targets")
  }

  const reachableRatio = samples.length
    ? reachableSamples.length / samples.length
    : 0

  if (
    reachableSamples.length > 0 &&
    reachableRatio < CONSTRAINED_REACHABLE_RATIO
  ) {
    issueIds.push("limited_reachable_floor")
  }

  return {
    level: getRoomWorldMotionReadinessLevel(issueIds),
    issueIds,
    walkableSampleCount: samples.length,
    reachableSampleCount: reachableSamples.length,
    reachableRatio
  }
}

function getRoomWorldMotionReadinessLevel(
  issueIds: RoomWorldMotionIssueId[]
): RoomWorldMotionReadinessLevel {
  if (
    issueIds.includes("no_walkable_floor") ||
    issueIds.includes("spawn_blocked") ||
    issueIds.includes("no_reachable_targets")
  ) {
    return "blocked"
  }
  if (issueIds.includes("limited_reachable_floor")) return "constrained"
  return "ready"
}

function getRoomWorldWalkableSamples(
  geometry: RoomWorldGeometry,
  options: { clearance: number }
): RoomWorldPoint[] {
  return geometry.walkableAreas.flatMap((area) => {
    if (area.points.length < 3) return []
    const bounds = area.points.reduce(
      (current, point) => ({
        minX: Math.min(current.minX, point.x),
        maxX: Math.max(current.maxX, point.x),
        minY: Math.min(current.minY, point.y),
        maxY: Math.max(current.maxY, point.y)
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      }
    )

    const samples: RoomWorldPoint[] = []
    for (let row = 0; row < DEFAULT_SAMPLE_ROWS; row += 1) {
      for (let column = 0; column < DEFAULT_SAMPLE_COLUMNS; column += 1) {
        const point = {
          x: interpolate(bounds.minX, bounds.maxX, column, DEFAULT_SAMPLE_COLUMNS),
          y: interpolate(bounds.minY, bounds.maxY, row, DEFAULT_SAMPLE_ROWS)
        }
        if (
          pointInRoomWorldPolygon(point, area.points) &&
          isRoomWorldPointWalkable(geometry, point, {
            clearance: options.clearance
          })
        ) {
          samples.push(point)
        }
      }
    }
    return samples
  })
}

function interpolate(
  min: number,
  max: number,
  index: number,
  count: number
): number {
  if (count <= 1) return min
  const padding = 1 / (count + 1)
  const progress = padding + (index / (count - 1)) * (1 - padding * 2)
  return min + (max - min) * progress
}
