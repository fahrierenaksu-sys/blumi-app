import type {
  FurnitureItem,
  RoomAnchor,
  RoomFurnitureRotation,
  RoomShell
} from "./roomV2.types"
import {
  ROOM_V2_APPROVED_MY_ROOM_CAMERA,
  resolveRoomV2MyRoomCamera
} from "./roomV2Camera"
import {
  ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
} from "./roomV2AvatarMotion"

const ROOM_V2_SHELL_ASPECT_RATIO = 714 / 1254
const ROOM_V2_COMPACT_AVATAR_BOX = { width: 0.2, height: 0.3 } as const
const ROOM_V2_AVATAR_DEPTH_START_Y = 0.46
const ROOM_V2_AVATAR_DEPTH_RANGE = 0.42
const ROOM_V2_AVATAR_MIN_PERSPECTIVE_SCALE = 0.88
const ROOM_V2_AVATAR_PERSPECTIVE_SCALE_RANGE = 0.22
const ROOM_V2_SITTING_SCALE_Y = 1
const ROOM_V2_SITTING_TRANSLATE_Y_PX =
  ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
const ROOM_V2_AVATAR_COLLISION_CLEARANCE = 0.012
const ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE = {
  minX: -0.5,
  maxX: 0.5,
  minY: -0.5,
  maxY: 0.1,
  maxHeightRatio: 0.7
} as const

const REQUIRED_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

export type RoomV3PilotScaleFurnitureId =
  | "dining_chair"
  | "lounge_armchair"
  | "long_sofa"
  | "dining_table"
  | "work_desk"
  | "double_bed"
  | "nightstand"
  | "wardrobe"
  | "bookshelf"
  | "floor_lamp"
  | "rug"

export type RoomV3PilotScaleIssueId =
  | "missing_source_locked_shell"
  | "invalid_source_locked_shell"
  | "missing_required_pilot_assets"
  | "invalid_required_pilot_metadata"
  | "missing_measurement_evidence"
  | "missing_simulator_visual_review"
  | "missing_independent_review"
  | "artifact_verifier_required"

export interface RoomV3PilotScaleFurnitureRequirement {
  id: RoomV3PilotScaleFurnitureId
  label: string
  category: FurnitureItem["category"]
  interactionType: FurnitureItem["interactionType"]
  blocksMovement: boolean
  requiresSeatMetadata: boolean
  requiresDirectionalAssets: boolean
}

export interface RoomV3PilotScaleEvidence {
  measurementTableId?: string
  simulatorVisualReviewId?: string
  independentReviewId?: string
}

export interface RoomV3PilotScaleReferenceItem {
  sourceItemId: string
  renderBox?: { width: number; height: number }
  footprint?: { width: number; height: number }
  anchor?: RoomAnchor
  interactionType?: FurnitureItem["interactionType"]
  status: "legacy_reference_only"
}

export interface RoomV3PilotScaleAvatarSourceEnvelope {
  id: "female_standing" | "female_sitting" | "male_standing" | "male_sitting"
  sourceAssetPath: string
  fitProfileId:
    | "blumi_female_room_avatar_v1"
    | "blumi_male_room_avatar_v1"
  // Pixel bounds are [min, max) as read from the transparent base layer.
  // They are preflight inputs, not a replacement for the full composited
  // avatar's rendered body, hip, or foot measurements in Simulator.
  alphaBounds: {
    minX: number
    minY: number
    maxXExclusive: number
    maxYExclusive: number
  }
}

