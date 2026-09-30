import { useCallback, useMemo, useRef } from "react"
import { PanResponder, type GestureResponderEvent } from "react-native"
import { hapticError, hapticLight, hapticSuccess } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { commitRoomV2PlacedItem } from "../roomV2DecorActions"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomV2RenderItem,
  UserRoomDecor
} from "../roomV2.types"
import {
  createRoomEditorPlacedItemFromPreview,
  createRoomEditorStagePlacementPreview,
  createRoomEditorTrayPlacementPreview,
  type PlacementPreview
} from "./roomEditorPlacementModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import type { RoomEditorSelection } from "./useRoomEditorSelection"
import type { RoomEditorSessionState } from "./useRoomEditorSession"
import type { RoomEditorStageLayout } from "./useRoomEditorStageLayout"

/**
 * Stage and tray placement gestures: tap-to-select, stage drag-to-move with a
 * live preview, and vertical tray drags that drop a new owned piece on stage.
 */
export function useRoomEditorPlacementGestures(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  placedItems: UserRoomDecor["placedItems"]
  setDraftDecor: RoomEditorSessionState["setDraftDecor"]
  canPlaceAnotherRoomItem: (itemId: string) => boolean
  selection: RoomEditorSelection
  stage: RoomEditorStageLayout
  inventory: Pick<
    RoomEditorInventoryState,
    "setSelectedInventoryItemId" | "setSelectedInventoryRotation"
  >
}) {
  const { copy, scene, placedItems, setDraftDecor, canPlaceAnotherRoomItem } = input
  const {
    selectedInstanceId,
    setSelectedInstanceId,
    setPlacementFeedback,
    setPlacementPreview,
    updatePlacementFeedback,
    updatePlacementPreview
  } = input.selection
  const { roomLayout, stageWindowBounds, measureStageWindow } = input.stage
  const { setSelectedInventoryItemId, setSelectedInventoryRotation } = input.inventory
  const trayDragInstanceIdRef = useRef<string | null>(null)

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
// eslint-disable-next-line react-hooks/exhaustive-deps -- `copy` is a per-locale constant; adding it would recreate the stage PanResponder on a runtime locale switch, which is not provably identical, so the original identity is kept.
  }, [selectedInstanceId, roomLayout.height, roomLayout.width, scene, stageWindowBounds])

  const createTrayPlacementPreview = useCallback((trayInput: {
    item: FurnitureItem
    instanceId: string
    rotation: PlacedRoomItem["rotation"]
    pageX: number
    pageY: number
  }): PlacementPreview | undefined => createRoomEditorTrayPlacementPreview({
    ...trayInput,
    copy,
    scene,
    stageWindowBounds
  }), [copy, scene, stageWindowBounds])

  const commitTrayPlacementPreview = useCallback((preview: PlacementPreview | undefined): boolean => {
    if (!preview || preview.item.kind !== "furniture" || !preview.isValid) {
      hapticError()
      updatePlacementFeedback(preview?.feedback ?? copy.feedback.chooseCompatibleSurface)
      updatePlacementPreview(preview)
      return false
    }

    const placedItem: PlacedRoomItem = createRoomEditorPlacedItemFromPreview(preview, preview.item)
    hapticSuccess()
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

  const stagePanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(selectedInstanceId),
      onMoveShouldSetPanResponder: () => Boolean(selectedInstanceId),
      onPanResponderGrant: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback)
        } else if (preview?.feedback) {
          updatePlacementFeedback(preview.feedback)
        }
      },
      onPanResponderMove: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback ?? copy.feedback.releaseToPlace)
        } else if (preview?.feedback) {
          updatePlacementFeedback(preview.feedback)
        }
      },
      onPanResponderRelease: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        updatePlacementFeedback(preview?.isValid
          ? copy.feedback.tapCheckToPlace
          : preview?.feedback
        )
      },
      onPanResponderTerminate: () => {
        updatePlacementPreview(undefined)
      }
    }),
    [copy.feedback.releaseToPlace, copy.feedback.tapCheckToPlace, createPlacementPreviewFromEvent, selectedInstanceId, updatePlacementFeedback, updatePlacementPreview]
  )

  const createInventoryItemPanHandlers = useCallback((
    item: FurnitureItem,
    owned: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        owned &&
        canPlaceAnotherRoomItem(item.id) &&
        Math.abs(gestureState.dy) > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: (_, gestureState) => {
        if (!owned) return
        if (!canPlaceAnotherRoomItem(item.id)) {
          hapticError()
          setPlacementFeedback(copy.feedback.alreadyPlaced)
          return
        }
        if (!stageWindowBounds) {
          measureStageWindow()
        }
        const instanceId = `${item.id}_${Date.now()}`
        trayDragInstanceIdRef.current = instanceId
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        setSelectedInstanceId(instanceId)
        updatePlacementPreview(preview)
        updatePlacementFeedback(preview?.isValid
          ? preview.feedback ?? copy.feedback.releaseToPlace
          : preview?.feedback ?? copy.feedback.chooseCompatibleSurface
        )
      },
      onPanResponderMove: (_, gestureState) => {
        const instanceId = trayDragInstanceIdRef.current
        if (!owned || !instanceId || !canPlaceAnotherRoomItem(item.id)) return
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback ?? copy.feedback.releaseToPlace)
        } else {
          updatePlacementFeedback(preview?.feedback ?? copy.feedback.chooseCompatibleSurface)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const instanceId = trayDragInstanceIdRef.current
        trayDragInstanceIdRef.current = null
        if (!owned || !instanceId || !canPlaceAnotherRoomItem(item.id)) {
          if (owned && instanceId) {
            setSelectedInstanceId(undefined)
            updatePlacementPreview(undefined)
            updatePlacementFeedback(copy.feedback.alreadyPlaced)
          }
          return
        }
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        if (!preview || !preview.isValid || preview.item.kind !== "furniture") {
          if (!commitTrayPlacementPreview(preview)) {
            setSelectedInstanceId(undefined)
          }
          return
        }
        setSelectedInstanceId(instanceId)
        updatePlacementPreview(preview)
        updatePlacementFeedback(copy.feedback.tapCheckToPlace)
        if (!preview) {
          setSelectedInstanceId(undefined)
        }
      },
      onPanResponderTerminate: () => {
        trayDragInstanceIdRef.current = null
        updatePlacementPreview(undefined)
        updatePlacementFeedback(undefined)
      }
    })
    return responder.panHandlers
  }, [
    canPlaceAnotherRoomItem,
    copy.feedback,
    createTrayPlacementPreview,
    measureStageWindow,
    stageWindowBounds,
    commitTrayPlacementPreview,
    setPlacementFeedback,
    setSelectedInstanceId,
    updatePlacementFeedback,
    updatePlacementPreview
  ])

  return {
    handleItemTap,
    commitTrayPlacementPreview,
    handleFloorTap,
    stagePanResponder,
    createInventoryItemPanHandlers
  }
}
