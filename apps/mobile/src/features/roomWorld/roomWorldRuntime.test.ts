import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomWorldSeatExitMovementPlan,
  createRoomWorldSeatMovementPlan,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING,
  resolveRoomWorldSeatApproachPoint,
  resolveRoomWorldSeatSelection
} from "./roomWorldRuntime"
import type { RoomWorldGeometry } from "./roomWorldGeometry"

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
