import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV3FootprintForRotation,
  getRoomV3SeatPoints,
  migrateRoomV2DecorToV3,
  ROOM_V3_DECOR_SCHEMA_VERSION
} from "./roomV3Contracts"
import type { FurnitureItem, RoomShell, UserRoomDecor } from "./roomV2.types"

const V3_SHELL: RoomShell = {
  id: "room_v3_shell_cocoa_navy_modern_studio",
  name: "Cocoa Navy Modern Studio",
  geometryVersion: "blumi_room_v3_2026",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1536, height: 1024 },
  placeableArea: { minX: 0.14, maxX: 0.86, minY: 0.48, maxY: 0.91 },
  walkablePolygon: [
    { x: 0.5, y: 0.4 },
    { x: 0.84, y: 0.55 },
    { x: 0.88, y: 0.73 },
    { x: 0.7, y: 0.92 },
    { x: 0.3, y: 0.92 },
    { x: 0.12, y: 0.73 },
    { x: 0.16, y: 0.55 }
  ]
}

const ROTATABLE_LOVESEAT: FurnitureItem = {
  id: "room_v3_cocoa_navy_loveseat_a",
  name: "Cocoa Navy Loveseat A",
  collectionId: "cocoa_navy_modern_studio",
  homeTheme: "cocoa_navy_modern_studio",
  asset: { key: "front", source: 0 as never },
  assetsByRotation: {
    front: { key: "front", source: 0 as never },
    back: { key: "back", source: 0 as never },
    left: { key: "left", source: 0 as never },
    right: { key: "right", source: 0 as never }
  },
  category: "seating",
  layer: "furniture",
  placementSurface: "floor",
  width: 0.28,
  height: 0.26,
  footprint: { width: 0.25, height: 0.12 },
  footprintByRotation: {
    front: { width: 0.25, height: 0.12 },
    back: { width: 0.25, height: 0.12 },
    left: { width: 0.14, height: 0.24 },
    right: { width: 0.14, height: 0.24 }
  },
  blocksMovement: true,
  interactionType: "seat",
  seatSpec: {
    capacity: 2,
    seatPoints: [
      {
        id: "left",
        x: -0.22,
        y: -0.2,
        seatHeight: 0.09,
        facing: "front",
        approachPoint: { x: -0.22, y: 0.22 },
        exitPoint: { x: -0.33, y: 0.28 }
      },
      {
        id: "right",
        x: 0.22,
        y: -0.2,
        seatHeight: 0.09,
        facing: "front",
        approachPoint: { x: 0.22, y: 0.22 },
        exitPoint: { x: 0.33, y: 0.28 }
      }
    ]
  }
}

test("rotation-aware footprints resolve from real directional metadata", () => {
  assert.deepEqual(
    getRoomV3FootprintForRotation(ROTATABLE_LOVESEAT, "left"),
    { width: 0.14, height: 0.24 }
  )
  assert.deepEqual(
    getRoomV3FootprintForRotation(ROTATABLE_LOVESEAT, "front"),
    { width: 0.25, height: 0.12 }
  )
})

test("multi-seat furniture requires one reachable approach and exit per seat", () => {
  const points = getRoomV3SeatPoints({
    seatSpec: ROTATABLE_LOVESEAT.seatSpec,
    x: 0.5,
    y: 0.72,
    width: 0.28,
    height: 0.26,
    rotation: "front"
  })

  assert.equal(points.length, 2)
  assert.deepEqual(points[0], {
    id: "left",
    facing: "front",
    seatHeight: 0.09,
    seat: { x: 0.4384, y: 0.668 },
    approach: { x: 0.4384, y: 0.7772 },
    exit: { x: 0.4076, y: 0.7928 }
  })
})

