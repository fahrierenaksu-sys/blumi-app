import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomV3PilotScaleSpec,
  getRoomV3PilotAvatarRenderedBox,
  validateRoomV3PilotScaleSpec
} from "./roomV3PilotScaleSpec"
import type { FurnitureItem, RoomShell } from "./roomV2.types"

// Mirrors the source-locked current Room shell metadata without importing a
// React Native require() tree into Node's unit-test process.
const SOURCE_LOCKED_SHELL: RoomShell = {
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "room_v2_shell_blumi_world_v1", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  myRoomCamera: {
    compactRendererWidth: "155%",
    regularRendererWidth: "154%",
    rendererTranslateY: 0,
    compactStageHeightRatio: 0.64,
    wideStageHeightRatio: 0.64,
    compactMinStageHeight: 430,
    wideMinStageHeight: 440,
    compactMaxStageHeight: 560,
    wideMaxStageHeight: 560
  },
  placeableArea: { minX: 0.22, maxX: 0.78, minY: 0.45, maxY: 0.88 },
  walkablePolygon: [
    { x: 0.48, y: 0.42 },
    { x: 0.8, y: 0.55 },
    { x: 0.83, y: 0.72 },
    { x: 0.7, y: 0.9 },
    { x: 0.3, y: 0.9 },
    { x: 0.17, y: 0.72 },
    { x: 0.2, y: 0.55 }
  ],
  placementLanes: [
    {
      id: "room_v2_world_lane_wall",
      label: "Wall line",
      y: 0.54,
      minX: 0.26,
      maxX: 0.74,
      snapRadius: 0.035
    },
    {
      id: "room_v2_world_lane_mid",
      label: "Middle",
      y: 0.66,
      minX: 0.24,
      maxX: 0.76,
      snapRadius: 0.045
    },
    {
      id: "room_v2_world_lane_social",
      label: "Social",
      y: 0.76,
      minX: 0.25,
      maxX: 0.75,
      snapRadius: 0.045
    },
    {
      id: "room_v2_world_lane_front",
      label: "Front",
      y: 0.86,
      minX: 0.28,
      maxX: 0.72,
      snapRadius: 0.04
    }
  ]
}

const LEGACY_CHAIR_REFERENCE: FurnitureItem = {
  id: "room_v2_chair_blush",
  name: "Blush Lounge Chair",
  asset: { key: "room_v2_furniture_world_chair_v1", source: 0 as never },
  category: "seating",
  layer: "furniture",
  width: 0.15,
  height: 0.29,
  footprint: { width: 0.13, height: 0.08 },
  blocksMovement: true,
  interactionType: "seat"
}

test("pilot scale spec stays tied to the real Room V2 shell and blocks catalog production until every required scale subject exists", () => {
  const spec = createRoomV3PilotScaleSpec({
    shell: SOURCE_LOCKED_SHELL,
    furnitureCatalog: [LEGACY_CHAIR_REFERENCE]
  })

  assert.deepEqual(spec.shell.canvasSize, { width: 1254, height: 714 })
  assert.equal(spec.shell.sourceAssetKey, "room_v2_shell_blumi_world_v1")
  assert.deepEqual(spec.shell.placeableArea, {
    minX: 0.22,
    maxX: 0.78,
    minY: 0.45,
    maxY: 0.88
  })
  assert.equal(spec.avatarRenderer.compactBox.width, 0.2)
  assert.equal(spec.avatarRenderer.compactBox.height, 0.3)
  assert.equal(spec.avatarRenderer.sitting.scaleY, 1)
  assert.equal(spec.avatarRenderer.sitting.translateYPx, 47)
  assert.deepEqual(spec.avatarSourceEnvelopes, [
    {
      id: "female_standing",
      sourceAssetPath: "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_female_v2.png",
      fitProfileId: "blumi_female_room_avatar_v1",
      alphaBounds: { minX: 76, minY: 215, maxXExclusive: 179, maxYExclusive: 343 }
    },
    {
      id: "female_sitting",
      sourceAssetPath: "apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_base_female_v2_sitting_front_f01.png",
      fitProfileId: "blumi_female_room_avatar_v1",
      alphaBounds: { minX: 66, minY: 215, maxXExclusive: 188, maxYExclusive: 342 }
    },
    {
      id: "male_standing",
      sourceAssetPath: "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_male_light_v1.png",
      fitProfileId: "blumi_male_room_avatar_v1",
      alphaBounds: { minX: 84, minY: 215, maxXExclusive: 172, maxYExclusive: 343 }
    },
    {
      id: "male_sitting",
      sourceAssetPath: "apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_base_male_light_v1_sitting_front_f01.png",
      fitProfileId: "blumi_male_room_avatar_v1",
      alphaBounds: { minX: 70, minY: 215, maxXExclusive: 186, maxYExclusive: 342 }
    }
  ])
  assert.equal(spec.movementClearance, 0.012)
  assert.equal(spec.requiredFurniture.length, 11)
  assert.deepEqual(spec.referenceItems, [{
    sourceItemId: "room_v2_chair_blush",
    renderBox: { width: 0.15, height: 0.29 },
    footprint: { width: 0.13, height: 0.08 },
    interactionType: "seat",
    status: "legacy_reference_only"
  }])
  assert.deepEqual(
    spec.requiredFurniture.map((subject) => subject.id),
    [
      "dining_chair",
      "lounge_armchair",
      "long_sofa",
      "dining_table",
      "work_desk",
      "double_bed",
      "nightstand",
      "wardrobe",
      "bookshelf",
      "floor_lamp",
      "rug"
    ]
  )
  assert.equal(spec.productionStatus, "blocked")

  const validation = validateRoomV3PilotScaleSpec(spec)
  assert.equal(validation.isReadyForCatalogProduction, false)
  assert.ok(validation.issueIds.includes("missing_required_pilot_assets"))
  assert.ok(validation.issueIds.includes("missing_measurement_evidence"))
  assert.ok(validation.issueIds.includes("missing_simulator_visual_review"))
  assert.ok(validation.issueIds.includes("missing_independent_review"))
})

