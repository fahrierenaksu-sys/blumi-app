import {
  doRoomWorldPolygonsOverlap,
  getRoomWorldBlockerBounds,
  pointInRoomWorldPolygon,
  type RoomWorldBlocker,
  type RoomWorldBounds,
  type RoomWorldPoint
} from "../roomWorld/roomWorldGeometry"
import {
  ROOM_LAYER_ORDER,
  type FurnitureItem,
  type PlacedRoomItem,
  type ResolvedRoomV2Scene,
  type RoomAnchor,
  type RoomFurnitureRotation,
  type RoomLayer,
  type RoomPlacementLane,
  type RoomShell,
  type RoomV2AvatarMotionState,
  type RoomV2AvatarRenderItem,
  type RoomV2AvatarRenderLayer,
  type RoomV2FurnitureRenderItem,
  type RoomV2RenderItem,
  type UserRoomDecor,
  type RoomPoint2D
} from "./roomV2.types"
import {
  getRoomV3FootprintForRotation,
  getRoomV3PlacementFootprintForRotation,
  getRoomV3SeatPoints
} from "./roomV3Contracts"
import { getRoomVNextDirectionalVisual } from "./roomVNextContracts"
import { validateRoomV2FurnitureSurfacePlacement } from "./roomV2PlacementSurface"
import { getRoomV2FurnitureMobileRenderScale } from "./roomV2RenderSurface"

/**
 * Returns the stable search key used by the room inventory and editor.
 *
 * Room item names are human-facing labels and may contain punctuation such as
 * hyphens, em dashes, underscores, or periods. Search should not depend on
 * whether a particular iOS keyboard exposes that punctuation key, so both
 * sides of the comparison use the same lowercase, word-separated form.
 */
export function normalizeRoomInventorySearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export const DEFAULT_ROOM_V2_ANCHOR: RoomAnchor = { x: 0.5, y: 1 }

export interface ResolveRoomV2SceneInput {
  roomShellCatalog: RoomShell[]
  furnitureCatalog: FurnitureItem[]
  decor: UserRoomDecor
  defaultRoomShellId?: string
}

export type RoomV2PlacementIssueId =
  | "outside_placeable_area"
  | "overlaps_blocking_furniture"
  | "invalid_placement_surface"
  | "missing_support_surface"

export interface RoomV2PlacementValidationResult {
  isValid: boolean
  issueIds: RoomV2PlacementIssueId[]
  blockingRenderIds: string[]
  supportingRenderIds: string[]
}

export type RoomV2DraftPlacementIssueId =
  | RoomV2PlacementIssueId
  | "missing_catalog_item"
  | "unresolved_furniture_asset"

export interface RoomV2DraftPlacementInvalidItem {
  placedItem: PlacedRoomItem
  renderItem?: RoomV2FurnitureRenderItem
  issueIds: RoomV2DraftPlacementIssueId[]
  blockingRenderIds: string[]
}

export interface RoomV2DraftPlacementValidationResult {
  isValid: boolean
  invalidItems: RoomV2DraftPlacementInvalidItem[]
}

export interface RoomV2PlacementLaneSnapResult {
  x: number
  y: number
  snappedLaneId?: string
}

export function resolveRoomV2Scene(
  input: ResolveRoomV2SceneInput
): ResolvedRoomV2Scene {
  const shell = resolveRoomV2Shell(
    input.roomShellCatalog,
    input.decor.roomShellId,
    input.defaultRoomShellId
  )
  if (!shell) {
    return {
      shell: null,
      renderItems: []
    }
  }

  const furnitureById = new Map(
    input.furnitureCatalog.map((item) => [item.id, item])
  )
  const placedByInstanceId = new Map(
    input.decor.placedItems.map((placed) => [placed.instanceId, placed])
  )
  const resolvedPlacedByInstanceId = new Map<string, PlacedRoomItem>()
  const renderItems = input.decor.placedItems
    .flatMap((placed): RoomV2RenderItem[] => {
      const item = furnitureById.get(placed.itemId)
      if (!item) return []
      const resolvedPlaced = resolveRoomV2PlacedItemTransform({
        placed,
        placedByInstanceId,
        resolvedPlacedByInstanceId,
        furnitureById,
        resolving: new Set()
      })
      const renderItem = resolvePlacedFurnitureRenderItem(resolvedPlaced, item)
      return renderItem ? [renderItem] : []
    })
    .sort(compareRoomV2RenderItems)

  return {
    shell,
    renderItems
  }
}

