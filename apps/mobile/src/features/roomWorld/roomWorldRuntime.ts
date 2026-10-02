import {
  deriveRoomWorldFacing,
  isRoomWorldPointWalkable,
  omitRoomWorldBlockers,
  projectRoomWorldPointToPolygon,
  resolveRoomWorldNearestWalkablePoint,
  resolveRoomWorldPath,
  type RoomWorldFacing,
  type RoomWorldGeometry,
  type RoomWorldHotspot,
  type RoomWorldPath,
  type RoomWorldPoint
} from "./roomWorldGeometry"

export const ROOM_WORLD_AVATAR_COLLISION_CLEARANCE = 0.012
export const ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS = 0.058

/**
 * One constant walking speed for a whole path (ROOM-02). Every segment takes
 * distance x durationPerDistanceMs, corners do not stop the avatar, and only
 * the first and last `rampDistance` of the path accelerate from and
 * decelerate to rest. A path longer than `maxWalkDurationMs` is walked faster
 * as a whole (one cap), never per segment. Plans are pure, so both phones of
 * a shared room time the same walk identically.
 */
export interface RoomWorldMovementTiming {
  /** Cruise pace: milliseconds per room unit. */
  durationPerDistanceMs: number
  /** The longest a whole walk may take. */
  maxWalkDurationMs: number
  /**
   * The shortest a whole walk may take. A tap right beside the avatar is a
   * walk of a few pixels: at cruise pace it would last about 100 ms, too
   * short for even one step of the walk cycle, so it reads as a slide.
   * Such a walk is slowed down as a whole to this length instead.
   */
  minWalkDurationMs?: number
  /** Room units spent accelerating at the start and decelerating at the end. */
  rampDistance: number
}

export const ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING: RoomWorldMovementTiming = {
  durationPerDistanceMs: 1_800,
  maxWalkDurationMs: 1_800,
  // One step of the four-frame walk cycle (two frames) at about the authored
  // 120 ms per frame, plus the ramps.
  minWalkDurationMs: 320,
  rampDistance: 0.04
}

export const ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING: RoomWorldMovementTiming = {
  durationPerDistanceMs: 1_900,
  maxWalkDurationMs: 1_800,
  rampDistance: 0.04
}

/**
 * Resolve a reachable approach without changing the authored seat point.
 * Furniture can be placed in front of a seat after the seat metadata was
 * authored; a few front-offset candidates let the avatar route around that
 * furniture while keeping collision checks fail-closed.
 */
export function resolveRoomWorldSeatApproachPoint(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  hotspot: RoomWorldHotspot
  seatedFurnitureRenderId: string
  clearance?: number
  timing: RoomWorldMovementTiming
}): RoomWorldPoint | null {
  const candidates = [
    input.hotspot.approachPoint,
    ...getRoomWorldSeatApproachFallbacks(input.hotspot)
  ]
    .filter((candidate): candidate is RoomWorldPoint => Boolean(candidate))
    .flatMap((candidate) => [
      candidate,
      // The free spot right next to an approach that furniture or the
      // floor's edge covers (a chair at the front lip).
      ...optionalPoint(resolveRoomWorldNearestWalkablePoint({
        geometry: input.geometry,
        target: candidate,
        clearance: input.clearance ?? 0,
        from: input.from
      })),
      ...getRoomWorldWalkableProjectionCandidates(input.geometry, candidate)
    ])

  return candidates.find((approach) => {
    if (!isRoomWorldPointWalkable(input.geometry, approach, {
      clearance: input.clearance
    })) return false
    return Boolean(createRoomWorldSeatMovementPlan({
      geometry: input.geometry,
      from: input.from,
      approach,
      seat: { x: input.hotspot.x, y: input.hotspot.y },
      seatedFurnitureRenderId: input.seatedFurnitureRenderId,
      clearance: input.clearance,
      timing: input.timing
    }))
  }) ?? null
}

/**
 * Legacy Room V2 furniture can be authored close to the lower floor edge, so
 * its local approach point may land just outside the active shell polygon.
 * Keep the authored point first, then try small inward projections rather
 * than moving the furniture or accepting an unreachable seat.
 */