test("rotated seat rig keeps each local seat, approach, exit, and facing aligned", () => {
  const points = getRoomV3SeatPoints({
    seatSpec: ROTATABLE_LOVESEAT.seatSpec,
    x: 0.5,
    y: 0.72,
    width: 0.28,
    height: 0.26,
    rotation: "right"
  })

  assert.deepEqual(points, [
    {
      id: "left",
      facing: "right",
      seatHeight: 0.09,
      seat: { x: 0.556, y: 0.6628 },
      approach: { x: 0.4384, y: 0.6628 },
      exit: { x: 0.4216, y: 0.6342 }
    },
    {
      id: "right",
      facing: "right",
      seatHeight: 0.09,
      seat: { x: 0.556, y: 0.7772 },
      approach: { x: 0.4384, y: 0.7772 },
      exit: { x: 0.4216, y: 0.8058 }
    }
  ])
})

test("multi-seat furniture fails closed when any declared seat lacks a required route", () => {
  const incompleteSeatSpec = {
    ...ROTATABLE_LOVESEAT.seatSpec!,
    seatPoints: [
      ROTATABLE_LOVESEAT.seatSpec!.seatPoints[0],
      {
        ...ROTATABLE_LOVESEAT.seatSpec!.seatPoints[1],
        exitPoint: undefined
      }
    ]
  }

  assert.deepEqual(getRoomV3SeatPoints({
    seatSpec: incompleteSeatSpec,
    x: 0.5,
    y: 0.72,
    width: 0.28,
    height: 0.26,
    rotation: "front"
  }), [])
})

test("sitting metadata fails closed when seat height is missing", () => {
  const missingHeight = {
    ...ROTATABLE_LOVESEAT.seatSpec!,
    seatPoints: ROTATABLE_LOVESEAT.seatSpec!.seatPoints.map((seatPoint) => ({
      ...seatPoint,
      seatHeight: undefined
    }))
  }

  assert.deepEqual(
    getRoomV3SeatPoints({
      seatSpec: missingHeight,
      x: 0.5,
      y: 0.72,
      width: 0.28,
      height: 0.26,
      rotation: "front"
    }),
    []
  )
})

test("VNext seat routes use authored physical centimetres instead of render-box ratios", () => {
  const physicalSeatSpec = {
    capacity: 1,
    seatPoints: [{
      id: "cloud-seat",
      x: 0,
      y: 0,
      facing: "front" as const,
      localPositionCm: { x: 0, y: 8 },
      approachPointCm: { x: 0, y: -46 },
      exitPointCm: { x: 0, y: 48 },
      seatHeight: 0.0794
    }]
  }
  assert.deepEqual(getRoomV3SeatPoints({
    seatSpec: physicalSeatSpec,
    x: 0.5,
    y: 0.72,
    width: 0.23,
    height: 0.23,
    rotation: "front",
    physicalSizeCm: { width: 82, depth: 80, height: 92 }
  }), [{
    id: "cloud-seat",
    facing: "front",
    seatHeight: 0.0794,
    seat: { x: 0.5, y: 0.726 },
    approach: { x: 0.5, y: 0.6855 },
    exit: { x: 0.5, y: 0.756 }
  }])
})

test("v2 layouts migrate immutably to the selected v3 shell geometry", () => {
  const legacy: UserRoomDecor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "legacy-chair",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.74,
      rotation: "front"
    }]
  }

  const migrated = migrateRoomV2DecorToV3({
    decor: legacy,
    targetShell: V3_SHELL
  })

  assert.equal(migrated.schemaVersion, ROOM_V3_DECOR_SCHEMA_VERSION)
  assert.equal(migrated.geometryVersion, "blumi_room_v3_2026")
  assert.equal(migrated.roomShellId, V3_SHELL.id)
  assert.equal(migrated.migration?.fromSchemaVersion, 2)
  assert.deepEqual(legacy, {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "legacy-chair",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.74,
      rotation: "front"
    }]
  })

  const migratedAgain = migrateRoomV2DecorToV3({
    decor: migrated,
    targetShell: V3_SHELL
  })
  assert.deepEqual(migratedAgain, migrated)
  assert.notEqual(migratedAgain, migrated)
  assert.notEqual(migratedAgain.placedItems, migrated.placedItems)
})
