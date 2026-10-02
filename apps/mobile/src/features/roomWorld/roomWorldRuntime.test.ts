import assert from "node:assert/strict"
import test from "node:test"
import {
  combineRoomWorldMovementPlans,
  createRoomWorldMovementPlan,
  createRoomWorldSeatExitMovementPlan,
  createRoomWorldSeatMovementPlan,
  easeRoomWorldMovement,
  getRoomWorldMovementFrame,
  ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING,
  resolveRoomWorldSeatApproachPoint,
  resolveRoomWorldSeatSelection,
  timeRoomWorldMovementSegments,
  type RoomWorldMovementSegment
} from "./roomWorldRuntime"
import type { RoomWorldGeometry } from "./roomWorldGeometry"

// ── ROOM-02: one walking speed, no stop at corners ──────────────────────

const OPEN_ROOM: RoomWorldGeometry = {
  walkableAreas: [{ id: "room", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }],
  blockers: []
}

function rawSegment(from: [number, number], to: [number, number], isFinal = false): RoomWorldMovementSegment {
  return {
    from: { x: from[0], y: from[1] },
    to: { x: to[0], y: to[1] },
    facing: "right",
    distance: Math.hypot(to[0] - from[0], to[1] - from[1]),
    durationMs: 0,
    isFinal
  }
}

/** Speed (room units per ms) at time share `p` of a segment. */
function speedAt(segment: RoomWorldMovementSegment, p: number): number {
  const h = 1e-4
  const a = easeRoomWorldMovement(Math.max(0, p - h), segment.rampIn ?? 0, segment.rampOut ?? 0)
  const b = easeRoomWorldMovement(Math.min(1, p + h), segment.rampIn ?? 0, segment.rampOut ?? 0)
  return ((b - a) * segment.distance) / ((Math.min(1, p + h) - Math.max(0, p - h)) * segment.durationMs)
}

test("every segment of a walk moves at the same cruise speed; corners do not stop the avatar", () => {
  const timing = ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  const segments = timeRoomWorldMovementSegments([
    rawSegment([0.1, 0.8], [0.3, 0.8]),
    rawSegment([0.3, 0.8], [0.32, 0.7]),
    rawSegment([0.32, 0.7], [0.6, 0.7]),
    rawSegment([0.6, 0.7], [0.62, 0.6], true)
  ], timing)
  const cruise = 1 / timing.durationPerDistanceMs
  // Middle segments are linear at exactly the cruise speed, however short.
  for (const segment of segments.slice(1, -1)) {
    assert.equal(segment.rampIn, 0)
    assert.equal(segment.rampOut, 0)
    assert.ok(Math.abs(segment.durationMs - segment.distance * timing.durationPerDistanceMs) < 1e-9)
    for (const p of [0.1, 0.5, 0.9]) assert.ok(Math.abs(speedAt(segment, p) - cruise) / cruise < 1e-3)
  }
  // Velocity is continuous at every corner (was: ease-out restarted at full speed and stopped at each corner).
  for (let index = 0; index < segments.length - 1; index += 1) {
    const end = speedAt(segments[index]!, 0.9999)
    const start = speedAt(segments[index + 1]!, 0.0001)
    assert.ok(Math.abs(end - start) / cruise < 0.01, `corner ${index}: ${end} vs ${start}`)
  }
  // The walk starts from rest and ends at rest, ramping only at its two ends.
  assert.ok(speedAt(segments[0]!, 0.0001) < cruise * 0.05)
  assert.ok(speedAt(segments.at(-1)!, 0.9999) < cruise * 0.05)
  assert.ok((segments[0]!.rampIn ?? 0) > 0 && (segments.at(-1)!.rampOut ?? 0) > 0)
})