function getRoomWorldWalkableProjectionCandidates(
  geometry: RoomWorldGeometry,
  point: RoomWorldPoint
): RoomWorldPoint[] {
  const inwardFractions = [0.01, 0.025, 0.05, 0.1]
  return geometry.walkableAreas.flatMap((area) => {
    if (area.points.length < 3) return []
    const projected = projectRoomWorldPointToPolygon(point, area.points)
    const centroid = area.points.reduce(
      (sum, vertex) => ({ x: sum.x + vertex.x, y: sum.y + vertex.y }),
      { x: 0, y: 0 }
    )
    const center = {
      x: centroid.x / area.points.length,
      y: centroid.y / area.points.length
    }
    return inwardFractions.map((fraction) => ({
      x: projected.x + (center.x - projected.x) * fraction,
      y: projected.y + (center.y - projected.y) * fraction
    }))
  })
}

/**
 * Select the nearest reachable seat for a furniture tap. Declaration order is
 * not a spatial preference: on a rotated loveseat the right-hand seat may be
 * the one the avatar can reach first.
 */
export function resolveRoomWorldSeatSelection(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  hotspots: RoomWorldHotspot[]
  seatedFurnitureRenderId: string
  clearance?: number
  timing: RoomWorldMovementTiming
}): { hotspot: RoomWorldHotspot; approach: RoomWorldPoint } | null {
  return input.hotspots
    .filter((hotspot) =>
      hotspot.kind === "seat" &&
      hotspot.sourceRenderId === input.seatedFurnitureRenderId
    )
    .map((hotspot) => {
      const approach = resolveRoomWorldSeatApproachPoint({
        geometry: input.geometry,
        from: input.from,
        hotspot,
        seatedFurnitureRenderId: input.seatedFurnitureRenderId,
        clearance: input.clearance,
        timing: input.timing
      })
      return approach ? { hotspot, approach } : null
    })
    .filter((candidate): candidate is { hotspot: RoomWorldHotspot; approach: RoomWorldPoint } => Boolean(candidate))
    .sort((a, b) =>
      getRoomWorldDistance(input.from, a.approach) -
      getRoomWorldDistance(input.from, b.approach)
    )[0] ?? null
}

export interface RoomWorldMovementSegment {
  from: RoomWorldPoint
  to: RoomWorldPoint
  facing: RoomWorldFacing
  distance: number
  durationMs: number
  isFinal: boolean
  /** Share of this segment's time spent accelerating from rest (first segment only); 0 = linear. */
  rampIn?: number
  /** Share of this segment's time spent decelerating to rest (last segment only); 0 = linear. */
  rampOut?: number
}

export interface RoomWorldMovementPlan {
  target: RoomWorldPoint
  path: RoomWorldPath
  segments: RoomWorldMovementSegment[]
  /** The timing the segments were timed with; combining plans re-times the whole walk. */
  timing?: RoomWorldMovementTiming
}

export interface RoomWorldMovementFrame {
  x: number
  y: number
  facing: RoomWorldFacing
  progress: number
  isComplete: boolean
}

export type RoomWorldAvatarRuntimeMotion =
  | "idle"
  | "walking"
  | "sitting"

export interface RoomWorldAvatarRuntimePose extends RoomWorldPoint {
  facing: RoomWorldFacing
  motion: RoomWorldAvatarRuntimeMotion
}

export interface RoomWorldOccupant extends RoomWorldPoint {
  id: string
  radius?: number
  blocksMovement?: boolean
}

export interface RoomWorldOccupancyOptions {
  movingOccupantId?: string
  radius?: number
}

export function createRoomWorldMovementPlan(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  clearance?: number
  timing: RoomWorldMovementTiming
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
}): RoomWorldMovementPlan | null {
  const geometry = addRoomWorldOccupantBlockers({
    geometry: input.geometry,
    occupants: input.occupants,
    movingOccupantId: input.movingOccupantId
  })
  const path = resolveRoomWorldPath({
    geometry,
    from: input.from,
    to: input.to,
    clearance: input.clearance ?? ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  })
  if (!path) return null

  let segmentStart = input.from
  const segments = path.map((segmentTarget, index): RoomWorldMovementSegment => {
    const distance = getRoomWorldDistance(segmentStart, segmentTarget)
    const segment = {
      from: segmentStart,
      to: segmentTarget,
      facing: deriveRoomWorldFacing(segmentStart, segmentTarget),
      distance,
      durationMs: 0,
      isFinal: index === path.length - 1
    }
    segmentStart = segmentTarget
    return segment
  })

  return {
    target: input.to,
    path,
    segments: timeRoomWorldMovementSegments(segments, input.timing),
    timing: input.timing
  }
}

