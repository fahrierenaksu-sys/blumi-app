import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomV2AvatarRenderItem,
  insertRoomV2RenderItemSorted,
  normalizeRoomInventorySearchText,
  resolveRoomV2Scene,
  resolvePlacedFurnitureRenderItem,
  upsertRoomV2RenderItemSorted,
  validateRoomV2FurniturePlacement,
  validateRoomV2DraftPlacements
} from "./roomV2Selectors"
import type {
  FurnitureItem,
  RoomV2AvatarRenderLayer,
  RoomV2FurnitureRenderItem,
  RoomV2RenderItem,
  RoomFurnitureVisualContract
} from "./roomV2.types"

const TEST_AVATAR_LAYER: RoomV2AvatarRenderLayer = {
  id: "avatar-base",
  type: "base",
  layerOrder: 0,
  asset: {
    key: "avatar/base",
    source: 0 as never
  }
}

test("normalizeRoomInventorySearchText makes punctuation-safe inventory queries", () => {
  assert.equal(
    normalizeRoomInventorySearchText("Soft-Neutral Dresser"),
    "soft neutral dresser"
  )
  assert.equal(
    normalizeRoomInventorySearchText("  Full—Length   Mirror "),
    "full length mirror"
  )
  assert.equal(
    normalizeRoomInventorySearchText("CLOUD_ACCENT.CHAIR"),
    "cloud accent chair"
  )
})

function createFurnitureItem(input: {
  renderId: string
  x: number
  y: number
  depth?: number
  layer?: RoomV2FurnitureRenderItem["layer"]
}): RoomV2FurnitureRenderItem {
  return {
    renderId: input.renderId,
    kind: "furniture",
    itemId: `${input.renderId}-item`,
    name: input.renderId,
    category: "table",
    layer: input.layer ?? "furniture",
    asset: {
      key: `asset/${input.renderId}`,
      source: 0 as never
    },
    rotation: "front",
    usesMirroredRotation: false,
    x: input.x,
    y: input.y,
    width: 0.2,
    height: 0.2,
    anchor: { x: 0.5, y: 1 },
    depth: input.depth ?? input.y,
    blocksMovement: true,
    interactionType: "decor"
  }
}

function createAvatarItem(input: {
  renderId: string
  x: number
  y: number
  depth?: number
}): RoomV2RenderItem {
  return createRoomV2AvatarRenderItem({
    avatarId: input.renderId,
    renderId: input.renderId,
    layers: [TEST_AVATAR_LAYER],
    x: input.x,
    y: input.y,
    width: 0.2,
    height: 0.3,
    depth: input.depth ?? input.y
  })
}

test("insertRoomV2RenderItemSorted keeps ordering without mutating the base list", () => {
  const baseItems = [
    createFurnitureItem({ renderId: "chair-back", x: 0.3, y: 0.4 }),
    createFurnitureItem({ renderId: "chair-front", x: 0.3, y: 0.8 })
  ]

  const inserted = insertRoomV2RenderItemSorted(
    baseItems,
    createAvatarItem({ renderId: "avatar-mid", x: 0.4, y: 0.6 })
  )

  assert.deepEqual(
    inserted.map((item) => item.renderId),
    ["chair-back", "avatar-mid", "chair-front"]
  )
  assert.deepEqual(
    baseItems.map((item) => item.renderId),
    ["chair-back", "chair-front"]
  )
  assert.notEqual(inserted, baseItems)
})

test("insertRoomV2RenderItemSorted respects layer priority before depth", () => {
  const baseItems = [
    createFurnitureItem({
      renderId: "wall-lamp",
      x: 0.5,
      y: 0.3,
      layer: "wall",
      depth: 0.3
    }),
    createFurnitureItem({
      renderId: "floor-chair",
      x: 0.5,
      y: 0.75,
      layer: "furniture",
      depth: 0.75
    })
  ]

  const inserted = insertRoomV2RenderItemSorted(
    baseItems,
    createAvatarItem({ renderId: "avatar-floor", x: 0.5, y: 0.55 })
  )

  assert.deepEqual(
    inserted.map((item) => item.renderId),
    ["wall-lamp", "avatar-floor", "floor-chair"]
  )
})