test("walk duration follows distance with one cap for the whole walk (was clamped 240-760 ms per segment)", () => {
  // The floor for very short walks has its own test below.
  const timing = { ...ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING, minWalkDurationMs: 0 }
  const total = (segments: RoomWorldMovementSegment[]) => segments.reduce((sum, segment) => sum + segment.durationMs, 0)
  const short = timeRoomWorldMovementSegments([rawSegment([0.5, 0.5], [0.55, 0.5], true)], timing)
  const long = timeRoomWorldMovementSegments([rawSegment([0.1, 0.5], [0.6, 0.5], true)], timing)
  // Same speed: ten times the distance takes about ten times as long (plus the fixed ramps).
  const ramps = (distance: number) => 2 * Math.min(timing.rampDistance, distance / 2)
  assert.ok(Math.abs(total(short) - (0.05 + ramps(0.05)) * timing.durationPerDistanceMs) < 1e-6)
  assert.ok(Math.abs(total(long) - (0.5 + ramps(0.5)) * timing.durationPerDistanceMs) < 1e-6)
  const cruise = (ms: number, distance: number) => ms - ramps(distance) * timing.durationPerDistanceMs
  assert.ok(Math.abs(cruise(total(long), 0.5) / cruise(total(short), 0.05) - 10) < 1e-6)
  const capped = timeRoomWorldMovementSegments([
    rawSegment([0.05, 0.9], [0.95, 0.9]),
    rawSegment([0.95, 0.9], [0.95, 0.1]),
    rawSegment([0.95, 0.1], [0.05, 0.1], true)
  ], timing)
  assert.ok(Math.abs(total(capped) - timing.maxWalkDurationMs) < 1e-6, "a long walk is walked faster as a whole")
})

test("a tap right beside the avatar still walks long enough for a step; longer walks keep cruise pace", () => {
  const timing = ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  const minMs = timing.minWalkDurationMs ?? 0
  assert.ok(minMs >= 240, "one step of the walk cycle needs about two authored frames")
  const total = (segments: RoomWorldMovementSegment[]) => segments.reduce((sum, segment) => sum + segment.durationMs, 0)
  for (const distance of [0.004, 0.02, 0.05]) {
    const walk = timeRoomWorldMovementSegments([rawSegment([0.5, 0.5], [0.5 + distance, 0.5], true)], timing)
    assert.ok(Math.abs(total(walk) - minMs) < 1e-6, `a ${distance} walk lasts ${total(walk)} ms`)
    // Still starts and ends at rest, and arrives exactly.
    const segment = walk[0]!
    assert.ok(speedAt(segment, 0.0001) < speedAt(segment, 0.5) * 0.05)
    assert.ok(speedAt(segment, 0.9999) < speedAt(segment, 0.5) * 0.05)
    const end = getRoomWorldMovementFrame({ segment, startedAt: 0, now: segment.durationMs })
    assert.ok(Math.abs(end.x - segment.to.x) < 1e-12 && Math.abs(end.y - segment.to.y) < 1e-12)
  }
  // A walk already longer than the floor is untouched.
  const ordinary = timeRoomWorldMovementSegments([rawSegment([0.2, 0.5], [0.5, 0.5], true)], timing)
  assert.ok(Math.abs(total(ordinary) - (0.3 + 2 * timing.rampDistance) * timing.durationPerDistanceMs) < 1e-6)
})

test("the walk curve is linear without ramps and ends exactly at the segment end", () => {
  for (const p of [0, 0.25, 0.5, 1]) assert.ok(Math.abs(easeRoomWorldMovement(p, 0, 0) - p) < 1e-12)
  assert.equal(easeRoomWorldMovement(0, 0.3, 0.2), 0)
  assert.ok(Math.abs(easeRoomWorldMovement(1, 0.3, 0.2) - 1) < 1e-12)
  assert.equal(easeRoomWorldMovement(1.4, 0.3, 0), 1)
})

test("both phones time the same MiniRoom walk identically, and combining plans re-times one walk", () => {
  const plan = () => createRoomWorldMovementPlan({
    geometry: OPEN_ROOM, from: { x: 0.2, y: 0.7 }, to: { x: 0.7, y: 0.4 }, timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING
  })
  assert.deepEqual(plan(), plan())
  const first = plan()!
  const second = createRoomWorldMovementPlan({
    geometry: OPEN_ROOM, from: first.target, to: { x: 0.3, y: 0.3 }, timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING
  })!
  const combined = combineRoomWorldMovementPlans([first, second])!
  const ramped = combined.segments.filter((segment) => (segment.rampIn ?? 0) > 0 || (segment.rampOut ?? 0) > 0)
  assert.ok(ramped.length <= 2, "only the walk's first and last segment ramp")
  const last = combined.segments.at(-1)!
  const frame = getRoomWorldMovementFrame({ segment: last, startedAt: 0, now: last.durationMs })
  assert.deepEqual({ x: frame.x, y: frame.y }, last.to)
})

const GEOMETRY: RoomWorldGeometry = {
  walkableAreas: [{
    id: "room",
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]
  }],
  blockers: [{
    id: "loveseat",
    x: 0.5,
    y: 0.6,
    width: 0.26,
    height: 0.16,
    anchor: { x: 0.5, y: 0.5 },
    blocksMovement: true
  }]
}