export interface RoomV3PilotScaleSpec {
  productionStatus: "blocked" | "assets_submitted"
  shell: {
    id: string
    sourceAssetKey: string
    canvasSize: { width: number; height: number }
    myRoomCamera?: NonNullable<RoomShell["myRoomCamera"]>
    placeableArea?: { minX: number; maxX: number; minY: number; maxY: number }
    walkablePolygon: readonly RoomAnchor[]
    placementLanes: readonly NonNullable<RoomShell["placementLanes"]>[number][]
  }
  avatarRenderer: {
    sourceCanvasSize: { width: number; height: number }
    compactBox: { width: number; height: number }
    perspectiveScale: { min: number; max: number; startY: number; endY: number }
    sitting: { scaleY: number; translateYPx: number }
    requiredSubjects: readonly [
      "female_standing",
      "female_sitting",
      "male_standing",
      "male_sitting"
    ]
  }
  avatarSourceEnvelopes: readonly RoomV3PilotScaleAvatarSourceEnvelope[]
  movementClearance: number
  requiredFurniture: readonly RoomV3PilotScaleFurnitureRequirement[]
  referenceItems: readonly RoomV3PilotScaleReferenceItem[]
  submittedFurniture: Partial<Record<RoomV3PilotScaleFurnitureId, FurnitureItem>>
  evidence: RoomV3PilotScaleEvidence
}

export interface RoomV3PilotScaleValidation {
  isReadyForCatalogProduction: boolean
  issueIds: RoomV3PilotScaleIssueId[]
  missingFurnitureIds: RoomV3PilotScaleFurnitureId[]
  invalidFurnitureIds: RoomV3PilotScaleFurnitureId[]
}

export interface RoomV3PilotAvatarRenderedBox {
  rendererWidthPx: number
  rendererHeightPx: number
  perspectiveScale: number
  allocatedWidthPx: number
  allocatedHeightPx: number
  visibleHeightPx: number
  translateYPx: number
  // The source rig contains transparent padding and layered art. Allocation
  // dimensions must never be substituted for an inspected body/hip/foot box.
  requiresVisualBodyBoundsMeasurement: true
}

export const ROOM_V3_PILOT_SCALE_REQUIRED_METADATA_FIELDS = [
  "asset and all four directional assets",
  "rotationPolicy: directional_assets_required",
  "documented floor anchor",
  "rotation-aware floor footprint",
  "blocksMovement",
  "interactionType",
  "seatSpec with capacity, seat, approach, and exit points for each seat",
  "measurement-table, Simulator, and independent-review evidence"
] as const

const REQUIRED_FURNITURE: readonly RoomV3PilotScaleFurnitureRequirement[] = [
  requiredFurniture("dining_chair", "Dining chair", "seating", "seat", true, true),
  requiredFurniture("lounge_armchair", "Lounge armchair", "seating", "seat", true, true),
  requiredFurniture("long_sofa", "Long sofa", "seating", "seat", true, true),
  requiredFurniture("dining_table", "Dining table", "table", "decor", true, true),
  requiredFurniture("work_desk", "Work desk", "table", "decor", true, true),
  requiredFurniture("double_bed", "Double bed", "seating", "seat", true, true),
  requiredFurniture("nightstand", "Nightstand", "table", "decor", true, true),
  requiredFurniture("wardrobe", "Wardrobe", "misc", "decor", true, true),
  requiredFurniture("bookshelf", "Bookshelf", "wallDecor", "decor", true, true),
  requiredFurniture("floor_lamp", "Floor lamp", "lighting", "decor", true, true),
  requiredFurniture("rug", "Rug", "rug", "decor", false, true)
]

const LEGACY_REFERENCE_ITEM_IDS = [
  "room_v2_chair_blush",
  "room_v2_table_round",
  "room_v2_lamp_heart",
  "room_v2_cozy_bed",
  "room_v2_cute_bookshelf",
  "room_v2_heart_rug"
] as const

