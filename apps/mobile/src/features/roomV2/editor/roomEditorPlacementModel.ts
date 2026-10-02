import type { MyRoomEditorCopy } from "../myRoomCopy"
import {
  createRoomV2FurniturePlacementPreview,
  isRoomV2FurnitureFootprintOnFloor,
  resolvePlacedFurnitureRenderItem,
  upsertRoomV2RenderItemSorted,
  validateRoomV2FurniturePlacement,
  type resolveRoomV2Scene
} from "../roomV2Selectors"
import {
  getRoomV2FloorGridCellPoint,
  getRoomV2FloorGridCellsNear,
  getRoomV2FloorGridProjection,
  getRoomV2ShellFloorPlacementPolygon,
  roundRoomV2FloorGridPoint,
  snapRoomV2FloorGridCell,
  type RoomV2FloorGridCell
} from "../roomV2FloorGrid"
import { getRoomV2PlacedItemPersistenceMetadata } from "../roomV2EditorSave"
import { getRoomV2FurniturePlacementSurface } from "../roomV2PlacementSurface"
import { clampRoomV2FloorFootprintToPolygon } from "../roomV2FloorPlacement"
import { getRoomV2DraftPlacementCandidates } from "../roomV2DraftPlacementCandidates"
import { projectRoomWorldPointToPolygon } from "../../roomWorld/roomWorldGeometry"
import { getRoomWorldMotionReadinessSummary } from "../../roomWorld/roomWorldDiagnostics"
import { createRoomWorldGeometryFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomShell,
  RoomV2RenderItem
} from "../roomV2.types"

/**
 * Pure placement rules for the My Room editor: preview construction, avatar
 * path readiness, support-relative metadata, and pointer clamping. Moved
 * verbatim from MyRoomEditorScreen so they can be exercised without React.
 */

export const ROOM_V2_PLACEMENT_SNAP_STEP = 0.01
export const EDIT_ROOM_AVATAR_SPAWN = {
  x: 0.47,
  y: 0.76
} as const

export interface PlacementPreview {
  item: RoomV2RenderItem
  isValid: boolean
  feedback?: string
  blockingRenderIds?: string[]
  supportingRenderIds?: string[]
  supportParentRotation?: PlacedRoomItem["supportParentRotation"]
  supportLocalPosition?: PlacedRoomItem["supportLocalPosition"]
}

export interface StageWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export function arePlacementPreviewsEqual(
  left: PlacementPreview | undefined,
  right: PlacementPreview | undefined
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (left.isValid !== right.isValid || left.feedback !== right.feedback) {
    return false
  }
  if (left.item.renderId !== right.item.renderId) return false
  if (left.item.kind !== right.item.kind) return false
  if (
    left.item.x !== right.item.x ||
    left.item.y !== right.item.y ||
    left.item.width !== right.item.width ||
    left.item.height !== right.item.height
  ) {
    return false
  }
  if (left.item.depth !== right.item.depth) return false
  if (
    left.item.anchor.x !== right.item.anchor.x ||
    left.item.anchor.y !== right.item.anchor.y
  ) {
    return false
  }
  if (left.item.kind === "furniture" && right.item.kind === "furniture") {
    if (
      left.item.rotation !== right.item.rotation ||
      left.item.asset.key !== right.item.asset.key ||
      left.item.footprint?.width !== right.item.footprint?.width ||
      left.item.footprint?.height !== right.item.footprint?.height
    ) {
      return false
    }
  }
  const leftBlocking = left.blockingRenderIds ?? []
  const rightBlocking = right.blockingRenderIds ?? []
  if (leftBlocking.length !== rightBlocking.length) return false
  return leftBlocking.every((renderId, index) => renderId === rightBlocking[index])
}