test("pilot scale spec rejects a shell that drifts from the source-locked Room V2 geometry", () => {
  const shellWithDrift: RoomShell = {
    ...SOURCE_LOCKED_SHELL,
    walkablePolygon: SOURCE_LOCKED_SHELL.walkablePolygon?.map((point, index) =>
      index === 0 ? { ...point, x: point.x + 0.01 } : { ...point }
    )
  }

  const validation = validateRoomV3PilotScaleSpec(
    createRoomV3PilotScaleSpec({
      shell: shellWithDrift,
      furnitureCatalog: []
    })
  )

  assert.ok(validation.issueIds.includes("invalid_source_locked_shell"))

  const shellWithCameraDrift: RoomShell = {
    ...SOURCE_LOCKED_SHELL,
    myRoomCamera: {
      ...SOURCE_LOCKED_SHELL.myRoomCamera!,
      compactStageHeightRatio: 0.2
    }
  }
  const cameraValidation = validateRoomV3PilotScaleSpec(
    createRoomV3PilotScaleSpec({
      shell: shellWithCameraDrift,
      furnitureCatalog: []
    })
  )

  assert.ok(cameraValidation.issueIds.includes("invalid_source_locked_shell"))
})

test("pilot scale spec rejects seat metadata without a finite seat height and clear approach and exit points", () => {
  const invalidSeat: FurnitureItem = {
    ...LEGACY_CHAIR_REFERENCE,
    placementSurface: "floor",
    rotationPolicy: "directional_assets_required",
    anchor: { x: 0.5, y: 1 },
    assetsByRotation: {
      front: LEGACY_CHAIR_REFERENCE.asset,
      back: LEGACY_CHAIR_REFERENCE.asset,
      left: LEGACY_CHAIR_REFERENCE.asset,
      right: LEGACY_CHAIR_REFERENCE.asset
    },
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "invalid-seat",
          x: 100,
          y: 100,
          seatHeight: LEGACY_CHAIR_REFERENCE.height,
          facing: "front",
          approachPoint: { x: -1, y: 0 },
          exitPoint: { x: 1, y: 0 }
        }
      ]
    }
  }

  const validation = validateRoomV3PilotScaleSpec(
    createRoomV3PilotScaleSpec({
      shell: SOURCE_LOCKED_SHELL,
      furnitureCatalog: [],
      submittedFurniture: { dining_chair: invalidSeat }
    })
  )

  assert.ok(validation.invalidFurnitureIds.includes("dining_chair"))
})

test("pilot scale measurement projects the real compact RoomRenderer2D box without pretending that allocation equals a visual body measurement", () => {
  const rendered = getRoomV3PilotAvatarRenderedBox({
    viewportWidthPx: 393,
    cameraWidthRatio: 1.82,
    y: 0.84,
    state: "sitting"
  })

  assert.equal(rendered.rendererWidthPx, 715.26)
  assert.equal(rendered.rendererHeightPx, 407.25)
  assert.equal(rendered.perspectiveScale, 1.079)
  assert.equal(rendered.allocatedWidthPx, 154.36)
  assert.equal(rendered.allocatedHeightPx, 131.83)
  assert.equal(rendered.visibleHeightPx, 131.83)
  assert.equal(rendered.translateYPx, 47)
  assert.equal(rendered.requiresVisualBodyBoundsMeasurement, true)
})