test("upsertRoomV2RenderItemSorted replaces an existing item and re-sorts it", () => {
  const baseItems = [
    createFurnitureItem({ renderId: "chair-back", x: 0.3, y: 0.4 }),
    createFurnitureItem({ renderId: "chair-front", x: 0.3, y: 0.8 })
  ]

  const updated = upsertRoomV2RenderItemSorted(
    baseItems,
    createFurnitureItem({ renderId: "chair-back", x: 0.3, y: 0.9 })
  )

  assert.deepEqual(
    updated.map((item) => `${item.renderId}:${item.depth}`),
    ["chair-front:0.8", "chair-back:0.9"]
  )
  assert.deepEqual(
    baseItems.map((item) => `${item.renderId}:${item.depth}`),
    ["chair-back:0.4", "chair-front:0.8"]
  )
})

test("resolvePlacedFurnitureRenderItem uses the selected rotation footprint", () => {
  const item: FurnitureItem = {
    id: "rotation-aware-console",
    name: "Rotation Aware Console",
    asset: { key: "front", source: 0 as never },
    assetsByRotation: {
      front: { key: "front", source: 0 as never },
      right: { key: "right", source: 0 as never }
    },
    category: "table",
    layer: "furniture",
    width: 0.24,
    height: 0.2,
    footprint: { width: 0.21, height: 0.09 },
    footprintByRotation: {
      front: { width: 0.21, height: 0.09 },
      right: { width: 0.1, height: 0.23 }
    },
    blocksMovement: true
  }

  const resolved = resolvePlacedFurnitureRenderItem({
    instanceId: "placed-console",
    itemId: item.id,
    x: 0.5,
    y: 0.68,
    rotation: "right"
  }, item)

  assert.ok(resolved)
  assert.equal(resolved.kind, "furniture")
  assert.deepEqual(resolved.footprint, { width: 0.1, height: 0.23 })
  assert.equal(resolved.asset.key, "right")
  assert.equal(resolved.usesMirroredRotation, false)
})

test("furniture placement uses its tight contact base while movement keeps the physical footprint", () => {
  const item: FurnitureItem = {
    id: "close-grouping-coffee-table",
    name: "Close Grouping Coffee Table",
    asset: { key: "front", source: 0 as never },
    category: "table",
    layer: "furniture",
    width: 0.24,
    height: 0.16,
    footprint: { width: 0.18, height: 0.1 },
    placementFootprint: { width: 0.13, height: 0.058 },
    blocksMovement: true
  }

  const resolved = resolvePlacedFurnitureRenderItem({
    instanceId: "close-grouping-table",
    itemId: item.id,
    x: 0.5,
    y: 0.72,
    rotation: "front"
  }, item)

  assert.deepEqual(resolved?.footprint, { width: 0.18, height: 0.1 })
  assert.deepEqual(resolved?.placementFootprint, { width: 0.13, height: 0.058 })
})

test("seat routes use the same canonical dimensions as rendered furniture", () => {
  const item: FurnitureItem = {
    id: "scaled-seat",
    name: "Scaled Seat",
    asset: { key: "front", source: 0 as never },
    category: "seating",
    layer: "furniture",
    width: 0.2,
    height: 0.2,
    interactionType: "seat",
    seatSpec: {
      capacity: 1,
      seatPoints: [{
        id: "primary",
        x: 0,
        y: -0.2,
        seatHeight: 0.09,
        facing: "front",
        approachPoint: { x: 0, y: 0.2 },
        exitPoint: { x: 0, y: 0.3 }
      }]
    }
  }

  const resolved = resolvePlacedFurnitureRenderItem({
    instanceId: "scaled-seat-instance",
    itemId: item.id,
    x: 0.5,
    y: 0.7,
    rotation: "front"
  }, item)

  assert.deepEqual(resolved?.seatWorldPoints, [{
    id: "primary",
    facing: "front",
    seatHeight: 0.09,
    seat: { x: 0.5, y: 0.66 },
    approach: { x: 0.5, y: 0.74 },
    exit: { x: 0.5, y: 0.76 }
  }])
})

