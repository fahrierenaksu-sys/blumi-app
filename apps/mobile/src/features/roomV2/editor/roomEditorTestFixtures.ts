import type {
  FurnitureItem,
  PlacedRoomItem,
  RoomShell,
  RoomV2FurnitureRenderItem
} from "../roomV2.types"

/** Shared fixtures for the room editor model tests (geometry of the live shell). */
export const TEST_ASSET = { key: "asset", source: 0 as never }

export const TEST_EDITOR_SHELL: RoomShell = {
  id: "editor-test-shell",
  name: "Editor Test Shell",
  asset: TEST_ASSET,
  canvasSize: { width: 1254, height: 714 },
  placeableArea: { minX: 0.22, maxX: 0.78, minY: 0.45, maxY: 0.88 },
  surfacePlacementAreas: {
    wall: { minX: 0.18, maxX: 0.76, minY: 0.08, maxY: 0.56 },
    ceiling: { minX: 0.2, maxX: 0.8, minY: 0.04, maxY: 0.18 }
  },
  walkablePolygon: [
    { x: 0.48, y: 0.42 },
    { x: 0.8, y: 0.55 },
    { x: 0.83, y: 0.72 },
    { x: 0.7, y: 0.9 },
    { x: 0.3, y: 0.9 },
    { x: 0.17, y: 0.72 },
    { x: 0.2, y: 0.55 }
  ]
}

export function createTestFurniture(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: "chair",
    name: "Cloud Chair",
    asset: { key: "chair/front", source: 1 as never },
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.08,
    height: 0.12,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.06, height: 0.03 },
    blocksMovement: true,
    interactionType: "decor",
    ...overrides
  }
}

export function createTestPlaced(overrides: Partial<PlacedRoomItem> = {}): PlacedRoomItem {
  return {
    instanceId: "chair_1",
    itemId: "chair",
    x: 0.3,
    y: 0.8,
    rotation: "front",
    ...overrides
  }
}

export function createTestRenderItem(
  overrides: Partial<RoomV2FurnitureRenderItem> = {}
): RoomV2FurnitureRenderItem {
  return {
    renderId: "chair_1",
    kind: "furniture",
    itemId: "chair",
    name: "Cloud Chair",
    category: "seating",
    layer: "furniture",
    asset: { key: "chair/front", source: 1 as never },
    rotation: "front",
    usesMirroredRotation: false,
    x: 0.3,
    y: 0.8,
    width: 0.08,
    height: 0.12,
    anchor: { x: 0.5, y: 1 },
    depth: 0.8,
    blocksMovement: true,
    interactionType: "decor",
    placementSurface: "floor",
    ...overrides
  }
}