/**
 * Times a whole walk at one speed: duration = distance x pace for every
 * segment, plus a short acceleration on the first segment and deceleration
 * on the last (velocity is continuous at every corner). One cap scales the
 * whole walk when it would take longer than `maxWalkDurationMs`, and one
 * floor slows it when it would be shorter than `minWalkDurationMs`.
 */
export function timeRoomWorldMovementSegments(
  segments: readonly RoomWorldMovementSegment[],
  timing: RoomWorldMovementTiming
): RoomWorldMovementSegment[] {
  const count = segments.length
  if (count === 0) return []
  const first = segments[0]!
  const last = segments[count - 1]!
  const rampIn = Math.min(timing.rampDistance, count === 1 ? first.distance / 2 : first.distance)
  const rampOut = Math.min(timing.rampDistance, count === 1 ? last.distance / 2 : last.distance)
  const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0)
  const uncappedMs = (totalDistance + rampIn + rampOut) * timing.durationPerDistanceMs
  const minWalkDurationMs = timing.minWalkDurationMs ?? 0
  const pace = uncappedMs > timing.maxWalkDurationMs
    ? timing.durationPerDistanceMs * (timing.maxWalkDurationMs / uncappedMs)
    : uncappedMs > 0 && uncappedMs < minWalkDurationMs
      ? timing.durationPerDistanceMs * (minWalkDurationMs / uncappedMs)
      : timing.durationPerDistanceMs
  return segments.map((segment, index) => {
    const segmentRampIn = index === 0 ? rampIn : 0
    const segmentRampOut = index === count - 1 ? rampOut : 0
    const durationMs = (segment.distance + segmentRampIn + segmentRampOut) * pace
    return {
      ...segment,
      durationMs,
      rampIn: durationMs > 0 ? (2 * segmentRampIn * pace) / durationMs : 0,
      rampOut: durationMs > 0 ? (2 * segmentRampOut * pace) / durationMs : 0
    }
  })
}

/**
 * Share of a segment's distance covered at time share `progress`: constant
 * acceleration over `rampIn`, constant speed, constant deceleration over
 * `rampOut`. With no ramps it is linear. Runs on the UI thread as the
 * withTiming easing and on JS for movement frames, so both agree exactly.
 */
export function easeRoomWorldMovement(progress: number, rampIn: number, rampOut: number): number {
  "worklet"
  const p = Math.min(1, Math.max(0, progress))
  const cruise = 1 / (1 - (rampIn + rampOut) / 2)
  if (rampIn > 0 && p < rampIn) return (cruise * p * p) / (2 * rampIn)
  if (rampOut > 0 && p > 1 - rampOut) return 1 - (cruise * (1 - p) * (1 - p)) / (2 * rampOut)
  return cruise * (p - rampIn / 2)
}

export function createRoomWorldSeatMovementPlan(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  approach: RoomWorldPoint
  seat: RoomWorldPoint
  seatedFurnitureRenderId: string
  clearance?: number
  timing: RoomWorldMovementTiming
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
}): RoomWorldMovementPlan | null {
  const approachPlan = createRoomWorldMovementPlan({
    geometry: input.geometry,
    from: input.from,
    to: input.approach,
    clearance: input.clearance,
    timing: input.timing,
    occupants: input.occupants,
    movingOccupantId: input.movingOccupantId
  })
  if (!approachPlan) return null

  const seatPlan = createRoomWorldMovementPlan({
    geometry: omitRoomWorldBlockers(input.geometry, [input.seatedFurnitureRenderId]),
    from: approachPlan.target,
    to: input.seat,
    clearance: input.clearance,
    timing: input.timing,
    occupants: input.occupants,
    movingOccupantId: input.movingOccupantId
  })
  if (!seatPlan) return null

  const approachSegments = approachPlan.segments.map((segment) => ({
    ...segment,
    isFinal: false
  }))

  return {
    target: seatPlan.target,
    path: [...approachPlan.path, ...seatPlan.path],
    segments: timeRoomWorldMovementSegments([...approachSegments, ...seatPlan.segments], input.timing),
    timing: input.timing
  }
}

