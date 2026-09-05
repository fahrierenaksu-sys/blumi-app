import assert from "node:assert/strict"
import test from "node:test"
import type {
  FurnitureItem,
  ResolvedRoomV2Scene,
  RoomV2FurnitureRenderItem
} from "./roomV2.types"
import {
  getRoomV2FurniturePlacementSurface,
  validateRoomV2FurnitureSurfacePlacement
} from "./roomV2PlacementSurface"

function createScene(
  renderItems: ResolvedRoomV2Scene["renderItems"] = []
): ResolvedRoomV2Scene {
  return {
    shell: {
      id: "shell",
      name: "Shell",
      asset: { key: "shell", source: 1 },
      canvasSize: { width: 1254, height: 714 },
      placeableArea: { minX: 0.2, maxX: 0.8, minY: 0.45, maxY: 0.9 },
      surfacePlacementAreas: {
        wall: { minX: 0.2, maxX: 0.8, minY: 0.16, maxY: 0.5 },
        ceiling: { minX: 0.15, maxX: 0.85, minY: 0.04, maxY: 0.18 }
      }
    },
    renderItems
  }
}

function createCandidate(
  overrides: Partial<RoomV2FurnitureRenderItem> = {}
): RoomV2FurnitureRenderItem {
  return {
    renderId: "candidate",
    kind: "furniture",
    itemId: "candidate",
    name: "Candidate",
    category: "misc",
    layer: "furniture",
    asset: { key: "candidate", source: 1 },
    rotation: "front",
    usesMirroredRotation: false,
    x: 0.5,
    y: 0.35,
    width: 0.12,
    height: 0.12,
    anchor: { x: 0.5, y: 0.5 },
    depth: 0.35,
    blocksMovement: false,
    interactionType: "none",
    placementSurface: "wall",
    ...overrides
  }
}

test("surface is explicit and never inferred from a broad furniture category", () => {
  const floorStandingShelf: FurnitureItem = {
    id: "shelf",
    name: "Shelf",
    asset: { key: "shelf", source: 1 },
    category: "wallDecor",
    layer: "furniture",
    width: 0.2,
    height: 0.3
  }

  assert.equal(getRoomV2FurniturePlacementSurface(floorStandingShelf), "floor")
  assert.equal(
    getRoomV2FurniturePlacementSurface({ ...floorStandingShelf, placementSurface: "wall" }),
    "wall"
  )
})

test("wall items must stay inside the room wall placement region", () => {
  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: createCandidate()
  })
  assert.deepEqual(valid, {
    isValid: true,
    issueIds: [],
    supportingRenderIds: []
  })

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: createCandidate({ y: 0.64 })
  })
  assert.equal(invalid.isValid, false)
  assert.deepEqual(invalid.issueIds, ["invalid_placement_surface"])
})

test("wall items cannot overlap a baked shell opening", () => {
  const scene = createScene()
  scene.shell = {
    ...scene.shell!,
    surfacePlacementExclusions: {
      wall: [{ minX: 0.44, maxX: 0.56, minY: 0.2, maxY: 0.46 }]
    }
  }

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene,
    candidate: createCandidate()
  })

  assert.deepEqual(invalid, {
    isValid: false,
    issueIds: ["invalid_placement_surface"],
    supportingRenderIds: []
  })
})

test("opening-bound wall items require and overlap a declared shell opening", () => {
  const openingScene = createScene()
  openingScene.shell = {
    ...openingScene.shell!,
    surfacePlacementExclusions: {
      wall: [{ minX: 0.44, maxX: 0.56, minY: 0.2, maxY: 0.46 }]
    }
  }

  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: openingScene,
    candidate: createCandidate({ surfacePlacementPolicy: "opening" })
  })
  assert.equal(valid.isValid, true)

  const outsideOpening = validateRoomV2FurnitureSurfacePlacement({
    scene: openingScene,
    candidate: createCandidate({ surfacePlacementPolicy: "opening", x: 0.3 })
  })
  assert.equal(outsideOpening.isValid, false)

  const missingOpening = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: createCandidate({ surfacePlacementPolicy: "opening" })
  })
  assert.deepEqual(missingOpening.issueIds, ["invalid_placement_surface"])
})

