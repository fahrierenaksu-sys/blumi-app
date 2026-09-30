import { useCallback, useMemo } from "react"
import { hapticError, hapticLight, hapticSuccess } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import {
  commitRoomV2PlacedItem,
  selectRoomV2Shell
} from "../roomV2DecorActions"
import { hasMultipleRoomV2RotationOptions } from "../roomV2EditorPresentation"
import { resolveRoomV2ExactRotationPreview } from "../roomV2ExactRotation"
import type {
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  UserRoomDecor
} from "../roomV2.types"
import {
  patchRoomV2PlacedItem,
  removeRoomV2PlacedItem
} from "../state/RoomV2Provider"
import {
  ACTIVE_ROOM_FURNITURE_CATALOG,
  QA_OWNED_ROOM_ITEM_IDS
} from "./roomEditorCatalog"
import {
  createRoomV2PlacementPreviewResult,
  createValidDraftPlacement,
  getRoomPlacementFeedback,
  getRoomPlacementSurfaceDropFeedback,
  getRoomV2FurnitureRotationOptions
} from "./roomEditorPlacementModel"
import { getSelectedPlacedRotationOptions } from "./roomEditorPresentationModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import type { RoomEditorSelection } from "./useRoomEditorSelection"
import type { RoomEditorSessionState } from "./useRoomEditorSession"

/**
 * Draft edits for the selected piece and the tray: exact rotation, remove,
 * owned-only placement (server-hydrated when required), and shell choice.
 */