export function createRoomWorldSeatExitMovementPlan(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  exit: RoomWorldPoint
  target: RoomWorldPoint
  seatedFurnitureRenderId: string
  clearance?: number
  timing: RoomWorldMovementTiming
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
}): RoomWorldMovementPlan | null {
  const unobstructedGeometry = omitRoomWorldBlockers(
    input.geometry,
    [input.seatedFurnitureRenderId]
  )

  const nearestExit = resolveRoomWorldNearestWalkablePoint({
    geometry: input.geometry,
    target: input.exit,
    clearance: input.clearance ?? ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  })
  return [input.exit, ...getRoomWorldSeatExitFallbacks(input), ...optionalPoint(nearestExit)]
    .map((exit): RoomWorldMovementPlan | null => {
      const exitPlan = createRoomWorldMovementPlan({
        geometry: unobstructedGeometry,
        from: input.from,
        to: exit,
        clearance: input.clearance,
        timing: input.timing,
        occupants: input.occupants,
        movingOccupantId: input.movingOccupantId
      })
      if (!exitPlan) return null

      const targetPlan = createRoomWorldMovementPlan({
        geometry: input.geometry,
        from: exitPlan.target,
        to: input.target,
        clearance: input.clearance,
        timing: input.timing,
        occupants: input.occupants,
        movingOccupantId: input.movingOccupantId
      })
      if (!targetPlan) return null

      return {
        target: targetPlan.target,
        path: [...exitPlan.path, ...targetPlan.path],
        segments: timeRoomWorldMovementSegments([
          ...exitPlan.segments.map((segment) => ({ ...segment, isFinal: false })),
          ...targetPlan.segments
        ], input.timing),
        timing: input.timing
      }
    })
    .find((plan): plan is RoomWorldMovementPlan => Boolean(plan)) ?? null
}

function getRoomWorldSeatApproachFallbacks(
  hotspot: RoomWorldHotspot
): RoomWorldPoint[] {
  const distanceCandidates = [0.16, 0.22, 0.28, 0.34]
  const direction = hotspot.facing ?? "front"
  return distanceCandidates.map((distance) => {
    if (direction === "back") return { x: hotspot.x, y: hotspot.y - distance }
    if (direction === "right") return { x: hotspot.x + distance, y: hotspot.y }
    if (direction === "left") return { x: hotspot.x - distance, y: hotspot.y }
    return { x: hotspot.x, y: hotspot.y + distance }
  })
}

/**
 * A seat can be entered through its own blocker, but the avatar must clear
 * that footprint before the normal collision geometry is restored. Keep the
 * authored exit first, then continue in its direction if it is too shallow.
 */
function getRoomWorldSeatExitFallbacks(input: {
  from: RoomWorldPoint
  exit: RoomWorldPoint
}): RoomWorldPoint[] {
  const deltaX = input.exit.x - input.from.x
  const deltaY = input.exit.y - input.from.y
  const length = Math.hypot(deltaX, deltaY)
  if (length === 0) return []

  const unitX = deltaX / length
  const unitY = deltaY / length
  return [0.16, 0.22, 0.28, 0.34].map((distance) => ({
    x: input.from.x + unitX * distance,
    y: input.from.y + unitY * distance
  }))
}

export function combineRoomWorldMovementPlans(
  plans: readonly RoomWorldMovementPlan[]
): RoomWorldMovementPlan | null {
  const finalPlan = plans.at(-1)
  if (!finalPlan || plans.some((plan) => plan.segments.length === 0)) return null

  const segments = plans.flatMap((plan, index) =>
    index === plans.length - 1
      ? plan.segments
      : plan.segments.map((segment) => ({ ...segment, isFinal: false }))
  )
  return {
    target: finalPlan.target,
    path: plans.flatMap((plan) => plan.path),
    // One walk: one speed, one start ramp and one stop ramp across the plans.
    segments: finalPlan.timing ? timeRoomWorldMovementSegments(segments, finalPlan.timing) : segments,
    timing: finalPlan.timing
  }
}

export function resolveRoomWorldUnoccupiedTarget(input: {
  geometry: RoomWorldGeometry
  target: RoomWorldPoint
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
  clearance?: number
  radius?: number
  /** Only a point reachable from here qualifies. */
  from?: RoomWorldPoint
}): RoomWorldPoint | null {
  const clearance = input.clearance ?? ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  const radius = input.radius ?? ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS
  const occupantGeometry = addRoomWorldOccupantBlockers({
    geometry: input.geometry,
    occupants: input.occupants,
    movingOccupantId: input.movingOccupantId,
    radius
  })
  // Next to the other avatar, never through it: the nearest free point.
  return resolveRoomWorldNearestWalkablePoint({
    geometry: occupantGeometry,
    target: input.target,
    clearance,
    from: input.from
  })
}