function resolveRoomV2PlacedItemTransform(input: {
  placed: PlacedRoomItem
  placedByInstanceId: Map<string, PlacedRoomItem>
  resolvedPlacedByInstanceId: Map<string, PlacedRoomItem>
  furnitureById: Map<string, FurnitureItem>
  resolving: Set<string>
}): PlacedRoomItem {
  const cached = input.resolvedPlacedByInstanceId.get(input.placed.instanceId)
  if (cached) return { ...cached }
  if (
    !input.placed.supportInstanceId ||
    !input.placed.supportLocalPosition ||
    input.resolving.has(input.placed.instanceId)
  ) {
    const copy = { ...input.placed }
    input.resolvedPlacedByInstanceId.set(input.placed.instanceId, copy)
    return copy
  }

  const parentPlaced = input.placedByInstanceId.get(input.placed.supportInstanceId)
  const parentItem = parentPlaced
    ? input.furnitureById.get(parentPlaced.itemId)
    : undefined
  if (!parentPlaced || !parentItem) {
    const copy = { ...input.placed }
    input.resolvedPlacedByInstanceId.set(input.placed.instanceId, copy)
    return copy
  }

  const resolving = new Set(input.resolving)
  resolving.add(input.placed.instanceId)
  const resolvedParent = resolveRoomV2PlacedItemTransform({
    ...input,
    placed: parentPlaced,
    resolving
  })
  const parentRender = resolvePlacedFurnitureRenderItem(resolvedParent, parentItem)
  if (!parentRender || parentRender.width <= 0 || parentRender.height <= 0) {
    const copy = { ...input.placed }
    input.resolvedPlacedByInstanceId.set(input.placed.instanceId, copy)
    return copy
  }

  const localOffset = {
    x: (input.placed.supportLocalPosition.x - parentRender.anchor.x) * parentRender.width,
    y: (input.placed.supportLocalPosition.y - parentRender.anchor.y) * parentRender.height
  }
  const quarterTurns = getRoomV2RotationQuarterTurns(
    input.placed.supportParentRotation ?? "front",
    resolvedParent.rotation
  )
  const worldOffset = rotateRoomV2SupportOffset(localOffset, quarterTurns)
  const copy = {
    ...input.placed,
    x: parentRender.x + worldOffset.x,
    y: parentRender.y + worldOffset.y,
    depth: parentRender.y + worldOffset.y,
    rotation: rotateRoomV2FurnitureDirection(input.placed.rotation, quarterTurns)
  }
  input.resolvedPlacedByInstanceId.set(input.placed.instanceId, copy)
  return { ...copy }
}

function getRoomV2RotationQuarterTurns(
  from: RoomFurnitureRotation,
  to: RoomFurnitureRotation
): number {
  const order: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
  return (order.indexOf(to) - order.indexOf(from) + 4) % 4
}

function rotateRoomV2SupportOffset(
  offset: RoomPoint2D,
  quarterTurns: number
): RoomPoint2D {
  if (quarterTurns === 1) return { x: -offset.y, y: offset.x }
  if (quarterTurns === 2) return { x: -offset.x, y: -offset.y }
  if (quarterTurns === 3) return { x: offset.y, y: -offset.x }
  return { ...offset }
}

function rotateRoomV2FurnitureDirection(
  direction: RoomFurnitureRotation,
  quarterTurns: number
): RoomFurnitureRotation {
  const order: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
  return order[(order.indexOf(direction) + quarterTurns) % 4]
}

export function resolveRoomV2Shell(
  roomShellCatalog: RoomShell[],
  roomShellId: string,
  defaultRoomShellId?: string
): RoomShell | null {
  const requestedShell = roomShellCatalog.find((shell) => shell.id === roomShellId)
  if (requestedShell) return requestedShell

  const defaultShell = defaultRoomShellId
    ? roomShellCatalog.find((shell) => shell.id === defaultRoomShellId)
    : undefined
  return defaultShell ?? roomShellCatalog[0] ?? null
}

export function resolveFurnitureAssetForRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): FurnitureItem["asset"] | undefined {
  if (item.rotationPolicy === "directional_assets_required") {
    return item.assetsByRotation?.[rotation]
  }

  return item.assetsByRotation?.[rotation] ?? item.assetsByRotation?.front ?? item.asset
}

export function resolvePlacedFurnitureRenderItem(
  placed: PlacedRoomItem,
  item: FurnitureItem
): RoomV2FurnitureRenderItem | null {
  const visual = item.visualContract
    ? getRoomVNextDirectionalVisual(item.visualContract, placed.rotation)
    : undefined
  const rotationRenderSize =
    visual?.normalizedRenderSize ?? item.renderSizeByRotation?.[placed.rotation]
  const width = placed.width ?? rotationRenderSize?.width ?? item.width
  const height = placed.height ?? rotationRenderSize?.height ?? item.height
  const furnitureRenderScale = getRoomV2FurnitureMobileRenderScale("furniture")
  // A VNext contract is a strict directional source of truth. If a direction
  // is absent, fail closed instead of reviving the legacy mirror fallback.
  const asset = item.visualContract
    ? visual?.bodyAsset
    : resolveFurnitureAssetForRotation(item, placed.rotation)
  if (!asset) return null

  return {
    renderId: placed.instanceId,
    kind: "furniture",
    itemId: item.id,
    name: item.name,
    category: item.category,
    sceneProjection: item.visualContract?.renderClass ?? item.sceneProjection,
    layer: item.layer,
    asset,
    rotation: placed.rotation,
    usesMirroredRotation: shouldMirrorRoomV2FurnitureRotation(
      item,
      placed.rotation
    ),
    x: placed.x,
    y: placed.y,
    width,
    height,
    anchor: visual?.normalizedFloorPivot ?? item.anchorByRotation?.[placed.rotation] ??
      item.anchor ??
      DEFAULT_ROOM_V2_ANCHOR,
    depth: placed.depth ?? placed.y,
    footprint: getRoomV3FootprintForRotation(item, placed.rotation),
    placementFootprint: getRoomV3PlacementFootprintForRotation(item, placed.rotation),
    placementSurface: item.visualContract?.placementSurface ?? item.placementSurface ?? "floor",
    surfacePlacementPolicy: item.surfacePlacementPolicy,
    surfaceSupports: item.surfaceSupports?.map((support) => ({
      ...support,
      localBounds: { ...support.localBounds },
      localBoundsByRotation: support.localBoundsByRotation
        ? Object.fromEntries(
            Object.entries(support.localBoundsByRotation).map(([rotation, bounds]) => [
              rotation,
              { ...bounds }
            ])
          )
        : undefined
    })),
    blocksMovement: item.visualContract?.blocksMovement ?? item.blocksMovement ?? false,
    collisionPolygon: item.visualContract
      ? getRoomVNextWorldPolygon({
        direction: placed.rotation,
        origin: { x: placed.x, y: placed.y },
        polygon: item.visualContract.footprintLocalCm
      })
      : undefined,
    placementPolygon: item.visualContract?.placementClearanceLocalCm
      ? getRoomVNextWorldPolygon({
        direction: placed.rotation,
        origin: { x: placed.x, y: placed.y },
        polygon: item.visualContract.placementClearanceLocalCm
      })
      : undefined,
    interactionType: item.interactionType ?? "none",
    seatPoints: item.seatPoints,
    seatSpec: item.seatSpec,
    seatWorldPoints: getRoomV3SeatPoints({
      seatSpec: item.seatSpec,
      x: placed.x,
      y: placed.y,
      width: width * furnitureRenderScale,
      height: height * furnitureRenderScale,
      rotation: placed.rotation,
      physicalSizeCm: item.visualContract?.physicalSizeCm
    }),
    frontOcclusion: item.frontOcclusionByRotation?.[placed.rotation],
    visualContract: item.visualContract,
    contactShadowAsset: visual?.contactShadowAsset,
    foregroundOcclusionAsset: visual?.foregroundOcclusionAsset
  }
}