test("ceiling items must stay inside the room ceiling placement region", () => {
  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: createCandidate({
      placementSurface: "ceiling",
      y: 0.11
    })
  })
  assert.deepEqual(valid, {
    isValid: true,
    issueIds: [],
    supportingRenderIds: []
  })

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: createCandidate({
      placementSurface: "ceiling",
      y: 0.3
    })
  })
  assert.equal(invalid.isValid, false)
  assert.deepEqual(invalid.issueIds, ["invalid_placement_surface"])
})

test("ceiling validation uses the physical placement polygon instead of transparent sprite padding", () => {
  const candidate = createCandidate({
    placementSurface: "ceiling",
    // The upright sprite canvas is intentionally taller than the visible
    // fixture. Its physical footprint still fits the ceiling region.
    y: 0.12,
    width: 0.1721,
    height: 0.1721,
    anchor: { x: 0.5064, y: 0.5577 },
    placementPolygon: [
      { x: 0.26, y: 0.086 },
      { x: 0.42, y: 0.086 },
      { x: 0.42, y: 0.154 },
      { x: 0.26, y: 0.154 }
    ]
  })

  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate
  })
  assert.equal(valid.isValid, true)

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene(),
    candidate: {
      ...candidate,
      placementPolygon: candidate.placementPolygon!.map((point) => ({
        ...point,
        y: point.y + 0.12
      }))
    }
  })
  assert.equal(invalid.isValid, false)
  assert.deepEqual(invalid.issueIds, ["invalid_placement_surface"])
})

test("tabletop items require a supporting tabletop surface and fit inside it", () => {
  const support: RoomV2FurnitureRenderItem = createCandidate({
    renderId: "desk",
    itemId: "desk",
    name: "Desk",
    category: "table",
    x: 0.5,
    y: 0.72,
    width: 0.3,
    height: 0.25,
    anchor: { x: 0.5, y: 1 },
    placementSurface: "floor",
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.08, maxX: 0.92, minY: 0.12, maxY: 0.2 }
    }]
  })

  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene([support]),
    candidate: createCandidate({
      placementSurface: "tabletop",
      rotation: "left",
      x: 0.5,
      y: 0.52,
      width: 0.06,
      height: 0.08,
      anchor: { x: 0.5, y: 1 },
      footprint: { width: 0.05, height: 0.02 }
    })
  })
  assert.equal(valid.isValid, true)
  assert.deepEqual(valid.supportingRenderIds, ["desk"])

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene([support]),
    candidate: createCandidate({
      placementSurface: "tabletop",
      x: 0.2,
      y: 0.53,
      width: 0.06,
      height: 0.08,
      anchor: { x: 0.5, y: 1 },
      footprint: { width: 0.05, height: 0.02 }
    })
  })
  assert.equal(invalid.isValid, false)
  assert.deepEqual(invalid.issueIds, ["missing_support_surface"])
})

test("tabletop support bounds follow the supporting furniture rotation", () => {
  const support: RoomV2FurnitureRenderItem = createCandidate({
    renderId: "rotating-desk",
    itemId: "rotating-desk",
    category: "table",
    x: 0.5,
    y: 0.72,
    width: 0.3,
    height: 0.25,
    anchor: { x: 0.5, y: 1 },
    rotation: "left",
    placementSurface: "floor",
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.08, maxX: 0.92, minY: 0.12, maxY: 0.2 },
      localBoundsByRotation: {
        left: { minX: 0.4, maxX: 0.6, minY: 0.12, maxY: 0.2 }
      }
    }]
  })

  const valid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene([support]),
    candidate: createCandidate({
      placementSurface: "tabletop",
      rotation: "left",
      x: 0.5,
      y: 0.52,
      width: 0.03,
      height: 0.08,
      anchor: { x: 0.5, y: 1 },
      footprint: { width: 0.02, height: 0.02 }
    })
  })
  assert.equal(valid.isValid, true)

  const invalid = validateRoomV2FurnitureSurfacePlacement({
    scene: createScene([support]),
    candidate: createCandidate({
      placementSurface: "tabletop",
      rotation: "left",
      x: 0.55,
      y: 0.52,
      width: 0.03,
      height: 0.08,
      anchor: { x: 0.5, y: 1 },
      footprint: { width: 0.02, height: 0.02 }
    })
  })
  assert.equal(invalid.isValid, false)
  assert.deepEqual(invalid.issueIds, ["missing_support_surface"])
})