test("resolvePlacedFurnitureRenderItem uses a directional anchor when declared", () => {
  const item: FurnitureItem = {
    id: "directional-wall-clock",
    name: "Directional Wall Clock",
    asset: { key: "front", source: 0 as never },
    assetsByRotation: {
      front: { key: "front", source: 0 as never },
      right: { key: "right", source: 0 as never }
    },
    rotationPolicy: "directional_assets_required",
    anchor: { x: 0.5, y: 0.5 },
    anchorByRotation: { right: { x: 0.62, y: 0.48 } },
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    width: 0.12,
    height: 0.12
  }

  const resolved = resolvePlacedFurnitureRenderItem({
    instanceId: "placed-clock",
    itemId: item.id,
    x: 0.62,
    y: 0.32,
    rotation: "right"
  }, item)

  assert.ok(resolved)
  assert.deepEqual(resolved.anchor, { x: 0.62, y: 0.48 })
})

test("resolvePlacedFurnitureRenderItem mirrors only legacy rotations without a real directional asset", () => {
  const item: FurnitureItem = {
    id: "legacy-chair",
    name: "Legacy Chair",
    asset: { key: "front", source: 0 as never },
    category: "seating",
    layer: "furniture",
    width: 0.15,
    height: 0.29
  }

  const resolved = resolvePlacedFurnitureRenderItem({
    instanceId: "legacy-chair-left",
    itemId: item.id,
    x: 0.5,
    y: 0.72,
    rotation: "left"
  }, item)

  assert.ok(resolved)
  assert.equal(resolved.kind, "furniture")
  assert.equal(resolved.usesMirroredRotation, true)
})

test("directional production furniture fails closed when a requested rotation is missing", () => {
  const item: FurnitureItem = {
    id: "strict-direction-chair",
    name: "Strict Direction Chair",
    asset: { key: "front", source: 0 as never },
    assetsByRotation: {
      front: { key: "front", source: 0 as never },
      right: { key: "right", source: 0 as never }
    },
    rotationPolicy: "directional_assets_required",
    category: "seating",
    layer: "furniture",
    width: 0.15,
    height: 0.29
  }
  const placed = {
    instanceId: "strict-chair-left",
    itemId: item.id,
    x: 0.5,
    y: 0.72,
    rotation: "left" as const
  }

  assert.equal(resolvePlacedFurnitureRenderItem(placed, item), null)
  assert.deepEqual(resolveRoomV2Scene({
    roomShellCatalog: [{
      id: "test-shell",
      name: "Test Shell",
      asset: { key: "shell", source: 0 as never },
      canvasSize: { width: 1254, height: 714 }
    }],
    furnitureCatalog: [item],
    decor: { roomShellId: "test-shell", placedItems: [placed] }
  }).renderItems, [])
})

