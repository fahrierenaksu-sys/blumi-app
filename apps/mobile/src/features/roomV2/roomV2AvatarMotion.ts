import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionAssetDiagnostics,
  RoomV2AvatarMotionAssetIssueId,
  RoomV2AvatarMotionState,
  RoomV2AvatarMotionTreatment,
  RoomV2AvatarRenderItem,
  RoomV2AvatarRenderLayer,
  RoomV2AvatarSeatRig
} from "./roomV2.types"

// The sitting artwork keeps the standing rig's canvas and needs this authored
// hip-to-canvas compensation in addition to the physical seat-to-floor drop.
// Before layout is measured it is also the safest non-zero fallback.
export const ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX = 47

/**
 * Convert the normalized vertical distance from a seat surface to the floor
 * into the renderer's pixel coordinate space. The earlier fixed-pixel ratio
 * ignored viewport size and inverted the meaning of seatHeight, leaving the
 * avatar's shoes perched on the cushion.
 */
export function getRoomV2AvatarSittingTranslateY(
  seatRig?: Pick<RoomV2AvatarSeatRig, "seatHeight">,
  stageHeightPx?: number
): number {
  const seatHeight = seatRig?.seatHeight
  if (
    !Number.isFinite(seatHeight) ||
    seatHeight! <= 0 ||
    !Number.isFinite(stageHeightPx) ||
    stageHeightPx! <= 0
  ) return ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX

  return Number((
    ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX +
    seatHeight! * stageHeightPx!
  ).toFixed(3))
}

export interface RoomV2AvatarRenderMotionProfile {
  state: RoomV2AvatarMotionState
  treatment: RoomV2AvatarMotionTreatment
  usesRuntimeLocomotion: boolean
  usesRuntimeGesture: boolean
  usesAnimatedAssets: boolean
}

export type RoomV2AvatarMotionSliceId =
  | "first_room_world_motion"
  | "gesture_delight_motion"

export interface RoomV2AvatarMotionSliceRequirement {
  state: RoomV2AvatarMotionState
  direction: RoomFurnitureRotation
  label: string
  minimumFrameCount: number
  requiresAnimation: boolean
  productionBlocking: boolean
}

export interface RoomV2AvatarMotionSliceSpec {
  id: RoomV2AvatarMotionSliceId
  label: string
  description: string
  requirements: readonly RoomV2AvatarMotionSliceRequirement[]
}

export const ROOM_V2_AVATAR_MOTION_SLICE_SPECS: readonly RoomV2AvatarMotionSliceSpec[] = [
  {
    id: "first_room_world_motion",
    label: "First room-world motion slice",
    description: "The minimum production slice for a Blumi avatar to feel native inside rooms.",
    requirements: [
      {
        state: "idle",
        direction: "front",
        label: "Idle front",
        minimumFrameCount: 1,
        requiresAnimation: false,
        productionBlocking: true
      },
      {
        state: "walking",
        direction: "front",
        label: "Walk front",
        minimumFrameCount: 4,
        requiresAnimation: true,
        productionBlocking: true
      },
      {
        state: "sitting",
        direction: "front",
        label: "Sit front",
        minimumFrameCount: 1,
        requiresAnimation: false,
        productionBlocking: true
      }
    ]
  },
  {
    id: "gesture_delight_motion",
    label: "Gesture delight slice",
    description: "Optional social gestures after the first room-world motion slice is reliable.",
    requirements: [
      {
        state: "waving",
        direction: "front",
        label: "Wave front",
        minimumFrameCount: 1,
        requiresAnimation: false,
        productionBlocking: false
      },
      {
        state: "dancing",
        direction: "front",
        label: "Dance front",
        minimumFrameCount: 6,
        requiresAnimation: true,
        productionBlocking: false
      }
    ]
  }
]

export const ROOM_V2_AVATAR_FIRST_MOTION_SLICE = ROOM_V2_AVATAR_MOTION_SLICE_SPECS[0]
export const ROOM_V2_AVATAR_GESTURE_DELIGHT_SLICE = ROOM_V2_AVATAR_MOTION_SLICE_SPECS[1]

export const ROOM_V2_AVATAR_FIRST_MOTION_SLICE_REQUIREMENTS: readonly {
  state: RoomV2AvatarMotionState
  direction: RoomFurnitureRotation
}[] = ROOM_V2_AVATAR_FIRST_MOTION_SLICE.requirements
  .filter((requirement) => requirement.productionBlocking)
  .map((requirement) => ({
    state: requirement.state,
    direction: requirement.direction
  }))

