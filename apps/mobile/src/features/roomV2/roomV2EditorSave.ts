import type {
  PlacedRoomItem,
  RoomV2FurnitureRenderItem,
  UserRoomDecor
} from "./roomV2.types"
import { commitRoomV2PlacedItem } from "./roomV2DecorActions"

interface RoomV2FurnitureSavePreview {
  isValid: boolean
  item: {
    kind: "furniture"
    renderId: string
    itemId: string
    x: number
    y: number
    rotation: PlacedRoomItem["rotation"]
    placementSurface?: PlacedRoomItem["placementSurface"]
    visualContract?: RoomV2FurnitureRenderItem["visualContract"]
    supportInstanceId?: string
    supportParentRotation?: PlacedRoomItem["supportParentRotation"]
    supportLocalPosition?: PlacedRoomItem["supportLocalPosition"]
  }
}

export type RoomV2EditorSaveDecision =
  | { status: "invalid_preview" }
  | { status: "ready"; decor: UserRoomDecor }

export function createRoomV2EditorSaveDecor(
  draftDecor: UserRoomDecor,
  preview: RoomV2FurnitureSavePreview | undefined
): RoomV2EditorSaveDecision {
  if (preview && !preview.isValid) {
    return { status: "invalid_preview" }
  }
  if (!preview) {
    return { status: "ready", decor: draftDecor }
  }
  return {
    status: "ready",
    decor: commitRoomV2PlacedItem(draftDecor, {
      instanceId: preview.item.renderId,
      itemId: preview.item.itemId,
      x: preview.item.x,
      y: preview.item.y,
      rotation: preview.item.rotation,
      ...getRoomV2PlacedItemPersistenceMetadata(preview.item)
    })
  }
}

export function getRoomV2PlacedItemPersistenceMetadata(
  item: Pick<
    RoomV2FurnitureRenderItem,
    "placementSurface" | "visualContract"
  > & {
    supportInstanceId?: string
    supportParentRotation?: PlacedRoomItem["supportParentRotation"]
    supportLocalPosition?: PlacedRoomItem["supportLocalPosition"]
  }
): Pick<
  PlacedRoomItem,
  "geometryVersion" | "placementSurface" | "supportInstanceId" |
  "supportParentRotation" | "supportLocalPosition"
> {
  const geometryVersion = item.visualContract
    ? `${item.visualContract.assetSetId}-v${item.visualContract.assetVersion}`
    : undefined
  return {
    ...(geometryVersion ? { geometryVersion } : {}),
    ...(item.placementSurface ? { placementSurface: item.placementSurface } : {}),
    ...(item.supportInstanceId ? { supportInstanceId: item.supportInstanceId } : {}),
    ...(item.supportParentRotation
      ? { supportParentRotation: item.supportParentRotation }
      : {}),
    ...(item.supportLocalPosition
      ? { supportLocalPosition: { ...item.supportLocalPosition } }
      : {})
  }
}