test("draft validation rejects unresolved rotations before raw decor can be saved", () => {
  const item: FurnitureItem = {
    id: "strict-direction-chair",
    name: "Strict Direction Chair",
    asset: { key: "front", source: 0 as never },
    assetsByRotation: {
      front: { key: "front", source: 0 as never },
      right: { key: "right", source: 0 as never }
    },
    rotationPolicy: "directional_assets_required",
    category: "seating",
    layer: "furniture",
    width: 0.15,
    height: 0.29
  }
  const placed = {
    instanceId: "strict-chair-left",
    itemId: item.id,
    x: 0.5,
    y: 0.72,
    rotation: "left" as const
  }
  const decor = { roomShellId: "test-shell", placedItems: [placed] }
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [{
      id: "test-shell",
      name: "Test Shell",
      asset: { key: "shell", source: 0 as never },
      canvasSize: { width: 1254, height: 714 }
    }],
    furnitureCatalog: [item],
    decor
  })

  const validation = validateRoomV2DraftPlacements({
    scene,
    decor,
    furnitureCatalog: [item]
  })

  assert.equal(validation.isValid, false)
  assert.deepEqual(validation.invalidItems.map((entry) => entry.issueIds), [
    ["unresolved_furniture_asset"]
  ])
})

test("floor placement rejects a blocking item outside the walkable room polygon", () => {
  const candidate = createFurnitureItem({
    renderId: "floor-table",
    x: 0.12,
    y: 0.62
  })
  const scene = {
    shell: {
      id: "floor-shell",
      name: "Floor Shell",
      asset: { key: "shell", source: 0 as never },
      canvasSize: { width: 1254, height: 714 },
      walkablePolygon: [
        { x: 0.2, y: 0.4 },
        { x: 0.8, y: 0.4 },
        { x: 0.8, y: 0.9 },
        { x: 0.2, y: 0.9 }
      ]
    },
    renderItems: []
  }

  const validation = validateRoomV2FurniturePlacement({
    scene,
    candidate
  })

  assert.equal(validation.isValid, false)
  assert.deepEqual(validation.issueIds, ["outside_placeable_area"])
})

test("floor placement uses the calibrated physical polygon instead of a false rectangular collision", () => {
  const candidate = {
    ...createFurnitureItem({ renderId: "diamond-a", x: 0.5, y: 0.5 }),
    collisionPolygon: [
      { x: 0.3, y: 0.5 },
      { x: 0.5, y: 0.3 },
      { x: 0.7, y: 0.5 },
      { x: 0.5, y: 0.7 }
    ],
    placementPolygon: [
      { x: 0.3, y: 0.5 },
      { x: 0.5, y: 0.3 },
      { x: 0.7, y: 0.5 },
      { x: 0.5, y: 0.7 }
    ]
  }
  const distantBlocker = {
    ...createFurnitureItem({ renderId: "diamond-b", x: 0.5, y: 0.5 }),
    collisionPolygon: [
      { x: 0.8, y: 0.5 },
      { x: 1, y: 0.3 },
      { x: 1.2, y: 0.5 },
      { x: 1, y: 0.7 }
    ],
    placementPolygon: [
      { x: 0.8, y: 0.5 },
      { x: 1, y: 0.3 },
      { x: 1.2, y: 0.5 },
      { x: 1, y: 0.7 }
    ]
  }
  const validation = validateRoomV2FurniturePlacement({
    scene: {
      shell: {
        id: "polygon-shell",
        name: "Polygon Shell",
        asset: { key: "shell", source: 0 as never },
        canvasSize: { width: 1254, height: 714 },
        walkablePolygon: [
          { x: 0, y: 0 },
          { x: 1.25, y: 0 },
          { x: 1.25, y: 1 },
          { x: 0, y: 1 }
        ]
      },
      renderItems: [distantBlocker]
    },
    candidate
  })

  assert.equal(validation.isValid, true)
  assert.deepEqual(validation.blockingRenderIds, [])
})