const ROOM_V2_SOURCE_LOCK = {
  id: "room_v2_shell_blumi_world_v1",
  assetKey: "room_v2_shell_blumi_world_v1",
  canvasSize: { width: 1254, height: 714 },
  myRoomCamera: { ...ROOM_V2_APPROVED_MY_ROOM_CAMERA },
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
    { id: "room_v2_world_lane_wall", y: 0.54, minX: 0.26, maxX: 0.74, snapRadius: 0.035 },
    { id: "room_v2_world_lane_mid", y: 0.66, minX: 0.24, maxX: 0.76, snapRadius: 0.045 },
    { id: "room_v2_world_lane_social", y: 0.76, minX: 0.25, maxX: 0.75, snapRadius: 0.045 },
    { id: "room_v2_world_lane_front", y: 0.86, minX: 0.28, maxX: 0.72, snapRadius: 0.04 }
  ]
} as const

const ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA = resolveRoomV2MyRoomCamera(
  ROOM_V2_SOURCE_LOCK.myRoomCamera
)

const AVATAR_SOURCE_ENVELOPES: readonly RoomV3PilotScaleAvatarSourceEnvelope[] = [
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
]

export function createRoomV3PilotScaleSpec(input: {
  shell: RoomShell | undefined
  furnitureCatalog: readonly FurnitureItem[]
  submittedFurniture?: Partial<Record<RoomV3PilotScaleFurnitureId, FurnitureItem>>
  evidence?: RoomV3PilotScaleEvidence
}): RoomV3PilotScaleSpec {
  const shell = input.shell
  const submittedFurniture = { ...input.submittedFurniture }
  const evidence = { ...input.evidence }

  return {
    productionStatus: hasEveryRequiredFurniture(submittedFurniture)
      ? "assets_submitted"
      : "blocked",
    shell: {
      id: shell?.id ?? "missing_source_locked_shell",
      sourceAssetKey: shell?.asset.key ?? "missing_source_locked_asset",
      canvasSize: shell?.canvasSize ?? { width: 0, height: 0 },
      ...(shell?.myRoomCamera ? { myRoomCamera: { ...shell.myRoomCamera } } : {}),
      ...(shell?.placeableArea ? { placeableArea: { ...shell.placeableArea } } : {}),
      walkablePolygon: shell?.walkablePolygon?.map((point) => ({ ...point })) ?? [],
      placementLanes: shell?.placementLanes?.map((lane) => ({ ...lane })) ?? []
    },
    avatarRenderer: {
      sourceCanvasSize: { width: 256, height: 384 },
      compactBox: { ...ROOM_V2_COMPACT_AVATAR_BOX },
      perspectiveScale: {
        min: ROOM_V2_AVATAR_MIN_PERSPECTIVE_SCALE,
        max: ROOM_V2_AVATAR_MIN_PERSPECTIVE_SCALE + ROOM_V2_AVATAR_PERSPECTIVE_SCALE_RANGE,
        startY: ROOM_V2_AVATAR_DEPTH_START_Y,
        endY: ROOM_V2_AVATAR_DEPTH_START_Y + ROOM_V2_AVATAR_DEPTH_RANGE
      },
      sitting: {
        scaleY: ROOM_V2_SITTING_SCALE_Y,
        translateYPx: ROOM_V2_SITTING_TRANSLATE_Y_PX
      },
      requiredSubjects: [
        "female_standing",
        "female_sitting",
        "male_standing",
        "male_sitting"
      ]
    },
    avatarSourceEnvelopes: AVATAR_SOURCE_ENVELOPES.map((envelope) => ({
      ...envelope,
      alphaBounds: { ...envelope.alphaBounds }
    })),
    movementClearance: ROOM_V2_AVATAR_COLLISION_CLEARANCE,
    requiredFurniture: REQUIRED_FURNITURE.map((requirement) => ({ ...requirement })),
    referenceItems: LEGACY_REFERENCE_ITEM_IDS.flatMap((itemId) => {
      const item = input.furnitureCatalog.find((candidate) => candidate.id === itemId)
      return item ? [toLegacyReferenceItem(item)] : []
    }),
    submittedFurniture,
    evidence
  }
}

