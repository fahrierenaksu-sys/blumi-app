import {
  DEFAULT_ROOM_AVATAR_FEMALE,
  DEFAULT_ROOM_AVATAR_MALE,
  ROOM_AVATAR_CATALOG,
  ROOM_AVATAR_LAYER_ORDER
} from "./avatarRoom.mock"
import type {
  CreateRoomAvatarRenderItemInput,
  ResolvedRoomAvatarLayer,
  RoomAvatarAppearance,
  RoomAvatarAccessoryOcclusionSlot,
  RoomAvatarAssetCoverageSummary,
  RoomAvatarAssetResolutionKind,
  RoomAvatarBodyPreset,
  RoomAvatarCatalogItem,
  RoomAvatarFitProfileId,
  RoomAvatarFirstMotionSliceReadiness,
  RoomAvatarLayerType,
  RoomAvatarMotionBlockingLayer,
  RoomAvatarMotionRequirementReadiness,
  RoomAvatarMotionReadinessSummary
} from "./avatarRoom.types"
import { DEFAULT_ROOM_V2_ANCHOR } from "../../roomV2/roomV2Selectors"
import type {
  RoomFurnitureRotation,
  RoomV2AvatarAssetSequence,
  RoomV2AvatarMotionAsset,
  RoomV2AvatarMotionAssetIssueId,
  RoomV2AssetRef,
  RoomV2AvatarMotionState,
  RoomV2AvatarRenderItem
} from "../../roomV2/roomV2.types"
import {
  doesRoomV2AvatarStateRequireAnimation,
  getRoomV2AvatarMotionAssetDiagnostics,
  getRoomV2AvatarMotionRequirementLabel,
  getRoomV2AvatarMotionSliceRequirement,
  getRoomV2AvatarMotionTreatment,
  ROOM_V2_AVATAR_GESTURE_DELIGHT_SLICE,
  ROOM_V2_AVATAR_FIRST_MOTION_SLICE,
  ROOM_V2_AVATAR_FIRST_MOTION_SLICE_REQUIREMENTS
} from "../../roomV2/roomV2AvatarMotion"

type RequiredRoomAvatarLayerType =
  Exclude<RoomAvatarLayerType, "accessory">

const REQUIRED_LAYER_TYPES: RequiredRoomAvatarLayerType[] = [
  "hairBack",
  "base",
  "face",
  "eyes",
  "nose",
  "mouth",
  "hair",
  "bottom",
  "shoes",
  "topInner",
  "top",
  "topOuter",
  "hairFront"
]

const OPTIONAL_LAYER_TYPES = new Set<RequiredRoomAvatarLayerType>([
  "hairBack",
  "face",
  "eyes",
  "nose",
  "mouth",
  "hair",
  "topInner",
  "top",
  "topOuter",
  "bottom",
  "shoes",
  "hairFront"
])

const ROOM_AVATAR_RIG_ID = "blumi_2_5d_layered_v1" as const
const ROOM_AVATAR_FIT_PROFILE_BY_BODY_PRESET: Record<
  RoomAvatarBodyPreset,
  RoomAvatarFitProfileId
> = {
  female: "blumi_female_room_avatar_v1",
  male: "blumi_male_room_avatar_v1"
}