test("VNext physical polygons rotate around a stable world floor pivot", () => {
  const directionalVisual = {
    bodyAsset: { key: "body", source: 0 as never },
    normalizedRenderSize: { width: 0.2, height: 0.2 },
    normalizedFloorPivot: { x: 0.5, y: 1 }
  }
  const visualContract: RoomFurnitureVisualContract = {
    schemaVersion: "room-furniture-visual-vnext-1",
    skuId: "room_vnext_polygon_test",
    assetSetId: "polygon-test-v1",
    assetVersion: 1,
    perspectiveProfile: "my-room-locked-2.5d-v1",
    viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA",
    assetCameraRigId: "test-camera",
    cameraRigVersion: "test-camera-v1",
    lightRigVersion: "test-light-v1",
    materialLibraryVersion: "test-material-v1",
    physicalSizeCm: { width: 40, depth: 20, height: 30 },
    renderClass: "upright",
    placementSurface: "floor",
    directions: {
      front: directionalVisual,
      right: directionalVisual,
      back: directionalVisual,
      left: directionalVisual
    },
    footprintLocalCm: [
      { x: -20, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: -20, y: 10 }
    ],
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: false
  }
  const front = resolvePlacedFurnitureRenderItem({
    instanceId: "polygon-front",
    itemId: visualContract.skuId,
    x: 0.5,
    y: 0.7,
    rotation: "front"
  }, {
    id: visualContract.skuId,
    name: "Polygon Test",
    asset: directionalVisual.bodyAsset,
    category: "misc",
    layer: "furniture",
    width: 0.2,
    height: 0.2,
    visualContract
  })
  const right = resolvePlacedFurnitureRenderItem({
    instanceId: "polygon-right",
    itemId: visualContract.skuId,
    x: 0.5,
    y: 0.7,
    rotation: "right"
  }, {
    id: visualContract.skuId,
    name: "Polygon Test",
    asset: directionalVisual.bodyAsset,
    category: "misc",
    layer: "furniture",
    width: 0.2,
    height: 0.2,
    visualContract
  })

  assert.ok(front?.collisionPolygon)
  assert.ok(right?.collisionPolygon)
  assert.deepEqual(front?.collisionPolygon?.map((point) => point.x), [
    0.5 - 20 * (0.3 / 170),
    0.5 + 20 * (0.3 / 170),
    0.5 + 20 * (0.3 / 170),
    0.5 - 20 * (0.3 / 170)
  ])
  assert.notDeepEqual(right?.collisionPolygon, front?.collisionPolygon)
  assert.equal(right?.x, 0.5)
  assert.equal(right?.y, 0.7)
})

test("parent movement and rotation carry a persisted tabletop child", () => {
  const parent: FurnitureItem = {
    id: "parent-table",
    name: "Parent Table",
    asset: { key: "table", source: 0 as never },
    category: "table",
    layer: "furniture",
    width: 0.2,
    height: 0.2,
    anchor: { x: 0.5, y: 1 },
    blocksMovement: true
  }
  const child: FurnitureItem = {
    id: "child-plant",
    name: "Child Plant",
    asset: { key: "plant", source: 0 as never },
    category: "plant",
    layer: "furniture",
    width: 0.05,
    height: 0.08,
    placementSurface: "tabletop",
    blocksMovement: false
  }
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [{
      id: "support-shell",
      name: "Support Shell",
      asset: { key: "shell", source: 0 as never },
      canvasSize: { width: 1254, height: 714 }
    }],
    furnitureCatalog: [parent, child],
    decor: {
      roomShellId: "support-shell",
      placedItems: [
        {
          instanceId: "table-1",
          itemId: parent.id,
          x: 0.6,
          y: 0.7,
          rotation: "right"
        },
        {
          instanceId: "plant-1",
          itemId: child.id,
          x: 0.1,
          y: 0.1,
          rotation: "front",
          placementSurface: "tabletop",
          supportInstanceId: "table-1",
          supportParentRotation: "front",
          supportLocalPosition: { x: 0.75, y: 1 }
        }
      ]
    }
  })
  const renderedChild = scene.renderItems.find((item) => item.renderId === "plant-1")
  assert.equal(renderedChild?.x, 0.6)
  assert.equal(renderedChild?.y, 0.75)
  assert.equal(renderedChild?.depth, 0.75)
  assert.equal(renderedChild?.kind, "furniture")
})