export function validateRoomV3PilotScaleSpec(
  spec: RoomV3PilotScaleSpec
): RoomV3PilotScaleValidation {
  const issueIds: RoomV3PilotScaleIssueId[] = []
  const missingFurnitureIds = spec.requiredFurniture
    .filter((requirement) => !spec.submittedFurniture[requirement.id])
    .map((requirement) => requirement.id)
  const invalidFurnitureIds = spec.requiredFurniture
    .filter((requirement) => {
      const furniture = spec.submittedFurniture[requirement.id]
      return furniture ? !isPilotFurnitureMetadataValid(furniture, requirement) : false
    })
    .map((requirement) => requirement.id)

  if (spec.shell.id === "missing_source_locked_shell") {
    issueIds.push("missing_source_locked_shell")
  } else if (!isSourceLockedShellValid(spec.shell)) {
    issueIds.push("invalid_source_locked_shell")
  }
  if (missingFurnitureIds.length > 0) issueIds.push("missing_required_pilot_assets")
  if (invalidFurnitureIds.length > 0) issueIds.push("invalid_required_pilot_metadata")
  if (!hasEvidenceId(spec.evidence.measurementTableId)) {
    issueIds.push("missing_measurement_evidence")
  }
  if (!hasEvidenceId(spec.evidence.simulatorVisualReviewId)) {
    issueIds.push("missing_simulator_visual_review")
  }
  if (!hasEvidenceId(spec.evidence.independentReviewId)) {
    issueIds.push("missing_independent_review")
  }

  // Metadata cannot prove pixels, actual alpha bounds, nor physical sitting.
  // The artifact reader/verifier is intentionally a hard gate for this spec.
  issueIds.push("artifact_verifier_required")

  return {
    isReadyForCatalogProduction: false,
    issueIds,
    missingFurnitureIds,
    invalidFurnitureIds
  }
}

export function getRoomV3PilotAvatarRenderedBox(input: {
  viewportWidthPx: number
  cameraWidthRatio: number
  y: number
  state: "standing" | "sitting"
}): RoomV3PilotAvatarRenderedBox {
  const rendererWidthPx = round(input.viewportWidthPx * input.cameraWidthRatio, 2)
  const rendererHeightPx = round(rendererWidthPx * ROOM_V2_SHELL_ASPECT_RATIO, 2)
  const perspectiveScale = getRoomV2AvatarPerspectiveScale(input.y)
  const allocatedWidthPx = round(
    rendererWidthPx * ROOM_V2_COMPACT_AVATAR_BOX.width * perspectiveScale,
    2
  )
  const allocatedHeightPx = round(
    rendererHeightPx * ROOM_V2_COMPACT_AVATAR_BOX.height * perspectiveScale,
    2
  )
  const visibleHeightPx = round(
    allocatedHeightPx * (input.state === "sitting" ? ROOM_V2_SITTING_SCALE_Y : 1),
    2
  )

  return {
    rendererWidthPx,
    rendererHeightPx,
    perspectiveScale: round(perspectiveScale, 3),
    allocatedWidthPx,
    allocatedHeightPx,
    visibleHeightPx,
    translateYPx: input.state === "sitting" ? ROOM_V2_SITTING_TRANSLATE_Y_PX : 0,
    requiresVisualBodyBoundsMeasurement: true
  }
}

function requiredFurniture(
  id: RoomV3PilotScaleFurnitureId,
  label: string,
  category: FurnitureItem["category"],
  interactionType: FurnitureItem["interactionType"],
  blocksMovement: boolean,
  requiresDirectionalAssets: boolean
): RoomV3PilotScaleFurnitureRequirement {
  return {
    id,
    label,
    category,
    interactionType,
    blocksMovement,
    requiresSeatMetadata: interactionType === "seat",
    requiresDirectionalAssets
  }
}

function hasEveryRequiredFurniture(
  submittedFurniture: Partial<Record<RoomV3PilotScaleFurnitureId, FurnitureItem>>
): boolean {
  return REQUIRED_FURNITURE.every((requirement) => submittedFurniture[requirement.id])
}

