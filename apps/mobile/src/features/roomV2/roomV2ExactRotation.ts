import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomV2FurnitureRenderItem,
  UserRoomDecor
} from "./roomV2.types"
import {
  resolvePlacedFurnitureRenderItem,
  validateRoomV2FurniturePlacement,
  type RoomV2PlacementValidationResult
} from "./roomV2Selectors"

export type RoomV2ExactRotationPreviewResult =
  | { status: "missing_selection" }
  | { status: "unsupported_rotation" }
  | { status: "unresolved_rotation" }
  | {
      status: "invalid_placement"
      candidate: RoomV2FurnitureRenderItem
      validation: RoomV2PlacementValidationResult
    }
  | {
      status: "ready"
      candidate: RoomV2FurnitureRenderItem
      validation: RoomV2PlacementValidationResult
    }

/**
 * Resolves one exact editor rotation without mutating the persisted draft.
 * The caller may commit only a `ready` result after any additional
 * whole-room/avatar-path validation required by its surface.
 */
export function resolveRoomV2ExactRotationPreview(input: {
  decor: UserRoomDecor
  scene: ResolvedRoomV2Scene
  furnitureCatalog: readonly FurnitureItem[]
  instanceId: string
  rotation: PlacedRoomItem["rotation"]
}): RoomV2ExactRotationPreviewResult {
  const placedItem = input.decor.placedItems.find(
    (item) => item.instanceId === input.instanceId
  )
  const furnitureItem = input.furnitureCatalog.find(
    (item) => item.id === placedItem?.itemId
  )
  if (!placedItem || !furnitureItem) {
    return { status: "missing_selection" }
  }

  const supportedRotations = furnitureItem.assetsByRotation
    ? Object.keys(furnitureItem.assetsByRotation) as PlacedRoomItem["rotation"][]
    : []
  if (!supportedRotations.includes(input.rotation)) {
    return { status: "unsupported_rotation" }
  }

  const candidate = resolvePlacedFurnitureRenderItem({
    ...placedItem,
    rotation: input.rotation
  }, furnitureItem)
  if (!candidate) {
    return { status: "unresolved_rotation" }
  }

  const validation = validateRoomV2FurniturePlacement({
    scene: input.scene,
    candidate
  })
  if (!validation.isValid) {
    return {
      status: "invalid_placement",
      candidate,
      validation
    }
  }

  return {
    status: "ready",
    candidate,
    validation
  }
}