function shouldMirrorRoomV2FurnitureRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): boolean {
  if (item.rotationPolicy === "directional_assets_required") return false
  const isLegacyMirroredDirection = rotation === "left" || rotation === "back"
  return isLegacyMirroredDirection && !item.assetsByRotation?.[rotation]
}

const ROOM_HORIZONTAL_UNITS_PER_CM = 0.3 / 170
const ROOM_FLOOR_DEPTH_UNITS_PER_CM = 0.075 / 100

function getRoomVNextWorldPolygon(input: {
  direction: RoomFurnitureRotation
  origin: RoomWorldPoint
  polygon: readonly RoomPoint2D[]
}): RoomPoint2D[] {
  return input.polygon.map((point) => {
    const rotated = rotateRoomVNextPhysicalPoint(point, input.direction)
    return {
      x: input.origin.x + rotated.x * ROOM_HORIZONTAL_UNITS_PER_CM,
      y: input.origin.y + rotated.y * ROOM_FLOOR_DEPTH_UNITS_PER_CM
    }
  })
}

function rotateRoomVNextPhysicalPoint(
  point: RoomPoint2D,
  direction: RoomFurnitureRotation
): RoomPoint2D {
  if (direction === "right") return { x: -point.y, y: point.x }
  if (direction === "back") return { x: -point.x, y: -point.y }
  if (direction === "left") return { x: point.y, y: -point.x }
  return { ...point }
}

export interface CreateRoomV2AvatarRenderItemInput {
  avatarId: string
  layers: RoomV2AvatarRenderLayer[]
  x: number
  y: number
  width: number
  height: number
  name?: string
  renderId?: string
  layer?: RoomLayer
  depth?: number
  anchor?: RoomAnchor
  direction?: RoomFurnitureRotation
  state?: RoomV2AvatarMotionState
  chatBubbleAnchor?: RoomAnchor
  reactionAnchor?: RoomAnchor
}

export function createRoomV2AvatarRenderItem(
  input: CreateRoomV2AvatarRenderItemInput
): RoomV2AvatarRenderItem {
  return {
    renderId: input.renderId ?? `room_v2_avatar_${input.avatarId}`,
    kind: "avatar",
    avatarId: input.avatarId,
    name: input.name,
    layers: input.layers,
    layer: input.layer ?? "furniture",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    anchor: input.anchor ?? DEFAULT_ROOM_V2_ANCHOR,
    depth: input.depth ?? input.y,
    direction: input.direction ?? "front",
    state: input.state ?? "idle",
    chatBubbleAnchor: input.chatBubbleAnchor,
    reactionAnchor: input.reactionAnchor
  }
}

export function compareRoomV2RenderItems(
  a: RoomV2RenderItem,
  b: RoomV2RenderItem
): number {
  const layerDelta = ROOM_LAYER_ORDER[a.layer] - ROOM_LAYER_ORDER[b.layer]
  if (layerDelta !== 0) return layerDelta

  const depthDelta = a.depth - b.depth
  if (depthDelta !== 0) return depthDelta

  return a.renderId.localeCompare(b.renderId)
}

export function insertRoomV2RenderItemSorted(
  items: RoomV2RenderItem[],
  item: RoomV2RenderItem
): RoomV2RenderItem[] {
  const nextItems = [...items]
  let insertAt = nextItems.length

  for (let index = 0; index < nextItems.length; index += 1) {
    if (compareRoomV2RenderItems(item, nextItems[index]) < 0) {
      insertAt = index
      break
    }
  }

  nextItems.splice(insertAt, 0, item)
  return nextItems
}

export function upsertRoomV2RenderItemSorted(
  items: RoomV2RenderItem[],
  item: RoomV2RenderItem
): RoomV2RenderItem[] {
  const filteredItems = items.filter((entry) => entry.renderId !== item.renderId)
  return insertRoomV2RenderItemSorted(filteredItems, item)
}