export function createValidDraftPlacement(input: {
  copy: MyRoomEditorCopy
  item: FurnitureItem
  itemId: string
  scene: ReturnType<typeof resolveRoomV2Scene>
  rotationOverride?: PlacedRoomItem["rotation"]
}): PlacedRoomItem | null {
  const instanceId = `${input.itemId}_${Date.now()}`
  const rotation = input.rotationOverride ?? getDefaultRoomV2FurnitureRotation(input.item)
  const candidates = getRoomV2DraftPlacementCandidates(input.item, input.scene)

  const usesFloorGrid = isFloorGridPlacement(input.item, input.scene.shell)
  for (const candidate of candidates) {
    // On a measured floor the default spots snap to the drawn tiles too.
    const floorCell = usesFloorGrid ? getRoomV2FloorGridCellForPoint(input.scene.shell, candidate) : undefined
    const point = floorCell && input.scene.shell?.floorGrid
      ? roundRoomV2FloorGridPoint(getRoomV2FloorGridCellPoint(
        getRoomV2FloorGridProjection(input.scene.shell.floorGrid),
        floorCell.column,
        floorCell.row
      ))
      : candidate
    const placedItem: PlacedRoomItem = {
      instanceId,
      itemId: input.itemId,
      x: point.x,
      y: point.y,
      rotation
    }
    const renderItem = resolvePlacedFurnitureRenderItem(placedItem, input.item)
    if (!renderItem) continue
    const validation = validateRoomV2FurniturePlacement({
      scene: input.scene,
      candidate: renderItem
    })
    const preview = createRoomV2PlacementPreviewResult({
      copy: input.copy,
      scene: input.scene,
      candidate: renderItem,
      placementIsValid: validation.isValid,
      placementFeedback: validation.isValid
        ? undefined
        : getRoomPlacementFeedback(validation.issueIds[0], input.copy),
      blockingRenderIds: validation.blockingRenderIds,
      supportingRenderIds: validation.supportingRenderIds
    })
    if (preview.isValid) {
      return {
        ...placedItem,
        ...getRoomV2PlacedItemPersistenceMetadata({
          ...renderItem,
          supportInstanceId: validation.supportingRenderIds[0],
          supportParentRotation: preview.supportParentRotation,
          supportLocalPosition: preview.supportLocalPosition
        })
      }
    }
  }

  return null
}

export function getRoomPlacementSurfaceDropFeedback(
  item: FurnitureItem,
  copy: MyRoomEditorCopy
): string {
  const surface = getRoomV2FurniturePlacementSurface(item)
  return copy.surfaceDrop[surface]
}

export function getDefaultRoomV2FurnitureRotation(
  item: FurnitureItem
): PlacedRoomItem["rotation"] {
  const rotations = getRoomV2FurnitureRotationOptions(item)
  if (rotations.length === 0 || rotations.includes("front")) return "front"
  return rotations[0]
}

export function getRoomV2FurnitureRotationOptions(
  item: FurnitureItem
): PlacedRoomItem["rotation"][] {
  return item.assetsByRotation
    ? (Object.keys(item.assetsByRotation) as PlacedRoomItem["rotation"][])
    : []
}

export function resolveRoomV2InventoryPreviewSource(
  item: FurnitureItem,
  rotation: PlacedRoomItem["rotation"]
) {
  return item.assetsByRotation?.[rotation]?.source ?? item.asset.source
}

export function getRoomPlacementFeedback(
  issueId: string | undefined,
  copy: MyRoomEditorCopy
): string {
  if (issueId === "overlaps_blocking_furniture") {
    return copy.feedback.overlapsFurniture
  }
  if (issueId === "outside_placeable_area") {
    return copy.feedback.outsideFloor
  }
  if (issueId === "invalid_placement_surface") {
    return copy.feedback.invalidSurface
  }
  if (issueId === "missing_support_surface") {
    return copy.feedback.missingSupport
  }
  return copy.feedback.chooseClearSpot
}

export function createRoomV2PlacementPreviewResult(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
  placementIsValid: boolean
  placementFeedback?: string
  blockingRenderIds?: string[]
  supportingRenderIds?: string[]
}): PlacementPreview {
  const supportInstanceId = input.supportingRenderIds?.[0]
  const supportLocalPosition = getRoomV2SupportLocalPosition(
    input.scene,
    input.candidate,
    supportInstanceId
  )
  const support = supportInstanceId
    ? input.scene.renderItems.find((item) => item.renderId === supportInstanceId)
    : undefined
  const supportParentRotation = support?.kind === "furniture"
    ? support.rotation
    : undefined
  if (!input.placementIsValid || input.candidate.kind !== "furniture") {
    return {
      item: input.candidate,
      isValid: false,
      feedback: input.placementFeedback,
      blockingRenderIds: input.blockingRenderIds,
      supportingRenderIds: input.supportingRenderIds,
      supportParentRotation,
      supportLocalPosition
    }
  }

  const previewScene = createRoomV2SceneWithPreviewItem({
    scene: input.scene,
    candidate: input.candidate
  })
  const geometry = createRoomWorldGeometryFromRoomV2Scene(previewScene)
  const readiness = getRoomWorldMotionReadinessSummary({
    geometry,
    spawn: EDIT_ROOM_AVATAR_SPAWN
  })

  if (readiness.level === "blocked") {
    return {
      item: input.candidate,
      isValid: false,
      feedback: input.copy.feedback.blocksAvatarPath,
      blockingRenderIds: [input.candidate.renderId],
      supportingRenderIds: input.supportingRenderIds,
      supportParentRotation,
      supportLocalPosition
    }
  }

  return {
    item: input.candidate,
    isValid: true,
    feedback: readiness.level === "constrained"
      ? input.copy.feedback.tightButUsable
      : undefined,
    supportingRenderIds: input.supportingRenderIds,
    supportParentRotation,
    supportLocalPosition
  }
}

