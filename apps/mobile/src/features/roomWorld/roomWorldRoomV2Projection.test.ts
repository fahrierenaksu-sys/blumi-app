import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomWorldGeometryFromRoomV2Scene,
  createRoomWorldHotspotsFromRoomV2Scene
} from "./roomWorldRoomV2Projection"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"
import type { FurnitureItem, RoomShell } from "../roomV2/roomV2.types"

const TEST_SHELL: RoomShell = {
  id: "room_v3_test_shell",
  name: "Room V3 Test Shell",
  geometryVersion: "blumi_room_v3_2026",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1628, height: 966 },
  placeableArea: { minX: 0.16, maxX: 0.84, minY: 0.5, maxY: 0.9 }
}

const V3_LOVESEAT: FurnitureItem = {
  id: "room_v3_loveseat",
  name: "Room V3 Loveseat",
  asset: { key: "front", source: 0 as never },
  assetsByRotation: {
    front: { key: "front", source: 0 as never },
    right: { key: "right", source: 0 as never }
  },
  category: "seating",
  layer: "furniture",
  placementSurface: "floor",
  width: 0.3,
  height: 0.24,
  footprint: { width: 0.25, height: 0.12 },
  placementFootprint: { width: 0.19, height: 0.07 },
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

function createScene(item: FurnitureItem, rotation = "right") {
  return resolveRoomV2Scene({
    roomShellCatalog: [TEST_SHELL],
    furnitureCatalog: [item],
    decor: {
      roomShellId: TEST_SHELL.id,
      placedItems: [{
        instanceId: "placed-seat",
        itemId: item.id,
        x: 0.5,
        y: 0.72,
        rotation: rotation as "front" | "back" | "left" | "right"
      }]
    }
  })
}

test("V3 seating exposes one rotated hotspot with approach and exit per declared seat", () => {
  const hotspots = createRoomWorldHotspotsFromRoomV2Scene(
    createScene(V3_LOVESEAT)
  )

  assert.deepEqual(hotspots, [
    {
      id: "placed-seat:left",
      seatId: "left",
      kind: "seat",
      x: 0.56,
      y: 0.6672,
      facing: "right",
      seatHeight: 0.09,
      renderDepth: 0.722,
      approachPoint: { x: 0.434, y: 0.6672 },
      exitPoint: { x: 0.416, y: 0.6408 },
      sourceRenderId: "placed-seat"
    },
    {
      id: "placed-seat:right",
      seatId: "right",
      kind: "seat",
      x: 0.56,
      y: 0.7728,
      facing: "right",
      seatHeight: 0.09,
      renderDepth: 0.722,
      approachPoint: { x: 0.434, y: 0.7728 },
      exitPoint: { x: 0.416, y: 0.7992 },
      sourceRenderId: "placed-seat"
    }
  ])
})

test("avatar movement keeps the physical furniture blocker instead of the tighter arrangement base", () => {
  const geometry = createRoomWorldGeometryFromRoomV2Scene(createScene(V3_LOVESEAT))

  assert.deepEqual(geometry.blockers, [{
    id: "placed-seat",
    x: 0.5,
    y: 0.72,
    width: 0.25,
    height: 0.12,
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true
  }])
})

test("V3 seating fails closed when capacity and declared seats disagree", () => {
  const invalidSeats: FurnitureItem = {
    ...V3_LOVESEAT,
    id: "room_v3_invalid_seat",
    seatSpec: {
      capacity: 2,
      seatPoints: [V3_LOVESEAT.seatSpec!.seatPoints[0]]
    }
  }

  assert.deepEqual(
    createRoomWorldHotspotsFromRoomV2Scene(createScene(invalidSeats)),
    []
  )
})