export function validateRoomV2FurniturePlacement(input: {
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
}): RoomV2PlacementValidationResult {
  if (input.candidate.kind !== "furniture") {
    return {
      isValid: true,
      issueIds: [],
      blockingRenderIds: [],
      supportingRenderIds: []
    }
  }

  const issueIds: RoomV2PlacementIssueId[] = []
  const surfaceValidation = validateRoomV2FurnitureSurfacePlacement({
    scene: input.scene,
    candidate: input.candidate
  })
  if (!surfaceValidation.isValid) {
    issueIds.push(...surfaceValidation.issueIds)
  }
  const candidateCollisionBlocker = createRoomV2FurniturePlacementBlocker(input.candidate)
  const candidatePlacementBlocker = createRoomV2FurniturePlacementClearanceBlocker(input.candidate)
  const candidateBounds = getRoomWorldBlockerBounds(candidatePlacementBlocker)
  const walkablePolygon = input.scene.shell?.walkablePolygon
  const placeableArea = input.scene.shell?.placeableArea

  const placementSurface = input.candidate.placementSurface ?? "floor"
  if (placementSurface !== "floor") {
    // Wall, ceiling, and tabletop items are validated against their own
    // surface contract above, not against the floor polygon.
  } else if (walkablePolygon?.length) {
    const floorCheckPoints = getRoomV2PlacementFloorCheckPoints(
      input.candidate,
      candidatePlacementBlocker,
      candidateBounds
    )
    const insideWalkableFloor = floorCheckPoints.every((point) =>
      pointInRoomWorldPolygon(point, walkablePolygon)
    )
    if (!insideWalkableFloor) {
      issueIds.push("outside_placeable_area")
    }
  } else if (placeableArea) {
    const anchorInside =
      input.candidate.x >= placeableArea.minX &&
      input.candidate.x <= placeableArea.maxX &&
      input.candidate.y >= placeableArea.minY &&
      input.candidate.y <= placeableArea.maxY
    const boundsInside =
      !input.candidate.blocksMovement ||
      candidateBounds.minX >= placeableArea.minX &&
      candidateBounds.maxX <= placeableArea.maxX &&
      candidateBounds.minY >= placeableArea.minY &&
      candidateBounds.maxY <= placeableArea.maxY

    if (!anchorInside || !boundsInside) {
      issueIds.push("outside_placeable_area")
    }
  }

  const blockingRenderIds = input.scene.renderItems
    .filter((item): item is RoomV2FurnitureRenderItem =>
      item.kind === "furniture" &&
      item.renderId !== input.candidate.renderId &&
      item.blocksMovement &&
      input.candidate.kind === "furniture" &&
      input.candidate.blocksMovement
    )
    .filter((item) =>
      doRoomV2PlacementOverlap(
        candidateCollisionBlocker,
        createRoomV2FurniturePlacementBlocker(item)
      )
    )
    .map((item) => item.renderId)

  if (blockingRenderIds.length > 0) {
    issueIds.push("overlaps_blocking_furniture")
  }

  return {
    isValid: issueIds.length === 0,
    issueIds,
    blockingRenderIds,
    supportingRenderIds: surfaceValidation.supportingRenderIds
  }
}

/**
 * Validates the persisted draft itself, including placements that the scene
 * resolver would otherwise omit when their catalog entry or directional asset
 * is missing. Save flows must use this result before persisting raw decor.
 */
export function validateRoomV2DraftPlacements(input: {
  scene: ResolvedRoomV2Scene
  decor: UserRoomDecor
  furnitureCatalog: FurnitureItem[]
}): RoomV2DraftPlacementValidationResult {
  const invalidItems: RoomV2DraftPlacementInvalidItem[] = []
  for (const placedItem of input.decor.placedItems) {
    const furnitureItem = input.furnitureCatalog.find(
      (item) => item.id === placedItem.itemId
    )
    if (!furnitureItem) {
      invalidItems.push({
        placedItem,
        issueIds: ["missing_catalog_item"],
        blockingRenderIds: []
      })
      continue
    }

    const renderItem = resolvePlacedFurnitureRenderItem(placedItem, furnitureItem)
    if (!renderItem) {
      invalidItems.push({
        placedItem,
        issueIds: ["unresolved_furniture_asset"],
        blockingRenderIds: []
      })
      continue
    }

    const validation = validateRoomV2FurniturePlacement({
      scene: input.scene,
      candidate: renderItem
    })
    if (validation.isValid) continue

    invalidItems.push({
      placedItem,
      renderItem,
      issueIds: validation.issueIds,
      blockingRenderIds: validation.blockingRenderIds
    })
  }

  return {
    isValid: invalidItems.length === 0,
    invalidItems
  }
}