function candidateIsFurniture(
  item: RoomV2RenderItem
): item is Extract<RoomV2RenderItem, { kind: "furniture" }> {
  return item.kind === "furniture"
}

export function getRoomV2SupportLocalPosition(
  scene: ResolvedRoomV2Scene,
  candidate: RoomV2RenderItem,
  supportInstanceId: string | undefined
): PlacedRoomItem["supportLocalPosition"] {
  if (!supportInstanceId || !candidateIsFurniture(candidate)) return undefined
  const support = scene.renderItems.find((item) => item.renderId === supportInstanceId)
  if (!support || support.kind !== "furniture" || support.width <= 0 || support.height <= 0) {
    return undefined
  }
  return {
    x: (candidate.x - (support.x - support.width * support.anchor.x)) / support.width,
    y: (candidate.y - (support.y - support.height * support.anchor.y)) / support.height
  }
}

export function createRoomV2SceneWithPreviewItem(input: {
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
}): ResolvedRoomV2Scene {
  return {
    ...input.scene,
    renderItems: upsertRoomV2RenderItemSorted(
      input.scene.renderItems,
      input.candidate
    )
  }
}

export function clampRoomV2PlacementPointForItem(
  point: { x: number; y: number },
  item: Pick<FurnitureItem, "placementSurface" | "width" | "height" | "anchor" | "footprint" | "placementFootprint" | "placementFootprintByRotation"> & {
    anchor?: FurnitureItem["anchor"]
  },
  shell: RoomShell | null | undefined,
  rotation: PlacedRoomItem["rotation"] = "front"
): { x: number; y: number } {
  const surface = getRoomV2FurniturePlacementSurface(item)
  if (surface === "floor") {
    const floorPoint = clampRoomV2PlacementPointToFloor(point, shell)
    const polygon = getRoomV2ShellFloorPlacementPolygon(shell)
    if (!polygon?.length) return floorPoint
    return clampRoomV2FloorFootprintToPolygon({
      point: floorPoint,
      polygon,
      footprint: item.placementFootprintByRotation?.[rotation] ??
        item.placementFootprint ??
        item.footprint ?? {
        width: item.width,
        height: item.height
      },
      anchor: item.anchor ?? { x: 0.5, y: 1 }
    })
  }

  const region = shell?.surfacePlacementAreas?.[surface]
  const normalized = {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y))
  }
  if (!region) return normalized

  const width = item.width
  const height = item.height
  const anchor = item.anchor ?? { x: 0.5, y: 1 }
  const minX = region.minX + width * anchor.x
  const maxX = region.maxX - width * (1 - anchor.x)
  const minY = region.minY + height * anchor.y
  const maxY = region.maxY - height * (1 - anchor.y)

  return {
    x: clampRoomV2PlacementValue(normalized.x, minX, maxX),
    y: clampRoomV2PlacementValue(normalized.y, minY, maxY)
  }
}

function clampRoomV2PlacementValue(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.max(min, Math.min(max, value))
}

export function clampRoomV2PlacementPointToFloor(
  point: { x: number; y: number },
  shell: RoomShell | null | undefined
): { x: number; y: number } {
  const walkablePolygon = getRoomV2ShellFloorPlacementPolygon(shell)
  const placeableArea = shell?.placeableArea
  const normalized = {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y))
  }
  if (walkablePolygon?.length) {
    return projectRoomWorldPointToPolygon({
      x: snapRoomV2PlacementValue(normalized.x),
      y: snapRoomV2PlacementValue(normalized.y)
    }, walkablePolygon)
  }

  if (!placeableArea) {
    return {
      x: snapRoomV2PlacementValue(normalized.x),
      y: snapRoomV2PlacementValue(normalized.y)
    }
  }

  const { minX, maxX, minY, maxY } = placeableArea
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const halfW = (maxX - minX) / 2
  const halfH = (maxY - minY) / 2
  let dx = (normalized.x - cx) / halfW
  let dy = (normalized.y - cy) / halfH
  const dist = Math.abs(dx) + Math.abs(dy)

  if (dist > 1) {
    dx /= dist
    dy /= dist
  }

  const clamped = {
    x: cx + dx * halfW,
    y: cy + dy * halfH
  }

  return {
    x: Math.max(minX, Math.min(maxX, snapRoomV2PlacementValue(clamped.x))),
    y: Math.max(minY, Math.min(maxY, snapRoomV2PlacementValue(clamped.y)))
  }
}

