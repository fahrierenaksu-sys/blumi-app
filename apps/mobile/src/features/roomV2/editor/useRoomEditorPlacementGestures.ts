import { useCallback } from "react"
import type { GestureResponderEvent } from "react-native"
import { hapticError, hapticLight } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { commitRoomV2PlacedItem } from "../roomV2DecorActions"
import type {
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomV2RenderItem,
  UserRoomDecor
} from "../roomV2.types"
import {
  createRoomEditorPlacedItemFromPreview,
  createRoomEditorStagePlacementPreview,
  type PlacementPreview
} from "./roomEditorPlacementModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import type { RoomEditorSelection } from "./useRoomEditorSelection"
import type { RoomEditorSessionState } from "./useRoomEditorSession"
import type { RoomEditorStageLayout } from "./useRoomEditorStageLayout"

/**
 * Tap placement on the stage: tap a piece to select it, tap the floor to
 * preview the selected piece there, and commit a valid preview (the confirm
 * control, and drag drops from useRoomEditorDragGestures).
 */
export function useRoomEditorPlacementGestures(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  placedItems: UserRoomDecor["placedItems"]
  setDraftDecor: RoomEditorSessionState["setDraftDecor"]
  selection: RoomEditorSelection
  stage: RoomEditorStageLayout
  inventory: Pick<
    RoomEditorInventoryState,
    "setSelectedInventoryItemId" | "setSelectedInventoryRotation"
  >
}) {
  const { copy, scene, placedItems, setDraftDecor } = input
  const {
    selectedInstanceId,
    setSelectedInstanceId,
    setPlacementFeedback,
    setPlacementPreview,
    updatePlacementFeedback,
    updatePlacementPreview
  } = input.selection
  const { roomLayout, stageWindowBounds } = input.stage
  const { setSelectedInventoryItemId, setSelectedInventoryRotation } = input.inventory

  const handleItemTap = useCallback((item: RoomV2RenderItem) => {
    if (item.kind !== "furniture") return
    const placedItem = placedItems.find((entry) => entry.instanceId === item.renderId)
    hapticLight()
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    setSelectedInstanceId(item.renderId)
    setSelectedInventoryItemId(placedItem?.itemId)
    setSelectedInventoryRotation(item.rotation)
  }, [
    placedItems,
    setPlacementFeedback,
    setPlacementPreview,
    setSelectedInstanceId,
    setSelectedInventoryItemId,
    setSelectedInventoryRotation
  ])

  const createPlacementPreviewFromEvent = useCallback((e: GestureResponderEvent): PlacementPreview | undefined => {
    if (!selectedInstanceId || roomLayout.width === 0 || roomLayout.height === 0) {
      return undefined
    }

    const { locationX, locationY, pageX, pageY } = e.nativeEvent
    const eventPoint = stageWindowBounds
      ? {
        x: (pageX - stageWindowBounds.x) / stageWindowBounds.width,
        y: (pageY - stageWindowBounds.y) / stageWindowBounds.height
      }
      : {
        x: locationX / roomLayout.width,
        y: locationY / roomLayout.height
      }
    return createRoomEditorStagePlacementPreview({
      copy,
      scene,
      selectedInstanceId,
      point: eventPoint
    })
  }, [copy, selectedInstanceId, roomLayout.height, roomLayout.width, scene, stageWindowBounds])

  const commitTrayPlacementPreview = useCallback((preview: PlacementPreview | undefined): boolean => {
    if (!preview || preview.item.kind !== "furniture" || !preview.isValid) {
      hapticError()
      updatePlacementFeedback(preview?.feedback ?? copy.feedback.chooseCompatibleSurface)
      updatePlacementPreview(preview)
      return false
    }

    const placedItem: PlacedRoomItem = createRoomEditorPlacedItemFromPreview(preview, preview.item)
    // Placing a piece is a light tap; success is kept for a real save (ROOM-10).
    hapticLight()
    setDraftDecor((current) => commitRoomV2PlacedItem(current, placedItem))
    setSelectedInstanceId(placedItem.instanceId)
    updatePlacementFeedback(undefined)
    updatePlacementPreview(undefined)
    return true
  }, [
    copy.feedback.chooseCompatibleSurface,
    setDraftDecor,
    setSelectedInstanceId,
    updatePlacementFeedback,
    updatePlacementPreview
  ])

  const handleFloorTap = useCallback((e: GestureResponderEvent) => {
    const preview = createPlacementPreviewFromEvent(e)
    updatePlacementPreview(preview)
    updatePlacementFeedback(preview?.isValid
      ? copy.feedback.tapCheckToPlace
      : preview?.feedback
    )
  }, [copy.feedback.tapCheckToPlace, createPlacementPreviewFromEvent, updatePlacementFeedback, updatePlacementPreview])

  return {
    handleItemTap,
    commitTrayPlacementPreview,
    handleFloorTap
  }
}