export function useRoomEditorItemActions(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  draftDecor: UserRoomDecor
  setDraftDecor: RoomEditorSessionState["setDraftDecor"]
  canPlaceAnotherRoomItem: (itemId: string) => boolean
  ownsRoomItem: (itemId: string) => boolean
  selection: RoomEditorSelection
  inventory: Pick<
    RoomEditorInventoryState,
    | "canPlaceInventoryItem"
    | "selectedInventoryEntry"
    | "selectedInventoryRotation"
    | "setSelectedInventoryRotation"
  >
}) {
  const {
    copy,
    scene,
    draftDecor,
    setDraftDecor,
    canPlaceAnotherRoomItem,
    ownsRoomItem
  } = input
  const {
    selectedInstanceId,
    setSelectedInstanceId,
    setPlacementFeedback,
    setPlacementPreview
  } = input.selection
  const {
    canPlaceInventoryItem,
    selectedInventoryEntry,
    selectedInventoryRotation,
    setSelectedInventoryRotation
  } = input.inventory

  const selectedPlacedRotationOptions = useMemo(() => getSelectedPlacedRotationOptions(
    draftDecor.placedItems,
    selectedInstanceId,
    ACTIVE_ROOM_FURNITURE_CATALOG
  ), [draftDecor.placedItems, selectedInstanceId])
  const canRotateSelectedPlacedItem = hasMultipleRoomV2RotationOptions(
    selectedPlacedRotationOptions
  )

  // `draftDecor` replaces the former `draftDecor.placedItems` dependency: the
  // scene memo is keyed on `draftDecor`, so `scene` already changes whenever
  // `draftDecor` does and the callback identity is recreated at the same moments.
  const applySelectedItemRotation = useCallback((rotation: PlacedRoomItem["rotation"]): boolean => {
    if (!selectedInstanceId) return false
    const exactRotation = resolveRoomV2ExactRotationPreview({
      decor: draftDecor,
      scene,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
      instanceId: selectedInstanceId,
      rotation
    })
    if (exactRotation.status === "missing_selection") {
      return false
    }
    if (exactRotation.status === "unsupported_rotation") {
      hapticError()
      setPlacementFeedback(copy.feedback.unsupportedDirection)
      setPlacementPreview(undefined)
      return false
    }
    if (exactRotation.status === "unresolved_rotation") {
      hapticError()
      setPlacementFeedback(copy.feedback.unavailableRotation)
      setPlacementPreview(undefined)
      return false
    }
    const { candidate, validation } = exactRotation
    const preview = createRoomV2PlacementPreviewResult({
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
    if (!preview.isValid) {
      hapticError()
      setPlacementFeedback(preview.feedback ?? copy.feedback.chooseClearSpot)
      setPlacementPreview(preview)
      return false
    }

    setDraftDecor(current => patchRoomV2PlacedItem(current, selectedInstanceId, { rotation }))
    setSelectedInventoryRotation(rotation)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hapticLight()
    return true
  }, [
    copy,
    draftDecor,
    selectedInstanceId,
    scene,
    setDraftDecor,
    setPlacementFeedback,
    setPlacementPreview,
    setSelectedInventoryRotation
  ])

  const handleRotate = useCallback(() => {
    if (!selectedInstanceId) return
    const placedItem = draftDecor.placedItems.find(
      (item) => item.instanceId === selectedInstanceId
    )
    const furnitureItem = ACTIVE_ROOM_FURNITURE_CATALOG.find(
      (item) => item.id === placedItem?.itemId
    )
    if (!placedItem || !furnitureItem) return

    const rotationOptions = getRoomV2FurnitureRotationOptions(furnitureItem)
    if (rotationOptions.length < 2) {
      hapticLight()
      return
    }
    const currentRotationIndex = Math.max(0, rotationOptions.indexOf(placedItem.rotation))
    const nextRotation = rotationOptions[(currentRotationIndex + 1) % rotationOptions.length]
    applySelectedItemRotation(nextRotation)
  }, [applySelectedItemRotation, draftDecor.placedItems, selectedInstanceId])

  const handleSelectInventoryRotation = useCallback((
    rotation: PlacedRoomItem["rotation"]
  ) => {
    if (!selectedInventoryEntry) return
    const selectedPlacedItem = draftDecor.placedItems.find(
      (item) => item.instanceId === selectedInstanceId
    )
    if (selectedPlacedItem?.itemId !== selectedInventoryEntry.item.id) {
      hapticLight()
      setSelectedInventoryRotation(rotation)
      return
    }
    applySelectedItemRotation(rotation)
  }, [
    applySelectedItemRotation,
    draftDecor.placedItems,
    selectedInstanceId,
    selectedInventoryEntry,
    setSelectedInventoryRotation
  ])

  const handleRemoveItem = useCallback(() => {
    if (!selectedInstanceId) return
    setDraftDecor(current => removeRoomV2PlacedItem(current, selectedInstanceId))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hapticSuccess()
  }, [
    selectedInstanceId,
    setDraftDecor,
    setSelectedInstanceId,
    setPlacementFeedback,
    setPlacementPreview
  ])

  const addDraftItem = useCallback((
    itemId: string,
    feedback: boolean,
    rotationOverride?: PlacedRoomItem["rotation"]
  ): boolean => {
    if (!canPlaceInventoryItem) {
      if (feedback) setPlacementFeedback(copy.feedback.roomStillLoading)
      return false
    }
    if (!ownsRoomItem(itemId) && !QA_OWNED_ROOM_ITEM_IDS.has(itemId)) {
      if (feedback) hapticError()
      return false
    }
    if (!canPlaceAnotherRoomItem(itemId)) {
      if (feedback) {
        hapticError()
        setPlacementFeedback(copy.feedback.alreadyPlaced)
      }
      return false
    }
    const item = ACTIVE_ROOM_FURNITURE_CATALOG.find((entry) => entry.id === itemId)
    if (!item) {
      if (feedback) hapticError()
      return false
    }
    const placedItem = createValidDraftPlacement({
      copy,
      item,
      scene,
      itemId,
      rotationOverride
    })
    if (!placedItem) {
      if (feedback) hapticError()
      setPlacementFeedback(getRoomPlacementSurfaceDropFeedback(item, copy))
      return false
    }
    if (feedback) hapticLight()
    setDraftDecor((current) => commitRoomV2PlacedItem(current, placedItem))
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    setSelectedInstanceId(placedItem.instanceId)
    return true
  }, [
    canPlaceAnotherRoomItem,
    canPlaceInventoryItem,
    copy,
    ownsRoomItem,
    scene,
    setDraftDecor,
    setPlacementFeedback,
    setPlacementPreview,
    setSelectedInstanceId
  ])

  const handleAddSelectedInventoryItem = useCallback(() => {
    if (!selectedInventoryEntry) return
    addDraftItem(
      selectedInventoryEntry.item.id,
      true,
      selectedInventoryRotation
    )
  }, [addDraftItem, selectedInventoryEntry, selectedInventoryRotation])

  const handleSelectRoomShell = useCallback((roomShellId: string): void => {
    hapticLight()
    setDraftDecor((current) => selectRoomV2Shell(current, roomShellId))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
  }, [setDraftDecor, setSelectedInstanceId, setPlacementFeedback, setPlacementPreview])

  return {
    canRotateSelectedPlacedItem,
    handleRotate,
    handleSelectInventoryRotation,
    handleRemoveItem,
    addDraftItem,
    handleAddSelectedInventoryItem,
    handleSelectRoomShell
  }
}