export function snapRoomV2PlacementValue(value: number): number {
  return Math.round(value / ROOM_V2_PLACEMENT_SNAP_STEP) *
    ROOM_V2_PLACEMENT_SNAP_STEP
}

/** How far (in half-tile cells) a floor piece may be nudged to keep its footprint on the floor. */
export const ROOM_V2_FLOOR_GRID_FIT_RINGS = 6

type FurnitureRenderItem = Extract<RoomV2RenderItem, { kind: "furniture" }>

/**
 * Floor pieces on a shell with a measured floor grid sit on grid cells. The
 * piece goes to `cell` (the cell under the finger or tap) or, when its
 * footprint would hang past the drawn floor there, to the nearest cell where
 * it does not. Blockers are not avoided: overlapping furniture stays where
 * the user put it and shows red. The candidate is built at exactly the
 * returned cell, so a preview, a ghost on that cell and the commit agree.
 */
export function fitRoomV2FloorGridPlacement(input: {
  shell: RoomShell | null | undefined
  cell: RoomV2FloorGridCell
  createCandidate: (point: { x: number; y: number }) => FurnitureRenderItem | null
}): { cell: RoomV2FloorGridCell; candidate: FurnitureRenderItem } | null {
  const grid = input.shell?.floorGrid
  if (!grid) return null
  const projection = getRoomV2FloorGridProjection(grid)
  const polygon = [...grid.outline]
  let first: { cell: RoomV2FloorGridCell; candidate: FurnitureRenderItem } | null = null
  for (const cell of getRoomV2FloorGridCellsNear(projection, input.cell, ROOM_V2_FLOOR_GRID_FIT_RINGS)) {
    const point = roundRoomV2FloorGridPoint(getRoomV2FloorGridCellPoint(projection, cell.column, cell.row))
    const candidate = input.createCandidate(point)
    if (!candidate) return null
    first ??= { cell, candidate }
    if (isRoomV2FurnitureFootprintOnFloor(candidate, polygon)) return { cell, candidate }
  }
  return first
}

/** The floor-grid cell nearest a stage point, or undefined when the shell has no grid. */
export function getRoomV2FloorGridCellForPoint(
  shell: RoomShell | null | undefined,
  point: { x: number; y: number }
): RoomV2FloorGridCell | undefined {
  if (!shell?.floorGrid) return undefined
  return snapRoomV2FloorGridCell(getRoomV2FloorGridProjection(shell.floorGrid), point.x, point.y)
}

function isFloorGridPlacement(
  item: Pick<FurnitureItem, "placementSurface"> | FurnitureRenderItem,
  shell: RoomShell | null | undefined
): boolean {
  return Boolean(shell?.floorGrid) && getRoomV2FurniturePlacementSurface(item) === "floor"
}

function createRoomV2CandidatePreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
}): PlacementPreview {
  const validation = validateRoomV2FurniturePlacement({
    scene: input.scene,
    candidate: input.candidate
  })
  return createRoomV2PlacementPreviewResult({
    copy: input.copy,
    scene: input.scene,
    candidate: input.candidate,
    placementIsValid: validation.isValid,
    placementFeedback: validation.isValid
      ? undefined
      : getRoomPlacementFeedback(validation.issueIds[0], input.copy),
    blockingRenderIds: validation.blockingRenderIds,
    supportingRenderIds: validation.supportingRenderIds
  })
}

/**
 * Stage drag/tap preview for the selected placed item at a normalized stage
 * point. Returns undefined when the selection is not a furniture render item.
 * On a floor grid, `floorCell` (from a drag) wins over `point`.
 */
export function createRoomEditorStagePlacementPreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  selectedInstanceId: string
  point: { x: number; y: number }
  floorCell?: RoomV2FloorGridCell
}): PlacementPreview | undefined {
  const { copy, scene, selectedInstanceId } = input
  const eventPoint = input.point
  const selectedItem = scene.renderItems.find((item) =>
    item.renderId === selectedInstanceId
  )
  if (!selectedItem || selectedItem.kind !== "furniture") return undefined

  const floorCell = isFloorGridPlacement(selectedItem, scene.shell)
    ? input.floorCell ?? getRoomV2FloorGridCellForPoint(scene.shell, eventPoint)
    : undefined
  if (floorCell) {
    const fitted = fitRoomV2FloorGridPlacement({
      shell: scene.shell,
      cell: floorCell,
      createCandidate: (point) => {
        const candidate = createRoomV2FurniturePlacementPreview({ item: selectedItem, x: point.x, y: point.y })
        return candidate.kind === "furniture" ? candidate : null
      }
    })
    if (!fitted) return undefined
    return createRoomV2CandidatePreview({ copy, scene, candidate: fitted.candidate })
  }

  const normalizedPoint = clampRoomV2PlacementPointForItem({
    x: eventPoint.x,
    y: eventPoint.y
  }, selectedItem, scene.shell, selectedItem.rotation)

  const candidate = createRoomV2FurniturePlacementPreview({
    item: selectedItem,
    x: normalizedPoint.x,
    y: normalizedPoint.y
  })
  const validation = validateRoomV2FurniturePlacement({
    scene,
    candidate
  })

  return createRoomV2PlacementPreviewResult({
    copy,
    scene,
    candidate,
    placementIsValid: validation.isValid,
    placementFeedback: validation.isValid
      ? undefined
      : getRoomPlacementFeedback(validation.issueIds[0], copy),
    blockingRenderIds: validation.blockingRenderIds,
    supportingRenderIds: validation.supportingRenderIds
  })
}

/**
 * Tray drag preview for a new inventory item at a window point. Returns
 * undefined until the stage is measured or while the pointer is off-stage.
 */
export function createRoomEditorTrayPlacementPreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  stageWindowBounds: StageWindowBounds | undefined
  item: FurnitureItem
  instanceId: string
  rotation: PlacedRoomItem["rotation"]
  pageX: number
  pageY: number
  floorCell?: RoomV2FloorGridCell
}): PlacementPreview | undefined {
  const { copy, scene, stageWindowBounds } = input
  if (
    !stageWindowBounds ||
    stageWindowBounds.width <= 0 ||
    stageWindowBounds.height <= 0
  ) {
    return undefined
  }
  const localX = input.pageX - stageWindowBounds.x
  const localY = input.pageY - stageWindowBounds.y
  const isInsideStage =
    localX >= 0 &&
    localX <= stageWindowBounds.width &&
    localY >= 0 &&
    localY <= stageWindowBounds.height

  if (!isInsideStage) {
    return undefined
  }

  const floorCell = isFloorGridPlacement(input.item, scene.shell)
    ? input.floorCell ?? getRoomV2FloorGridCellForPoint(scene.shell, {
      x: localX / stageWindowBounds.width,
      y: localY / stageWindowBounds.height
    })
    : undefined
  if (floorCell) {
    const fitted = fitRoomV2FloorGridPlacement({
      shell: scene.shell,
      cell: floorCell,
      createCandidate: (point) => resolvePlacedFurnitureRenderItem({
        instanceId: input.instanceId,
        itemId: input.item.id,
        x: point.x,
        y: point.y,
        rotation: input.rotation
      }, input.item)
    })
    if (!fitted) return undefined
    return createRoomV2CandidatePreview({ copy, scene, candidate: fitted.candidate })
  }

  const normalizedPoint = clampRoomV2PlacementPointForItem({
    x: localX / stageWindowBounds.width,
    y: localY / stageWindowBounds.height
  }, input.item, scene.shell, input.rotation)
  const placedItem: PlacedRoomItem = {
    instanceId: input.instanceId,
    itemId: input.item.id,
    x: normalizedPoint.x,
    y: normalizedPoint.y,
    rotation: input.rotation
  }
  const candidate = resolvePlacedFurnitureRenderItem(placedItem, input.item)
  if (!candidate) return undefined
  const validation = validateRoomV2FurniturePlacement({
    scene,
    candidate
  })

  return createRoomV2PlacementPreviewResult({
    copy,
    scene,
    candidate,
    placementIsValid: validation.isValid,
    placementFeedback: validation.isValid
      ? undefined
      : getRoomPlacementFeedback(validation.issueIds[0], copy),
    blockingRenderIds: validation.blockingRenderIds,
    supportingRenderIds: validation.supportingRenderIds
  })
}

/**
 * Persistable placed item for a valid furniture preview, with support metadata.
 * `item` is the preview's own furniture render item (`preview.item`, narrowed).
 */
export function createRoomEditorPlacedItemFromPreview(
  preview: PlacementPreview,
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>
): PlacedRoomItem {
  return {
    instanceId: item.renderId,
    itemId: item.itemId,
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    ...getRoomV2PlacedItemPersistenceMetadata({
      ...item,
      supportInstanceId: preview.supportingRenderIds?.[0],
      supportParentRotation: preview.supportParentRotation,
      supportLocalPosition: preview.supportLocalPosition
    })
  }
}
