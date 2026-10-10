import type { MyRoomEditorCopy } from "../myRoomCopy"
import {
  getRoomV2FloorGridCellPoint,
  getRoomV2FloorGridCellsNear,
  getRoomV2FloorGridProjection,
  roundRoomV2FloorGridPoint,
  snapRoomV2FloorGridCell
} from "../roomV2FloorGrid"
import { getRoomV2FurniturePlacementSurface } from "../roomV2PlacementSurface"
import {
  getRoomV2FurnitureRotationChoices,
  resolvePlacedFurnitureRenderItem,
  validateRoomV2FurniturePlacement
} from "../roomV2Selectors"
import type { FurnitureItem, PlacedRoomItem, ResolvedRoomV2Scene, UserRoomDecor } from "../roomV2.types"
import { createRoomV2PlacementPreviewResult, type PlacementPreview } from "./roomEditorPlacementModel"

/**
 * Turn with a nudge ("Odayı düzenle" Phase D, 2.5D room): when a floor piece's next rotation does not
 * fit where it stands (a wall, another piece, the avatar's path), it moves to the nearest floor cell where that
 * rotation fits, as in the Sims' "rotate around". Only a spot within ROOM_EDITOR_ROTATE_NUDGE_RINGS cells is
 * taken; past that the turn is refused as before. The result is an ordinary placement preview, committed by the
 * same path as a drop, so what the turn shows is what Save writes.
 */

/** How far (floor cells, half a tile each) a turn may move a piece to make room for itself. */
export const ROOM_EDITOR_ROTATE_NUDGE_RINGS = 2

export function findRoomEditorRotateNudge(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  decor: UserRoomDecor
  furnitureCatalog: readonly FurnitureItem[]
  instanceId: string
  rotation: PlacedRoomItem["rotation"]
}): PlacementPreview | null {
  const { copy, scene, rotation } = input
  const placedItem = input.decor.placedItems.find((item) => item.instanceId === input.instanceId)
  const furnitureItem = input.furnitureCatalog.find((item) => item.id === placedItem?.itemId)
  const grid = scene.shell?.floorGrid
  if (
    !placedItem || !furnitureItem || !grid ||
    getRoomV2FurniturePlacementSurface(furnitureItem) !== "floor" ||
    !getRoomV2FurnitureRotationChoices(furnitureItem).includes(rotation)
  ) {
    return null
  }
  const projection = getRoomV2FloorGridProjection(grid)
  const start = snapRoomV2FloorGridCell(projection, placedItem.x, placedItem.y)
  for (const cell of getRoomV2FloorGridCellsNear(projection, start, ROOM_EDITOR_ROTATE_NUDGE_RINGS)) {
    const point = roundRoomV2FloorGridPoint(getRoomV2FloorGridCellPoint(projection, cell.column, cell.row))
    // turning where it stands already failed
    if (point.x === placedItem.x && point.y === placedItem.y) continue
    const candidate = resolvePlacedFurnitureRenderItem({ ...placedItem, x: point.x, y: point.y, rotation }, furnitureItem)
    if (!candidate) continue
    const validation = validateRoomV2FurniturePlacement({ scene, candidate })
    if (!validation.isValid) continue
    const preview = createRoomV2PlacementPreviewResult({
      copy,
      scene,
      candidate,
      placementIsValid: true,
      supportingRenderIds: validation.supportingRenderIds
    })
    if (preview.isValid) return preview
  }
  return null
}