export function getRoomV2AvatarMotionSliceRequirement(input: {
  state: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): RoomV2AvatarMotionSliceRequirement | undefined {
  const direction = input.direction ?? "front"
  return ROOM_V2_AVATAR_MOTION_SLICE_SPECS
    .flatMap((slice) => slice.requirements)
    .find((requirement) =>
      requirement.state === input.state &&
      requirement.direction === direction
    )
}

export function getRoomV2AvatarMotionRequirementLabel(input: {
  state: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): string {
  const requirement = getRoomV2AvatarMotionSliceRequirement(input)
  if (requirement) return requirement.label
  return `${formatMotionState(input.state)} ${formatMotionDirection(input.direction ?? "front")}`
}

export function getRoomV2AvatarMinimumFrameCount(input: {
  state: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): number {
  return getRoomV2AvatarMotionSliceRequirement(input)?.minimumFrameCount ?? 1
}

export function doRoomV2AvatarLayersSupportExactMotion(input: {
  layers: RoomV2AvatarRenderLayer[] | undefined
  state: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): boolean {
  return Boolean(
    input.layers?.length &&
    input.layers.every((layer) => {
      const directionMatches = input.direction
        ? layer.requestedDirection === input.direction &&
          layer.resolvedDirection === input.direction
        : true
      return (
        directionMatches &&
        layer.requestedState === input.state &&
        layer.resolvedState === input.state &&
        layer.assetResolutionKind === "exact" &&
        !layer.usingFallbackAsset
      )
    })
  )
}

export function doesRoomV2AvatarStateRequireAnimation(
  state: RoomV2AvatarMotionState
): boolean {
  return state === "walking" || state === "dancing"
}

export function doRoomV2AvatarLayersSupportAnimatedMotion(input: {
  layers: RoomV2AvatarRenderLayer[] | undefined
  state: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): boolean {
  const minimumFrameCount =
    getRoomV2AvatarMinimumFrameCount({
      state: input.state,
      direction: input.direction
    })
  return Boolean(
    input.layers?.length &&
    doRoomV2AvatarLayersSupportExactMotion(input) &&
    input.layers.every((layer) =>
      (layer.animation?.frames.length ?? 0) >= minimumFrameCount
    )
  )
}

export function getRoomV2AvatarMotionAssetDiagnostics(input: {
  layers: RoomV2AvatarRenderLayer[] | undefined
  requestedState: RoomV2AvatarMotionState
  requestedDirection: RoomFurnitureRotation
}): RoomV2AvatarMotionAssetDiagnostics {
  const layers = input.layers ?? []
  const exactLayerCount = layers.filter((layer) =>
    layer.requestedState === input.requestedState &&
    layer.resolvedState === input.requestedState &&
    layer.requestedDirection === input.requestedDirection &&
    layer.resolvedDirection === input.requestedDirection &&
    layer.assetResolutionKind === "exact" &&
    !layer.usingFallbackAsset
  ).length
  const animatedLayers = layers.filter((layer) =>
    (layer.animation?.frames.length ?? 0) > 1
  )
  const frameCounts = uniqueNumbers(
    animatedLayers.map((layer) => layer.animation?.frames.length ?? 1)
  )
  const frameDurationMsValues = uniqueNumbers(
    animatedLayers
      .map((layer) => layer.animation?.frameDurationMs ?? 0)
      .filter((value) => value > 0)
  )
  const minimumFrameCount =
    getRoomV2AvatarMinimumFrameCount({
      state: input.requestedState,
      direction: input.requestedDirection
    })
  const rigIds = uniqueStrings(layers.map((layer) => layer.rigId))
  const fitProfileIds = uniqueStrings(layers.map((layer) => layer.fitProfileId))
  const issueIds: RoomV2AvatarMotionAssetIssueId[] = []
  const supportsExactLayerCoverage =
    layers.length > 0 &&
    exactLayerCount === layers.length

  if (!supportsExactLayerCoverage) issueIds.push("missing_exact_layers")
  if (
    doesRoomV2AvatarStateRequireAnimation(input.requestedState) &&
    animatedLayers.length !== layers.length
  ) {
    issueIds.push("missing_animation_frames")
  }
  if (
    doesRoomV2AvatarStateRequireAnimation(input.requestedState) &&
    animatedLayers.some((layer) =>
      (layer.animation?.frames.length ?? 0) < minimumFrameCount
    )
  ) {
    issueIds.push("insufficient_animation_frames")
  }
  if (frameCounts.length > 1) issueIds.push("mixed_frame_counts")
  if (frameDurationMsValues.length > 1) issueIds.push("mixed_frame_durations")
  if (rigIds.length > 1) issueIds.push("mixed_rigs")
  if (fitProfileIds.length > 1) issueIds.push("mixed_fit_profiles")

  const blockingIssueIds = new Set<RoomV2AvatarMotionAssetIssueId>(issueIds)
  const supportsExactMotion =
    supportsExactLayerCoverage &&
    !blockingIssueIds.has("mixed_rigs") &&
    !blockingIssueIds.has("mixed_fit_profiles")
  const supportsAnimatedMotion =
    supportsExactMotion &&
    !blockingIssueIds.has("missing_animation_frames") &&
    !blockingIssueIds.has("insufficient_animation_frames") &&
    !blockingIssueIds.has("mixed_frame_counts") &&
    !blockingIssueIds.has("mixed_frame_durations")

  return {
    requestedState: input.requestedState,
    requestedDirection: input.requestedDirection,
    layerCount: layers.length,
    exactLayerCount,
    animatedLayerCount: animatedLayers.length,
    frameCounts,
    frameDurationMsValues,
    minimumFrameCount,
    rigIds,
    fitProfileIds,
    issueIds,
    supportsExactMotion,
    supportsAnimatedMotion,
    isProductionReady: doesRoomV2AvatarStateRequireAnimation(input.requestedState)
      ? supportsAnimatedMotion
      : supportsExactMotion
  }
}

export function getRoomV2AvatarMotionTreatment(input: {
  layers: RoomV2AvatarRenderLayer[]
  requestedState: RoomV2AvatarMotionState
  requestedDirection: RoomFurnitureRotation
}): RoomV2AvatarMotionTreatment {
  const diagnostics = getRoomV2AvatarMotionAssetDiagnostics(input)
  if (diagnostics.supportsExactMotion) {
    if (
      doesRoomV2AvatarStateRequireAnimation(input.requestedState) &&
      diagnostics.supportsAnimatedMotion
    ) {
      return "animatedMotionAssets"
    }
    if (doesRoomV2AvatarStateRequireAnimation(input.requestedState)) {
      return input.requestedState === "walking"
        ? "runtimeLocomotion"
        : "runtimeGesture"
    }
    return "exactMotionAssets"
  }

  if (input.requestedState === "walking") return "runtimeLocomotion"
  if (
    input.layers.length > 0 &&
    (input.requestedState === "waving" || input.requestedState === "dancing")
  ) {
    return "runtimeGesture"
  }

  const allLayersUseBaseIdle =
    input.requestedState === "idle" &&
    input.requestedDirection === "front" &&
    input.layers.length > 0 &&
    input.layers.every((layer) =>
      layer.assetResolutionKind === "baseAsset" &&
      layer.resolvedState === "idle" &&
      layer.resolvedDirection === "front" &&
      !layer.usingFallbackAsset
    )

  return allLayersUseBaseIdle ? "idleBaseAsset" : "idleFallback"
}

export function getRenderableRoomV2AvatarMotionState(
  item: RoomV2AvatarRenderItem
): RoomV2AvatarMotionState {
  return getRenderableRoomV2AvatarMotionProfile(item).state
}

export function getRenderableRoomV2AvatarMotionProfile(
  item: RoomV2AvatarRenderItem
): RoomV2AvatarRenderMotionProfile {
  const requestedState = item.state ?? "idle"
  const treatment = item.motionTreatment ?? getRoomV2AvatarMotionTreatment({
    layers: item.layers,
    requestedState,
    requestedDirection: item.direction ?? "front"
  })

  if (
    treatment === "animatedMotionAssets" ||
    treatment === "exactMotionAssets" ||
    treatment === "runtimeLocomotion" ||
    treatment === "runtimeGesture" ||
    requestedState === "idle"
  ) {
    return {
      state: requestedState,
      treatment,
      usesRuntimeLocomotion: treatment === "runtimeLocomotion",
      usesRuntimeGesture: treatment === "runtimeGesture",
      usesAnimatedAssets: treatment === "animatedMotionAssets"
    }
  }

  return {
    state: "idle",
    treatment,
    usesRuntimeLocomotion: false,
    usesRuntimeGesture: false,
    usesAnimatedAssets: false
  }
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function uniqueStrings(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort()
}

function formatMotionState(state: RoomV2AvatarMotionState): string {
  switch (state) {
    case "idle":
      return "Idle"
    case "walking":
      return "Walk"
    case "sitting":
      return "Sit"
    case "waving":
      return "Wave"
    case "dancing":
      return "Dance"
  }
}

function formatMotionDirection(direction: RoomFurnitureRotation): string {
  return direction.charAt(0).toUpperCase() + direction.slice(1)
}