function toLegacyReferenceItem(item: FurnitureItem): RoomV3PilotScaleReferenceItem {
  return {
    sourceItemId: item.id,
    renderBox: { width: item.width, height: item.height },
    ...(item.footprint ? { footprint: { ...item.footprint } } : {}),
    ...(item.anchor ? { anchor: { ...item.anchor } } : {}),
    ...(item.interactionType ? { interactionType: item.interactionType } : {}),
    status: "legacy_reference_only"
  }
}

function isSourceLockedShellValid(shell: RoomV3PilotScaleSpec["shell"]): boolean {
  return (
    shell.id === ROOM_V2_SOURCE_LOCK.id &&
    shell.sourceAssetKey === ROOM_V2_SOURCE_LOCK.assetKey &&
    shell.canvasSize.width === ROOM_V2_SOURCE_LOCK.canvasSize.width &&
    shell.canvasSize.height === ROOM_V2_SOURCE_LOCK.canvasSize.height &&
    hasSameMyRoomCamera(shell.myRoomCamera) &&
    hasSamePlaceableArea(shell.placeableArea) &&
    hasSamePoints(shell.walkablePolygon, ROOM_V2_SOURCE_LOCK.walkablePolygon) &&
    hasSamePlacementLanes(shell.placementLanes, ROOM_V2_SOURCE_LOCK.placementLanes)
  )
}

function isPilotFurnitureMetadataValid(
  furniture: FurnitureItem,
  requirement: RoomV3PilotScaleFurnitureRequirement
): boolean {
  const hasAllDirectionalAssets = REQUIRED_ROTATIONS.every((rotation) =>
    Boolean(furniture.assetsByRotation?.[rotation])
  )
  const hasValidSeatSpec = !requirement.requiresSeatMetadata || Boolean(
    furniture.seatSpec &&
    furniture.seatSpec.capacity > 0 &&
    furniture.seatSpec.capacity === furniture.seatSpec.seatPoints.length &&
    furniture.seatSpec.seatPoints.every((seat) => isPilotSeatPointValid(seat, furniture))
  )

  return (
    furniture.category === requirement.category &&
    furniture.placementSurface === "floor" &&
    furniture.rotationPolicy === "directional_assets_required" &&
    Boolean(furniture.anchor && isFiniteAnchor(furniture.anchor)) &&
    Boolean(
      furniture.footprint &&
      Number.isFinite(furniture.footprint.width) &&
      Number.isFinite(furniture.footprint.height) &&
      furniture.footprint.width > 0 &&
      furniture.footprint.height > 0
    ) &&
    Number.isFinite(furniture.width) &&
    Number.isFinite(furniture.height) &&
    furniture.width > 0 &&
    furniture.height > 0 &&
    furniture.blocksMovement === requirement.blocksMovement &&
    furniture.interactionType === requirement.interactionType &&
    (!requirement.requiresDirectionalAssets || hasAllDirectionalAssets) &&
    hasValidSeatSpec
  )
}

function hasSameMyRoomCamera(
  camera: RoomV3PilotScaleSpec["shell"]["myRoomCamera"]
): boolean {
  if (!camera) return false

  return (
    camera.compactRendererWidth ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.compactRendererWidth &&
    camera.regularRendererWidth ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.regularRendererWidth &&
    camera.rendererTranslateY ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.rendererTranslateY &&
    camera.compactStageHeightRatio ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.compactStageHeightRatio &&
    camera.wideStageHeightRatio ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.wideStageHeightRatio &&
    camera.compactMinStageHeight ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.compactMinStageHeight &&
    camera.wideMinStageHeight ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.wideMinStageHeight &&
    camera.compactMaxStageHeight ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.compactMaxStageHeight &&
    camera.wideMaxStageHeight ===
      ROOM_V2_SOURCE_LOCKED_MY_ROOM_CAMERA.wideMaxStageHeight
  )
}