export function resolveRoomAvatarAppearance(
  appearance: Partial<RoomAvatarAppearance> | undefined,
  catalog: RoomAvatarCatalogItem[] = ROOM_AVATAR_CATALOG
): RoomAvatarAppearance {
  const bodyPreset = appearance?.bodyPreset ?? "female"
  const defaults = getDefaultAppearanceForPreset(bodyPreset)

  return {
    bodyPreset,
    // For hair layers, distinguish "not provided" (fall back to default)
    // from "explicitly cleared" (e.g. hairBackId: "" for short styles).
    // This prevents re-resolve from restoring a stale default behind
    // a short hairstyle that intentionally omits hairBack.
    hairBackId: resolveOptionalRoomAvatarItem(
      "hairBack",
      appearance && "hairBackId" in appearance
        ? appearance.hairBackId
        : defaults.hairBackId,
      bodyPreset,
      catalog
    )?.id,
    hairFrontId: resolveOptionalRoomAvatarItem(
      "hairFront",
      appearance && "hairFrontId" in appearance
        ? appearance.hairFrontId
        : defaults.hairFrontId,
      bodyPreset,
      catalog
    )?.id,
    baseId: resolveRequiredRoomAvatarItem(
      "base",
      appearance?.baseId ?? defaults.baseId,
      bodyPreset,
      catalog
    )?.id ?? defaults.baseId,
    faceId: resolveOptionalRoomAvatarItem(
      "face",
      appearance?.faceId ?? defaults.faceId,
      bodyPreset,
      catalog
    )?.id,
    eyesId: resolveOptionalRoomAvatarItem(
      "eyes",
      appearance?.eyesId ?? defaults.eyesId,
      bodyPreset,
      catalog
    )?.id,
    noseId: resolveOptionalRoomAvatarItem(
      "nose",
      appearance?.noseId ?? defaults.noseId,
      bodyPreset,
      catalog
    )?.id,
    mouthId: resolveOptionalRoomAvatarItem(
      "mouth",
      appearance?.mouthId ?? defaults.mouthId,
      bodyPreset,
      catalog
    )?.id,
    hairId: resolveOptionalRoomAvatarItem(
      "hair",
      appearance?.hairId ?? defaults.hairId,
      bodyPreset,
      catalog
    )?.id,
    topInnerId: resolveOptionalRoomAvatarItem(
      "topInner",
      appearance?.topInnerId ?? defaults.topInnerId,
      bodyPreset,
      catalog
    )?.id,
    topId: resolveOptionalRoomAvatarItem(
      "top",
      appearance && "topId" in appearance
        ? appearance.topId
        : defaults.topId,
      bodyPreset,
      catalog
    )?.id,
    topOuterId: resolveOptionalRoomAvatarItem(
      "topOuter",
      appearance?.topOuterId ?? defaults.topOuterId,
      bodyPreset,
      catalog
    )?.id,
    bottomId: resolveOptionalRoomAvatarItem(
      "bottom",
      appearance && "bottomId" in appearance
        ? appearance.bottomId
        : defaults.bottomId,
      bodyPreset,
      catalog
    )?.id,
    shoesId: resolveOptionalRoomAvatarItem(
      "shoes",
      appearance && "shoesId" in appearance
        ? appearance.shoesId
        : defaults.shoesId,
      bodyPreset,
      catalog
    )?.id,
    accessoryIds: (appearance?.accessoryIds ?? []).filter((id) =>
      catalog.some((item) =>
        item.id === id &&
        item.type === "accessory" &&
        isRoomAvatarItemCompatibleWithPreset(item, bodyPreset)
      )
    )
  }
}

