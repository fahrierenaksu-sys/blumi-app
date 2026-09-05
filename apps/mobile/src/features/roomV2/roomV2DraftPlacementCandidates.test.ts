import assert from "node:assert/strict"
import test from "node:test"
import type {
  FurnitureItem,
  ResolvedRoomV2Scene,
  RoomV2FurnitureRenderItem
} from "./roomV2.types"
import { getRoomV2DraftPlacementCandidates } from "./roomV2DraftPlacementCandidates"

const asset = { key: "asset", source: 1 }

function createScene(renderItems: RoomV2FurnitureRenderItem[]): ResolvedRoomV2Scene {
  return {
    shell: {
      id: "shell",
      name: "Shell",
      asset,
      canvasSize: { width: 1254, height: 714 },
      surfacePlacementAreas: {
        wall: { minX: 0.2, maxX: 0.8, minY: 0.16, maxY: 0.5 },
        ceiling: { minX: 0.15, maxX: 0.85, minY: 0.04, maxY: 0.18 }
      }
    },
    renderItems
  }
}

function support(): RoomV2FurnitureRenderItem {
  return {
    renderId: "desk",
    kind: "furniture",
    itemId: "desk",
    name: "Desk",
    category: "table",
    layer: "furniture",
    asset,
    rotation: "front",
    usesMirroredRotation: false,
    x: 0.5,
    y: 0.72,
    width: 0.3,
    height: 0.25,
    anchor: { x: 0.5, y: 1 },
    depth: 0.72,
    blocksMovement: true,
    interactionType: "decor",
    placementSurface: "floor",
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.08, maxX: 0.92, minY: 0.12, maxY: 0.2 }
    }]
  }
}

test("tabletop draft candidate uses the support's front contact line", () => {
  const item: FurnitureItem = {
    id: "table-lamp",
    name: "Table Lamp",
    asset,
    category: "lighting",
    layer: "furniture",
    placementSurface: "tabletop",
    width: 0.06,
    height: 0.08,
    anchor: { x: 0.5, y: 1 }
  }

  const candidates = getRoomV2DraftPlacementCandidates(item, createScene([support()]))

  assert.deepEqual(candidates[0], { x: 0.5, y: 0.52 })
})

test("tabletop draft candidates ignore tabletop metadata on wall and ceiling items", () => {
  const nonFloorSupport = {
    ...support(),
    renderId: "wall-shelf",
    itemId: "wall-shelf",
    placementSurface: "wall" as const
  }
  const item: FurnitureItem = {
    id: "table-lamp",
    name: "Table Lamp",
    asset,
    category: "lighting",
    layer: "furniture",
    placementSurface: "tabletop",
    width: 0.06,
    height: 0.08,
    anchor: { x: 0.5, y: 1 }
  }

  const candidates = getRoomV2DraftPlacementCandidates(
    item,
    createScene([nonFloorSupport])
  )

  assert.deepEqual(candidates[0], { x: 0.32, y: 0.56 })
})

test("wall and ceiling draft candidates remain inside their dedicated regions", () => {
  const wallItem: FurnitureItem = {
    id: "clock",
    name: "Clock",
    asset,
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    width: 0.1,
    height: 0.1,
    anchor: { x: 0.5, y: 0.5 }
  }
  const ceilingItem = { ...wallItem, id: "light", placementSurface: "ceiling" as const }

  assert.deepEqual(getRoomV2DraftPlacementCandidates(wallItem, createScene([]))[0], {
    x: 0.32,
    y: 0.33
  })
  assert.deepEqual(getRoomV2DraftPlacementCandidates(ceilingItem, createScene([]))[0], {
    x: 0.68,
    y: 0.11
  })
})

test("ceiling fixtures start in the clear right bay instead of the editor feedback overlay", () => {
  const ceilingItem: FurnitureItem = {
    id: "ceiling-light",
    name: "Ceiling light",
    asset,
    category: "wallDecor",
    layer: "wall",
    placementSurface: "ceiling",
    width: 0.1,
    height: 0.1,
    anchor: { x: 0.5, y: 0.5 }
  }

  const [first, second] = getRoomV2DraftPlacementCandidates(ceilingItem, createScene([]))
  assert.deepEqual(first, { x: 0.68, y: 0.11 })
  assert.deepEqual(second, { x: 0.32, y: 0.11 })
})

test("wall and ceiling candidates follow the selected shell surface regions", () => {
  const item: FurnitureItem = {
    id: "clock",
    name: "Clock",
    asset,
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    width: 0.1,
    height: 0.1,
    anchor: { x: 0.5, y: 0.5 }
  }
  const scene = createScene([])
  scene.shell = {
    ...scene.shell!,
    surfacePlacementAreas: {
      wall: { minX: 0.32, maxX: 0.68, minY: 0.24, maxY: 0.44 },
      ceiling: { minX: 0.26, maxX: 0.74, minY: 0.08, maxY: 0.16 }
    }
  }

  assert.deepEqual(getRoomV2DraftPlacementCandidates(item, scene).slice(0, 3), [
    { x: 0.39, y: 0.34 },
    { x: 0.61, y: 0.34 },
    { x: 0.5, y: 0.34 }
  ])
})

test("wall draft candidates prefer the safe side of a baked opening", () => {
  const item: FurnitureItem = {
    id: "safe-wall-item",
    name: "Safe Wall Item",
    asset: { key: "safe-wall-item", source: 1 },
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    width: 0.12,
    height: 0.12,
    anchor: { x: 0.5, y: 0.5 }
  }
  const scene = createScene([])
  scene.shell = {
    ...scene.shell!,
    surfacePlacementExclusions: {
      wall: [{ minX: 0.33, maxX: 0.43, minY: 0.2, maxY: 0.46 }]
    }
  }
  const candidates = getRoomV2DraftPlacementCandidates(item, scene)
  assert.ok(candidates[0].x < 0.33)
  assert.ok(candidates[0].x + item.width * item.anchor!.x <= 0.33)
})

test("tall wall items are vertically fitted to the calibrated wall region", () => {
  const item: FurnitureItem = {
    id: "tall-mirror",
    name: "Tall Mirror",
    asset,
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    width: 0.31,
    height: 0.31,
    anchor: { x: 0.5, y: 0.87 }
  }
  const scene = createScene([])
  scene.shell = {
    ...scene.shell!,
    surfacePlacementAreas: {
      wall: { minX: 0.18, maxX: 0.8, minY: 0.08, maxY: 0.56 }
    }
  }

  const candidate = getRoomV2DraftPlacementCandidates(item, scene)[0]
  const top = candidate.y - item.height * item.anchor!.y
  const bottom = candidate.y + item.height * (1 - item.anchor!.y)

  assert.ok(top >= 0.08)
  assert.ok(bottom <= 0.56)
})