function hasSamePlaceableArea(
  placeableArea: RoomV3PilotScaleSpec["shell"]["placeableArea"]
): boolean {
  return Boolean(
    placeableArea &&
    placeableArea.minX === ROOM_V2_SOURCE_LOCK.placeableArea.minX &&
    placeableArea.maxX === ROOM_V2_SOURCE_LOCK.placeableArea.maxX &&
    placeableArea.minY === ROOM_V2_SOURCE_LOCK.placeableArea.minY &&
    placeableArea.maxY === ROOM_V2_SOURCE_LOCK.placeableArea.maxY
  )
}

function hasSamePoints(
  points: readonly RoomAnchor[],
  expected: readonly RoomAnchor[]
): boolean {
  return points.length === expected.length && points.every((point, index) =>
    point.x === expected[index]?.x && point.y === expected[index]?.y
  )
}

function hasSamePlacementLanes(
  lanes: readonly NonNullable<RoomShell["placementLanes"]>[number][],
  expected: readonly { id: string; y: number; minX: number; maxX: number; snapRadius: number }[]
): boolean {
  return lanes.length === expected.length && lanes.every((lane, index) =>
    lane.id === expected[index]?.id &&
    lane.y === expected[index]?.y &&
    lane.minX === expected[index]?.minX &&
    lane.maxX === expected[index]?.maxX &&
    lane.snapRadius === expected[index]?.snapRadius
  )
}

function isPilotSeatPointValid(
  seat: NonNullable<FurnitureItem["seatSpec"]>["seatPoints"][number],
  furniture: FurnitureItem
): boolean {
  const footprint = furniture.footprint
  const hasSafeApproachAndExit = Boolean(
    footprint &&
    seat.approachPoint &&
    seat.exitPoint &&
    isFiniteAnchor(seat.approachPoint) &&
    isFiniteAnchor(seat.exitPoint) &&
    isOutsideFootprintWithClearance(seat.approachPoint, furniture, footprint) &&
    isOutsideFootprintWithClearance(seat.exitPoint, furniture, footprint)
  )

  return (
    Number.isFinite(seat.x) &&
    Number.isFinite(seat.y) &&
    Number.isFinite(seat.seatHeight) &&
    seat.seatHeight! >= 0 &&
    seat.seatHeight! <= furniture.height * ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE.maxHeightRatio &&
    seat.x >= ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE.minX &&
    seat.x <= ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE.maxX &&
    seat.y >= ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE.minY &&
    seat.y <= ROOM_V3_PILOT_SEAT_LOCAL_ENVELOPE.maxY &&
    Boolean(seat.facing && REQUIRED_ROTATIONS.includes(seat.facing)) &&
    hasSafeApproachAndExit
  )
}

function isFiniteAnchor(anchor: RoomAnchor): boolean {
  return Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
}

function isOutsideFootprintWithClearance(
  point: RoomAnchor,
  furniture: FurnitureItem,
  footprint: NonNullable<FurnitureItem["footprint"]>
): boolean {
  const pointX = Math.abs(point.x * furniture.width)
  const pointY = Math.abs(point.y * furniture.height)
  return pointX > footprint.width / 2 + ROOM_V2_AVATAR_COLLISION_CLEARANCE ||
    pointY > footprint.height / 2 + ROOM_V2_AVATAR_COLLISION_CLEARANCE
}

function getRoomV2AvatarPerspectiveScale(y: number): number {
  const normalizedDepth = Math.max(
    0,
    Math.min(1, (y - ROOM_V2_AVATAR_DEPTH_START_Y) / ROOM_V2_AVATAR_DEPTH_RANGE)
  )
  return ROOM_V2_AVATAR_MIN_PERSPECTIVE_SCALE +
    normalizedDepth * ROOM_V2_AVATAR_PERSPECTIVE_SCALE_RANGE
}

function hasEvidenceId(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