test("seat movement reaches a clear approach before entering the selected furniture", () => {
  const plan = createRoomWorldSeatMovementPlan({
    geometry: GEOMETRY,
    from: { x: 0.15, y: 0.78 },
    approach: { x: 0.5, y: 0.72 },
    seat: { x: 0.5, y: 0.58 },
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })

  assert.ok(plan)
  assert.deepEqual(plan.target, { x: 0.5, y: 0.58 })
  assert.ok(plan.segments.some((segment) =>
    segment.to.x === 0.5 && segment.to.y === 0.72
  ))
  assert.equal(plan.segments.at(-1)?.isFinal, true)
})

test("seat movement fails closed when its required approach point is blocked", () => {
  assert.equal(createRoomWorldSeatMovementPlan({
    geometry: GEOMETRY,
    from: { x: 0.15, y: 0.78 },
    approach: { x: 0.5, y: 0.58 },
    seat: { x: 0.5, y: 0.58 },
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  }), null)
})

test("seat approach can route around a blocking tabletop while preserving the seat point", () => {
  const approach = resolveRoomWorldSeatApproachPoint({
    geometry: {
      walkableAreas: GEOMETRY.walkableAreas,
      blockers: [
        ...GEOMETRY.blockers!,
        {
          id: "coffee-table",
          x: 0.5,
          y: 0.76,
          width: 0.12,
          height: 0.12,
          anchor: { x: 0.5, y: 0.5 },
          blocksMovement: true
        }
      ]
    },
    from: { x: 0.2, y: 0.9 },
    hotspot: {
      id: "loveseat:left",
      kind: "seat",
      x: 0.42,
      y: 0.52,
      facing: "front",
      approachPoint: { x: 0.42, y: 0.62 },
      sourceRenderId: "loveseat"
    },
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })

  assert.deepEqual(approach, { x: 0.42, y: 0.74 })
})

test("seat selection chooses the nearest reachable rotated seat instead of declaration order", () => {
  const selection = resolveRoomWorldSeatSelection({
    geometry: {
      walkableAreas: GEOMETRY.walkableAreas,
      blockers: GEOMETRY.blockers
    },
    from: { x: 0.82, y: 0.86 },
    hotspots: [
      {
        id: "loveseat:left",
        seatId: "left",
        kind: "seat",
        x: 0.38,
        y: 0.58,
        facing: "right",
        seatHeight: 0.09,
        approachPoint: { x: 0.38, y: 0.74 },
        exitPoint: { x: 0.38, y: 0.78 },
        sourceRenderId: "loveseat"
      },
      {
        id: "loveseat:right",
        seatId: "right",
        kind: "seat",
        x: 0.62,
        y: 0.58,
        facing: "right",
        seatHeight: 0.09,
        approachPoint: { x: 0.62, y: 0.74 },
        exitPoint: { x: 0.62, y: 0.78 },
        sourceRenderId: "loveseat"
      }
    ],
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })

  assert.equal(selection?.hotspot.seatId, "right")
  assert.deepEqual(selection?.approach, { x: 0.62, y: 0.74 })
})

test("seat exit reaches the declared exit point before resuming normal movement", () => {
  const plan = createRoomWorldSeatExitMovementPlan({
    geometry: GEOMETRY,
    from: { x: 0.5, y: 0.58 },
    exit: { x: 0.5, y: 0.72 },
    target: { x: 0.18, y: 0.72 },
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })

  assert.ok(plan)
  assert.deepEqual(plan.target, { x: 0.18, y: 0.72 })
  assert.ok(plan.segments.some((segment) =>
    segment.to.x === 0.5 && segment.to.y === 0.72
  ))
  assert.equal(plan.segments.at(-1)?.isFinal, true)
})

test("seat exit clears the furniture footprint when the authored exit is still inside it", () => {
  const plan = createRoomWorldSeatExitMovementPlan({
    geometry: GEOMETRY,
    from: { x: 0.5, y: 0.58 },
    // The loveseat blocker ends at y=0.68, so this authored point is not a
    // usable standing position once the furniture blocker is restored.
    exit: { x: 0.5, y: 0.63 },
    target: { x: 0.18, y: 0.78 },
    seatedFurnitureRenderId: "loveseat",
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })

  assert.ok(plan)
  assert.deepEqual(plan.target, { x: 0.18, y: 0.78 })
  assert.ok(plan.segments.some((segment) => segment.to.y >= 0.74))
})