/**
 * Where a tap or a walk request ends: the tapped point itself when the avatar
 * can stand there, else the nearest walkable point next to it (beside the
 * footprint it hit, just inside the floor edge), then nudged off another
 * avatar. With `from`, only a point the avatar can reach from there.
 */
export function resolveRoomWorldInteractiveTarget(input: {
  geometry: RoomWorldGeometry
  target: RoomWorldPoint
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
  clearance?: number
  radius?: number
  from?: RoomWorldPoint
}): RoomWorldPoint | null {
  const clearance = input.clearance ?? ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  const walkableTarget = resolveRoomWorldNearestWalkablePoint({
    geometry: input.geometry,
    target: input.target,
    clearance,
    from: input.from
  })
  if (!walkableTarget) return null

  return resolveRoomWorldUnoccupiedTarget({
    ...input,
    target: walkableTarget,
    clearance
  })
}

export function isRoomWorldTargetOccupied(input: {
  target: RoomWorldPoint
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
  radius?: number
}): boolean {
  const radius = input.radius ?? ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS
  return (input.occupants ?? []).some((occupant) => {
    if (occupant.blocksMovement === false) return false
    if (occupant.id === input.movingOccupantId) return false
    const occupantRadius = occupant.radius ?? radius
    return Math.hypot(occupant.x - input.target.x, occupant.y - input.target.y) <
      occupantRadius + radius
  })
}

export function getRoomWorldMovementFrame(input: {
  segment: RoomWorldMovementSegment
  startedAt: number
  now: number
}): RoomWorldMovementFrame {
  const progress = input.segment.durationMs > 0
    ? Math.min(1, Math.max(0, (input.now - input.startedAt) / input.segment.durationMs))
    : 1
  const eased = easeRoomWorldMovement(progress, input.segment.rampIn ?? 0, input.segment.rampOut ?? 0)
  return {
    x: input.segment.from.x + (input.segment.to.x - input.segment.from.x) * eased,
    y: input.segment.from.y + (input.segment.to.y - input.segment.from.y) * eased,
    facing: input.segment.facing,
    progress,
    isComplete: progress >= 1
  }
}

export function getRoomWorldMovementSegmentStartPose(
  segment: RoomWorldMovementSegment
): RoomWorldAvatarRuntimePose {
  return {
    ...segment.from,
    facing: segment.facing,
    motion: "walking"
  }
}

export function getRoomWorldMovementFramePose(input: {
  frame: RoomWorldMovementFrame
  segment: RoomWorldMovementSegment
  arrival?: {
    facing?: RoomWorldFacing
    motion?: RoomWorldAvatarRuntimeMotion
  }
}): RoomWorldAvatarRuntimePose {
  if (!input.frame.isComplete || !input.segment.isFinal) {
    return {
      x: input.frame.x,
      y: input.frame.y,
      facing: input.frame.facing,
      motion: "walking"
    }
  }

  return {
    x: input.frame.x,
    y: input.frame.y,
    facing: input.arrival?.facing ?? input.frame.facing,
    motion: input.arrival?.motion ?? "idle"
  }
}

function optionalPoint(point: RoomWorldPoint | null): RoomWorldPoint[] {
  return point ? [point] : []
}

function getRoomWorldDistance(
  from: RoomWorldPoint,
  to: RoomWorldPoint
): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function addRoomWorldOccupantBlockers(input: {
  geometry: RoomWorldGeometry
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
  radius?: number
}): RoomWorldGeometry {
  const radius = input.radius ?? ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS
  const occupantBlockers = (input.occupants ?? [])
    .filter((occupant) =>
      occupant.id !== input.movingOccupantId &&
      occupant.blocksMovement !== false
    )
    .map((occupant) => {
      const occupantRadius = occupant.radius ?? radius
      return {
        id: `room_world_occupant_${occupant.id}`,
        x: occupant.x,
        y: occupant.y,
        width: occupantRadius * 2,
        height: occupantRadius * 1.45,
        anchor: { x: 0.5, y: 0.66 },
        blocksMovement: true
      }
    })

  if (!occupantBlockers.length) return input.geometry
  return {
    ...input.geometry,
    blockers: [
      ...(input.geometry.blockers ?? []),
      ...occupantBlockers
    ]
  }
}
