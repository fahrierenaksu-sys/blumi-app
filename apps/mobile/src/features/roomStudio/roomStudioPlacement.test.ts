import assert from "node:assert/strict"
import test from "node:test"
import type { PlacedRoomItem } from "../roomV2/roomV2.types"
import {
  getPlacementBounds,
  validateRoomStudioPlacement,
  type RoomStudioPlacementEnvironment,
  type RoomStudioPlacementGeometry
} from "./roomStudioPlacement"

const environment: RoomStudioPlacementEnvironment = {
  placeableArea: { minX: 0.2, maxX: 0.8, minY: 0.4, maxY: 0.9 },
  walkablePolygon: [
    { x: 0.2, y: 0.4 },
    { x: 0.8, y: 0.4 },
    { x: 0.8, y: 0.9 },
    { x: 0.2, y: 0.9 }
  ],
  surfacePlacementAreas: {
    wall: { minX: 0.2, maxX: 0.8, minY: 0.1, maxY: 0.4 }
  },
  surfacePlacementExclusions: {
    wall: [{ minX: 0.42, maxX: 0.52, minY: 0.2, maxY: 0.35 }]
  }
}

const bed: RoomStudioPlacementGeometry = {
  itemId: "bed",
  placementSurface: "floor",
  blocksMovement: true,
  footprint: { width: 0.2, height: 0.12 },
  anchor: { x: 0.5, y: 1 }
}

const chair: RoomStudioPlacementGeometry = {
  itemId: "chair",
  placementSurface: "floor",
  blocksMovement: true,
  footprint: { width: 0.12, height: 0.1 },
  anchor: { x: 0.5, y: 1 }
}

const wallArt: RoomStudioPlacementGeometry = {
  itemId: "wall-art",
  placementSurface: "wall",
  blocksMovement: false,
  footprint: { width: 0.12, height: 0.08 },
  anchor: { x: 0.5, y: 0.5 }
}

const item = (instanceId: string, itemId: string, x: number, y: number): PlacedRoomItem => ({
  instanceId,
  itemId,
  x,
  y,
  rotation: "front",
  placementSurface: itemId === "wall-art" ? "wall" : "floor"
})

test("placement uses the physical footprint instead of the transparent render canvas", () => {
  const bounds = getPlacementBounds(item("bed-1", "bed", 0.4, 0.6), bed)
  assert.ok(Math.abs(bounds.minX - 0.3) < 1e-9)
  assert.deepEqual(
    { maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY },
    { maxX: 0.5, minY: 0.48, maxY: 0.6 }
  )
  assert.equal(validateRoomStudioPlacement({
    item: item("bed-1", "bed", 0.4, 0.6),
    geometry: bed,
    otherItems: [],
    geometryByItemId: new Map([["bed", bed]]),
    environment
  }).isValid, true)
})

test("floor placement accepts a real corner only while all physical corners remain in the shell", () => {
  const valid = item("bed-1", "bed", 0.31, 0.84)
  const invalid = item("bed-1", "bed", 0.26, 0.84)
  const geometries = new Map([["bed", bed]])
  assert.equal(validateRoomStudioPlacement({
    item: valid,
    geometry: bed,
    otherItems: [],
    geometryByItemId: geometries,
    environment
  }).isValid, true)
  assert.equal(validateRoomStudioPlacement({
    item: invalid,
    geometry: bed,
    otherItems: [],
    geometryByItemId: geometries,
    environment
  }).issue, "outside_shell")
})

test("only a real blocking footprint collision is rejected", () => {
  const bedItem = item("bed-1", "bed", 0.45, 0.6)
  const chairItem = item("chair-1", "chair", 0.52, 0.6)
  const geometryByItemId = new Map([["bed", bed], ["chair", chair]])
  const result = validateRoomStudioPlacement({
    item: chairItem,
    geometry: chair,
    otherItems: [bedItem],
    geometryByItemId,
    environment
  })
  assert.deepEqual(result, { isValid: false, issue: "blocking_collision" })
})

test("wall exclusions reject only the authored opening region", () => {
  const valid = item("wall-1", "wall-art", 0.65, 0.25)
  const invalid = item("wall-1", "wall-art", 0.47, 0.25)
  const geometryByItemId = new Map([["wall-art", wallArt]])
  assert.equal(validateRoomStudioPlacement({
    item: valid,
    geometry: wallArt,
    otherItems: [],
    geometryByItemId,
    environment
  }).isValid, true)
  assert.equal(validateRoomStudioPlacement({
    item: invalid,
    geometry: wallArt,
    otherItems: [],
    geometryByItemId,
    environment
  }).issue, "surface_exclusion")
})