export function getRoomAvatarRenderLayers(input: {
  appearance?: Partial<RoomAvatarAppearance>
  catalog?: RoomAvatarCatalogItem[]
  state?: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): ResolvedRoomAvatarLayer[] {
  const catalog = input.catalog ?? ROOM_AVATAR_CATALOG
  const appearance = resolveRoomAvatarAppearance(input.appearance, catalog)
  const state = input.state ?? "idle"
  const direction = input.direction ?? "front"
  const requiredLayers = REQUIRED_LAYER_TYPES.flatMap((type): ResolvedRoomAvatarLayer[] => {
    const id = getEquippedRoomAvatarIdForType(appearance, type)
    if (!id && OPTIONAL_LAYER_TYPES.has(type)) return []
    const item = resolveRequiredRoomAvatarItem(
      type,
      id,
      appearance.bodyPreset,
      catalog
    )
    if (!item) return []
    return [toResolvedLayer(item, state, direction, appearance.bodyPreset)]
  })

  const accessoryLayers = appearance.accessoryIds.flatMap((id): ResolvedRoomAvatarLayer[] => {
    const item = catalog.find((entry) =>
      entry.id === id &&
      entry.type === "accessory" &&
      isRoomAvatarItemCompatibleWithPreset(entry, appearance.bodyPreset)
    )
    if (!item) return []
    if (!item.accessoryLayerParts?.length) {
      return [toResolvedLayer(item, state, direction, appearance.bodyPreset)]
    }
    return item.accessoryLayerParts.map((part) =>
      toResolvedLayer(
        {
          ...item,
          id: `${item.id}:${part.id}`,
          layerOrder: getAccessoryPartLayerOrder(part.occlusionSlot),
          asset: part.asset,
          assetsByMotion: part.assetsByMotion,
          accessoryLayerParts: undefined
        },
        state,
        direction,
        appearance.bodyPreset
      )
    )
  })

  return [...requiredLayers, ...accessoryLayers]
    .sort((a, b) => a.layerOrder - b.layerOrder)
}

function getAccessoryPartLayerOrder(
  slot: RoomAvatarAccessoryOcclusionSlot
): number {
  if (slot === "behindBody") return ROOM_AVATAR_LAYER_ORDER.base - 1
  if (slot === "behindHairFront") return ROOM_AVATAR_LAYER_ORDER.hairFront - 1
  return ROOM_AVATAR_LAYER_ORDER.accessory + 20
}

export function getRoomAvatarAssetCoverage(input: {
  appearance?: Partial<RoomAvatarAppearance>
  catalog?: RoomAvatarCatalogItem[]
  state?: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}): RoomAvatarAssetCoverageSummary {
  const requestedState = input.state ?? "idle"
  const requestedDirection = input.direction ?? "front"
  const layers = getRoomAvatarRenderLayers(input)
  const fallbackLayers = layers.filter((layer) => layer.usingFallbackAsset)
  const dedicatedLayerCount = layers.filter((layer) =>
    layer.assetResolutionKind === "exact"
  ).length
  const animatedLayerCount = layers.filter((layer) =>
    (layer.animation?.frames.length ?? 0) > 1
  ).length
  const diagnostics = getRoomV2AvatarMotionAssetDiagnostics({
    layers,
    requestedState,
    requestedDirection
  })
  const blockingLayers = getRoomAvatarMotionBlockingLayers({
    layers,
    requestedState,
    requestedDirection
  })
  const supportsRequestedMotionExactly = diagnostics.supportsExactMotion
  const supportsRequestedMotionAnimation = diagnostics.supportsAnimatedMotion
  const motionTreatment = getRoomV2AvatarMotionTreatment({
    layers,
    requestedState,
    requestedDirection
  })

  return {
    requestedState,
    requestedDirection,
    layerCount: layers.length,
    dedicatedLayerCount,
    animatedLayerCount,
    fallbackLayerCount: fallbackLayers.length,
    fallbackLayerIds: fallbackLayers.map((layer) => layer.id),
    supportsRequestedMotionExactly,
    supportsRequestedMotionAnimation,
    motionAssetIssueIds: diagnostics.issueIds,
    frameCounts: diagnostics.frameCounts,
    frameDurationMsValues: diagnostics.frameDurationMsValues,
    minimumFrameCount: diagnostics.minimumFrameCount,
    blockingLayers,
    isProductionReady: diagnostics.isProductionReady,
    hasDedicatedMotionAssets: dedicatedLayerCount > 0,
    motionTreatment
  }
}

export function getRoomAvatarFirstMotionSliceReadiness(input: {
  appearance?: Partial<RoomAvatarAppearance>
  catalog?: RoomAvatarCatalogItem[]
}): RoomAvatarFirstMotionSliceReadiness {
  const requirements = ROOM_V2_AVATAR_FIRST_MOTION_SLICE_REQUIREMENTS.map((requirement) => {
    const coverage = getRoomAvatarAssetCoverage({
      ...input,
      state: requirement.state,
      direction: requirement.direction
    })

    return {
      requestedState: coverage.requestedState,
      requestedDirection: coverage.requestedDirection,
      supportsRequestedMotionExactly: coverage.supportsRequestedMotionExactly,
      supportsRequestedMotionAnimation: coverage.supportsRequestedMotionAnimation,
      motionAssetIssueIds: coverage.motionAssetIssueIds,
      isProductionReady: coverage.isProductionReady,
      motionTreatment: coverage.motionTreatment,
      fallbackLayerIds: coverage.fallbackLayerIds,
      blockingLayers: coverage.blockingLayers,
      isReady: coverage.isProductionReady
    }
  })
  const missingRequirements = requirements.filter((requirement) =>
    !requirement.isReady
  )

  return {
    isReady: missingRequirements.length === 0,
    requirements,
    missingRequirements
  }
}

export function getRoomAvatarMotionReadinessSummary(input: {
  appearance?: Partial<RoomAvatarAppearance>
  catalog?: RoomAvatarCatalogItem[]
}): RoomAvatarMotionReadinessSummary {
  const readiness = getRoomAvatarFirstMotionSliceReadiness(input)
  const gestureRequirements = ROOM_V2_AVATAR_GESTURE_DELIGHT_SLICE.requirements.map((requirement) => {
    const coverage = getRoomAvatarAssetCoverage({
      ...input,
      state: requirement.state,
      direction: requirement.direction
    })

    return {
      requestedState: coverage.requestedState,
      requestedDirection: coverage.requestedDirection,
      supportsRequestedMotionExactly: coverage.supportsRequestedMotionExactly,
      supportsRequestedMotionAnimation: coverage.supportsRequestedMotionAnimation,
      motionAssetIssueIds: coverage.motionAssetIssueIds,
      isProductionReady: coverage.isProductionReady,
      motionTreatment: coverage.motionTreatment,
      fallbackLayerIds: coverage.fallbackLayerIds,
      blockingLayers: coverage.blockingLayers,
      isReady: coverage.isProductionReady
    }
  })
  const readyRequirementCount = readiness.requirements.filter((requirement) =>
    requirement.isReady
  ).length
  const totalRequirementCount = readiness.requirements.length
  const gestureReadyRequirementCount = gestureRequirements.filter((requirement) =>
    requirement.isReady
  ).length
  const gestureTotalRequirementCount = gestureRequirements.length
  const idleFrontRequirement = readiness.requirements.find((requirement) =>
    requirement.requestedState === "idle" &&
    requirement.requestedDirection === "front"
  )
  const missingRequirementLabels = readiness.missingRequirements.map(
    formatRoomAvatarMotionRequirementLabel
  )
  const missingGestureRequirementLabels = gestureRequirements
    .filter((requirement) => !requirement.isReady)
    .map(formatRoomAvatarMotionRequirementLabel)
  const requirementSummaries = readiness.requirements.map((requirement) => ({
    label: formatRoomAvatarMotionRequirementLabel(requirement),
    isReady: requirement.isReady,
    blockingLayerLabel: requirement.blockingLayers[0]
      ? formatRoomAvatarMotionBlockingLayerLabel(requirement.blockingLayers[0])
      : undefined
  }))
  const gestureRequirementSummaries = gestureRequirements.map((requirement) => ({
    label: formatRoomAvatarMotionRequirementLabel(requirement),
    isReady: requirement.isReady,
    blockingLayerLabel: requirement.blockingLayers[0]
      ? formatRoomAvatarMotionBlockingLayerLabel(requirement.blockingLayers[0])
      : undefined
  }))
  const blockingLayerLabels = readiness.missingRequirements
    .flatMap((requirement) => requirement.blockingLayers)
    .map(formatRoomAvatarMotionBlockingLayerLabel)
  const isGestureDelightReady =
    gestureReadyRequirementCount === gestureTotalRequirementCount

  if (readiness.isReady) {
    return {
      level: "motionReady",
      sliceLabel: ROOM_V2_AVATAR_FIRST_MOTION_SLICE.label,
      label: "Ready for your room",
      body: "This look stays polished when your avatar stands, walks, and sits.",
      readyRequirementCount,
      totalRequirementCount,
      requirementSummaries,
      gestureReadyRequirementCount,
      gestureTotalRequirementCount,
      gestureRequirementSummaries,
      missingGestureRequirementLabels,
      missingRequirementLabels,
      blockingLayerLabels,
      isFirstMotionSliceReady: true,
      isGestureDelightReady
    }
  }

  if (idleFrontRequirement?.isReady) {
    return {
      level: "idleReady",
      sliceLabel: ROOM_V2_AVATAR_FIRST_MOTION_SLICE.label,
      label: "Room preview ready",
      body: "This look can appear in your room while movement polish catches up.",
      readyRequirementCount,
      totalRequirementCount,
      requirementSummaries,
      gestureReadyRequirementCount,
      gestureTotalRequirementCount,
      gestureRequirementSummaries,
      missingGestureRequirementLabels,
      missingRequirementLabels,
      blockingLayerLabels,
      isFirstMotionSliceReady: false,
      isGestureDelightReady
    }
  }

  return {
    level: "notReady",
    sliceLabel: ROOM_V2_AVATAR_FIRST_MOTION_SLICE.label,
    label: "Needs room polish",
    body: "One piece needs a cleaner room fit before this outfit feels finished.",
    readyRequirementCount,
    totalRequirementCount,
    requirementSummaries,
    gestureReadyRequirementCount,
    gestureTotalRequirementCount,
    gestureRequirementSummaries,
    missingGestureRequirementLabels,
    missingRequirementLabels,
    blockingLayerLabels,
    isFirstMotionSliceReady: false,
    isGestureDelightReady
  }
}

export function createRoomAvatarRenderItem(
  input: CreateRoomAvatarRenderItemInput
): RoomV2AvatarRenderItem {
  const layers = getRoomAvatarRenderLayers({
    appearance: input.appearance,
    catalog: input.catalog,
    direction: input.direction,
    state: input.state
  })
  const direction = input.direction ?? "front"
  const state = input.state ?? "idle"

  return {
    renderId: input.renderId ?? `room_v2_avatar_${input.avatarId}`,
    kind: "avatar",
    avatarId: input.avatarId,
    name: input.name,
    layers,
    layer: input.layer ?? "furniture",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    anchor: input.anchor ?? DEFAULT_ROOM_V2_ANCHOR,
    depth: input.depth ?? input.y,
    direction,
    state,
    ...(input.seatRig ? { seatRig: { ...input.seatRig } } : {}),
    motionTreatment: getRoomV2AvatarMotionTreatment({
      layers,
      requestedState: state,
      requestedDirection: direction
    }),
    chatBubbleAnchor: input.chatBubbleAnchor,
    reactionAnchor: input.reactionAnchor
  }
}

function resolveRequiredRoomAvatarItem(
  type: RequiredRoomAvatarLayerType,
  id: string | undefined,
  bodyPreset: RoomAvatarBodyPreset,
  catalog: RoomAvatarCatalogItem[]
): RoomAvatarCatalogItem | undefined {
  const exact = id
    ? catalog.find((item) =>
      item.id === id &&
      item.type === type &&
      isRoomAvatarItemCompatibleWithPreset(item, bodyPreset)
    )
    : undefined
  if (exact) return exact

  return catalog.find((item) =>
    item.type === type &&
    item.isDefault &&
    isRoomAvatarItemCompatibleWithPreset(item, bodyPreset)
  )
}

function resolveOptionalRoomAvatarItem(
  type: RequiredRoomAvatarLayerType,
  id: string | undefined,
  bodyPreset: RoomAvatarBodyPreset,
  catalog: RoomAvatarCatalogItem[]
): RoomAvatarCatalogItem | undefined {
  if (!id) return undefined
  return catalog.find((item) =>
    item.id === id &&
    item.type === type &&
    isRoomAvatarItemCompatibleWithPreset(item, bodyPreset)
  )
}

function isRoomAvatarItemCompatibleWithPreset(
  item: RoomAvatarCatalogItem,
  bodyPreset: RoomAvatarBodyPreset
): boolean {
  const expectedFitProfileId = getRoomAvatarFitProfileId(bodyPreset)
  const presetMatches = !item.bodyPreset || item.bodyPreset === bodyPreset
  const fitProfileMatches =
    !item.fitProfileId || item.fitProfileId === expectedFitProfileId
  return presetMatches && fitProfileMatches
}

function toResolvedLayer(
  item: RoomAvatarCatalogItem,
  requestedState: RoomV2AvatarMotionState,
  requestedDirection: RoomFurnitureRotation,
  bodyPreset: RoomAvatarBodyPreset
): ResolvedRoomAvatarLayer {
  const resolvedAsset = resolveRoomAvatarLayerAsset(
    item,
    requestedState,
    requestedDirection
  )

  return {
    id: item.id,
    type: item.type,
    name: item.name,
    layerOrder: item.layerOrder,
    asset: resolvedAsset.asset,
    animation: resolvedAsset.animation,
    requestedState,
    requestedDirection,
    resolvedState: resolvedAsset.state,
    resolvedDirection: resolvedAsset.direction,
    usingFallbackAsset: resolvedAsset.usingFallbackAsset,
    assetResolutionKind: resolvedAsset.kind,
    rigId: item.rigId ?? ROOM_AVATAR_RIG_ID,
    fitProfileId: item.fitProfileId ?? getRoomAvatarFitProfileId(bodyPreset)
  }
}

function resolveRoomAvatarLayerAsset(
  item: RoomAvatarCatalogItem,
  requestedState: RoomV2AvatarMotionState,
  requestedDirection: RoomFurnitureRotation
): {
  asset: RoomV2AssetRef
  animation?: RoomV2AvatarAssetSequence
  state: RoomV2AvatarMotionState
  direction: RoomFurnitureRotation
  usingFallbackAsset: boolean
  kind: RoomAvatarAssetResolutionKind
} {
  const exact = item.assetsByMotion?.[requestedState]?.[requestedDirection]
  if (exact) {
    const motionAsset = resolveRoomAvatarMotionAsset(exact)
    return {
      asset: motionAsset.asset,
      animation: motionAsset.animation,
      state: requestedState,
      direction: requestedDirection,
      usingFallbackAsset: false,
      kind: "exact"
    }
  }

  const sameStateFront = item.assetsByMotion?.[requestedState]?.front
  if (sameStateFront) {
    const motionAsset = resolveRoomAvatarMotionAsset(sameStateFront)
    return {
      asset: motionAsset.asset,
      animation: motionAsset.animation,
      state: requestedState,
      direction: "front",
      usingFallbackAsset: true,
      kind: "sameStateFront"
    }
  }

  const idleSameDirection = item.assetsByMotion?.idle?.[requestedDirection]
  if (idleSameDirection) {
    const motionAsset = resolveRoomAvatarMotionAsset(idleSameDirection)
    return {
      asset: motionAsset.asset,
      animation: motionAsset.animation,
      state: "idle",
      direction: requestedDirection,
      usingFallbackAsset: true,
      kind: "idleSameDirection"
    }
  }

  const idleFront = item.assetsByMotion?.idle?.front
  if (idleFront) {
    const motionAsset = resolveRoomAvatarMotionAsset(idleFront)
    return {
      asset: motionAsset.asset,
      animation: motionAsset.animation,
      state: "idle",
      direction: "front",
      usingFallbackAsset: true,
      kind: "idleFront"
    }
  }

  const isLegacyIdleFront =
    requestedState === "idle" && requestedDirection === "front"

  return {
    asset: item.asset,
    animation: undefined,
    state: "idle",
    direction: "front",
    usingFallbackAsset: !isLegacyIdleFront,
    kind: "baseAsset"
  }
}

function resolveRoomAvatarMotionAsset(asset: RoomV2AvatarMotionAsset): {
  asset: RoomV2AssetRef
  animation?: RoomV2AvatarAssetSequence
} {
  if ("frames" in asset) {
    return {
      asset: asset.frames[0],
      animation: asset.frames.length > 1 ? asset : undefined
    }
  }
  return {
    asset
  }
}

function getRoomAvatarFitProfileId(
  bodyPreset: RoomAvatarBodyPreset
): RoomAvatarFitProfileId {
  return ROOM_AVATAR_FIT_PROFILE_BY_BODY_PRESET[bodyPreset]
}

function getDefaultAppearanceForPreset(
  bodyPreset: RoomAvatarBodyPreset
): RoomAvatarAppearance {
  return bodyPreset === "male"
    ? DEFAULT_ROOM_AVATAR_MALE
    : DEFAULT_ROOM_AVATAR_FEMALE
}

function getEquippedRoomAvatarIdForType(
  appearance: RoomAvatarAppearance,
  type: RequiredRoomAvatarLayerType
): string | undefined {
  switch (type) {
    case "base":
      return appearance.baseId
    case "hairBack":
      return appearance.hairBackId
    case "face":
      return appearance.faceId
    case "eyes":
      return appearance.eyesId
    case "nose":
      return appearance.noseId
    case "mouth":
      return appearance.mouthId
    case "hair":
      return appearance.hairId
    case "hairFront":
      return appearance.hairFrontId
    case "top":
      return appearance.topId
    case "topInner":
      return appearance.topInnerId
    case "topOuter":
      return appearance.topOuterId
    case "bottom":
      return appearance.bottomId
    case "shoes":
      return appearance.shoesId
  }
}

function formatRoomAvatarMotionRequirementLabel(
  requirement: RoomAvatarMotionRequirementReadiness
): string {
  return getRoomV2AvatarMotionRequirementLabel({
    state: requirement.requestedState,
    direction: requirement.requestedDirection
  })
}

function getRoomAvatarMotionBlockingLayers(input: {
  layers: ResolvedRoomAvatarLayer[]
  requestedState: RoomV2AvatarMotionState
  requestedDirection: RoomFurnitureRotation
}): RoomAvatarMotionBlockingLayer[] {
  const requirementLabel = getRoomV2AvatarMotionRequirementLabel({
    state: input.requestedState,
    direction: input.requestedDirection
  })
  return input.layers.flatMap((layer): RoomAvatarMotionBlockingLayer[] => {
    const issueIds = getRoomAvatarLayerMotionIssueIds({
      layer,
      requestedState: input.requestedState,
      requestedDirection: input.requestedDirection
    })
    if (issueIds.length === 0) return []
    return [{
      requirementLabel,
      requestedState: input.requestedState,
      requestedDirection: input.requestedDirection,
      layerId: layer.id,
      layerName: layer.name,
      layerType: layer.type,
      issueIds
    }]
  })
}

function getRoomAvatarLayerMotionIssueIds(input: {
  layer: ResolvedRoomAvatarLayer
  requestedState: RoomV2AvatarMotionState
  requestedDirection: RoomFurnitureRotation
}): RoomV2AvatarMotionAssetIssueId[] {
  const issueIds: RoomV2AvatarMotionAssetIssueId[] = []
  const exactLayer =
    input.layer.requestedState === input.requestedState &&
    input.layer.resolvedState === input.requestedState &&
    input.layer.requestedDirection === input.requestedDirection &&
    input.layer.resolvedDirection === input.requestedDirection &&
    input.layer.assetResolutionKind === "exact" &&
    !input.layer.usingFallbackAsset
  if (!exactLayer) issueIds.push("missing_exact_layers")

  if (doesRoomV2AvatarStateRequireAnimation(input.requestedState)) {
    const minimumFrameCount = getRoomV2AvatarMotionSliceRequirement({
      state: input.requestedState,
      direction: input.requestedDirection
    })?.minimumFrameCount ?? 1
    const frameCount = input.layer.animation?.frames.length ?? 0
    if (frameCount <= 1) {
      issueIds.push("missing_animation_frames")
    } else if (frameCount < minimumFrameCount) {
      issueIds.push("insufficient_animation_frames")
    }
  }

  return issueIds
}

function formatRoomAvatarMotionBlockingLayerLabel(
  layer: RoomAvatarMotionBlockingLayer
): string {
  return `${layer.requirementLabel}: ${formatRoomAvatarLayerType(layer.layerType)} - ${layer.layerName}`
}

function formatRoomAvatarLayerType(type: RoomAvatarLayerType): string {
  switch (type) {
    case "hairBack":
    case "hair":
    case "hairFront":
      return "Hair"
    case "topInner":
    case "top":
    case "topOuter":
      return "Top"
    case "base":
      return "Body"
    case "face":
    case "eyes":
    case "nose":
    case "mouth":
      return "Face"
    case "bottom":
      return "Bottom"
    case "shoes":
      return "Shoes"
    case "accessory":
      return "Accessory"
  }
}