export function createRoomV2FurniturePlacementPreview(input: {
  item: RoomV2RenderItem
  x: number
  y: number
}): RoomV2RenderItem {
  if (input.item.kind !== "furniture") return input.item
  return {
    ...input.item,
    x: input.x,
    y: input.y,
    depth: input.y
  }
}

export function snapRoomV2PointToPlacementLane(input: {
  shell: RoomShell | null | undefined
  x: number
  y: number
}): RoomV2PlacementLaneSnapResult {
  const lane = findNearestRoomV2PlacementLane({
    lanes: input.shell?.placementLanes,
    x: input.x,
    y: input.y
  })
  if (!lane) {
    return {
      x: input.x,
      y: input.y
    }
  }

  return {
    x: Math.max(lane.minX ?? 0, Math.min(lane.maxX ?? 1, input.x)),
    y: lane.y,
    snappedLaneId: lane.id
  }
}

function createRoomV2FurniturePlacementBlocker(
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>
): RoomWorldBlocker {
  const footprint = item.placementFootprint ?? item.footprint ?? {
    width: item.width,
    height: item.height
  }
  return {
    id: item.renderId,
    x: item.x,
    y: item.y,
    width: footprint.width,
    height: footprint.height,
    anchor: item.anchor,
    ...(item.collisionPolygon ? { polygon: item.collisionPolygon.map((point) => ({ ...point })) } : {}),
    blocksMovement: item.blocksMovement
  }
}

function createRoomV2FurniturePlacementClearanceBlocker(
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>
): RoomWorldBlocker {
  const footprint = item.placementFootprint ?? item.footprint ?? {
    width: item.width,
    height: item.height
  }
  return {
    id: item.renderId,
    x: item.x,
    y: item.y,
    width: footprint.width,
    height: footprint.height,
    anchor: item.anchor,
    ...(item.placementPolygon
      ? { polygon: item.placementPolygon.map((point) => ({ ...point })) }
      : item.collisionPolygon
        ? { polygon: item.collisionPolygon.map((point) => ({ ...point })) }
        : {}),
    blocksMovement: item.blocksMovement
  }
}

function getRoomV2PlacementFloorCheckPoints(
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>,
  blocker: RoomWorldBlocker,
  bounds: RoomWorldBounds
): RoomWorldPoint[] {
  const anchorPoint = { x: item.x, y: item.y }
  if (!item.blocksMovement || item.category === "wallDecor") return [anchorPoint]
  if (blocker.polygon && blocker.polygon.length >= 3) {
    return blocker.polygon
  }
  return [
    anchorPoint,
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY }
  ]
}

function findNearestRoomV2PlacementLane(input: {
  lanes: RoomPlacementLane[] | undefined
  x: number
  y: number
}): RoomPlacementLane | undefined {
  const candidates = (input.lanes ?? []).filter((lane) =>
    input.x >= (lane.minX ?? 0) &&
    input.x <= (lane.maxX ?? 1) &&
    Math.abs(input.y - lane.y) <= (lane.snapRadius ?? 0.045)
  )
  return candidates
    .sort((a, b) => Math.abs(input.y - a.y) - Math.abs(input.y - b.y))[0]
}

function doRoomV2PlacementOverlap(
  a: RoomWorldBlocker,
  b: RoomWorldBlocker
): boolean {
  if (a.polygon && b.polygon) {
    return doRoomWorldPolygonsOverlap(a.polygon, b.polygon)
  }
  const aBounds = getRoomWorldBlockerBounds(a)
  const bBounds = getRoomWorldBlockerBounds(b)
  return (
    aBounds.minX < bBounds.maxX &&
    aBounds.maxX > bBounds.minX &&
    aBounds.minY < bBounds.maxY &&
    aBounds.maxY > bBounds.minY
  )
}
