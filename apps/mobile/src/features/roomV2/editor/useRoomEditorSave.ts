import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Alert } from "react-native"
import { goBackOrFallback } from "../../../navigation/rootNavigationModel"
import { hapticError, hapticLight, hapticSuccess } from "../../../ui/haptics"
import { getRoomWorldMotionReadinessSummary } from "../../roomWorld/roomWorldDiagnostics"
import { createRoomWorldGeometryFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { DEFAULT_ROOM_V2_SHELL_ID } from "../roomV2Catalog"
import { saveRoomV2EditorDraftConfirmed } from "../roomV2EditorConfirmedSave"
import { createRoomV2EditorSaveDecor } from "../roomV2EditorSave"
import type { RoomV2EditorSession } from "../roomV2EditorSession"
import {
  resolveRoomV2Scene,
  validateRoomV2DraftPlacements
} from "../roomV2Selectors"
import type { UserRoomDecor } from "../roomV2.types"
import type { useRoomV2 } from "../state/RoomV2Provider"
import {
  ACTIVE_ROOM_FURNITURE_CATALOG,
  ACTIVE_ROOM_SHELL_CATALOG,
  type MyRoomEditorNavigation
} from "./roomEditorCatalog"
import {
  EDIT_ROOM_AVATAR_SPAWN,
  getRoomPlacementFeedback
} from "./roomEditorPlacementModel"
import type { RoomEditorSelection } from "./useRoomEditorSelection"

/**
 * Confirmed save and exit: validates the draft (including the live preview and
 * avatar path), persists through RoomV2Provider, and guards unsaved exits with
 * a Stay / Discard / Save dialog that routes Save through the same validation.
 */
export function useRoomEditorSave(input: {
  navigation: MyRoomEditorNavigation
  copy: MyRoomEditorCopy
  draftDecor: UserRoomDecor
  isRoomDraftReady: boolean
  editorSessionRef: RefObject<RoomV2EditorSession>
  saveUserRoomDecorConfirmed: ReturnType<typeof useRoomV2>["saveUserRoomDecorConfirmed"]
  selection: Pick<
    RoomEditorSelection,
    "placementPreview" | "setPlacementPreview" | "setPlacementFeedback" | "setSelectedInstanceId"
  >
}) {
  const {
    navigation,
    copy,
    draftDecor,
    isRoomDraftReady,
    editorSessionRef,
    saveUserRoomDecorConfirmed
  } = input
  const {
    placementPreview,
    setPlacementPreview,
    setPlacementFeedback,
    setSelectedInstanceId
  } = input.selection
  const allowEditorExitRef = useRef(false)
  const pendingEditorExitActionRef = useRef<
    Parameters<typeof navigation.dispatch>[0] | undefined
  >(undefined)
  const [isSavingRoom, setIsSavingRoom] = useState(false)
  const isSavingRoomRef = useRef(false)

  const handleSave = useCallback(async (): Promise<void> => {
    const requestedExitAction = pendingEditorExitActionRef.current
    pendingEditorExitActionRef.current = undefined
    if (isSavingRoomRef.current) return
    if (!isRoomDraftReady) {
      hapticError()
      setPlacementFeedback(copy.feedback.roomStillLoading)
      return
    }
    const furniturePreview = placementPreview?.item.kind === "furniture"
      ? {
          isValid: placementPreview.isValid,
          item: {
            ...placementPreview.item,
            supportInstanceId: placementPreview.supportingRenderIds?.[0],
            supportParentRotation: placementPreview.supportParentRotation,
            supportLocalPosition: placementPreview.supportLocalPosition
          }
        }
      : undefined
    const saveDecision = createRoomV2EditorSaveDecor(draftDecor, furniturePreview)
    if (saveDecision.status === "invalid_preview") {
      hapticError()
      setPlacementFeedback(copy.feedback.moveHighlighted)
      return
    }
    const decorToSave = saveDecision.decor
    const sceneToSave = resolveRoomV2Scene({
      roomShellCatalog: ACTIVE_ROOM_SHELL_CATALOG,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
      decor: decorToSave,
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    const draftValidation = validateRoomV2DraftPlacements({
      scene: sceneToSave,
      decor: decorToSave,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG
    })
    const invalidDraftItem = draftValidation.invalidItems[0]
    if (invalidDraftItem) {
      hapticError()
      setSelectedInstanceId(invalidDraftItem.placedItem.instanceId)
      if (invalidDraftItem.renderItem) {
        setPlacementPreview({
          item: invalidDraftItem.renderItem,
          isValid: false,
          feedback: getRoomPlacementFeedback(invalidDraftItem.issueIds[0], copy),
          blockingRenderIds: invalidDraftItem.blockingRenderIds
        })
        setPlacementFeedback(copy.feedback.moveHighlighted)
      } else {
        setPlacementPreview(undefined)
        setPlacementFeedback(
          invalidDraftItem.issueIds[0] === "missing_catalog_item"
            ? copy.feedback.missingCatalogItem
            : copy.feedback.invalidCurrentRotation
        )
      }
      return
    }
    const roomWorldReadinessToSave = getRoomWorldMotionReadinessSummary({
      geometry: createRoomWorldGeometryFromRoomV2Scene(sceneToSave),
      spawn: EDIT_ROOM_AVATAR_SPAWN
    })
    if (roomWorldReadinessToSave.level === "blocked") {
      hapticError()
      setPlacementFeedback(copy.feedback.clearAvatarPath)
      return
    }
    isSavingRoomRef.current = true
    setIsSavingRoom(true)
    const confirmedSave = await saveRoomV2EditorDraftConfirmed(
      decorToSave,
      saveUserRoomDecorConfirmed
    )
    isSavingRoomRef.current = false
    setIsSavingRoom(false)
    if (confirmedSave.status !== "saved") {
      hapticError()
      setPlacementFeedback(confirmedSave.feedback)
      return
    }
    hapticSuccess()
    allowEditorExitRef.current = true
    if (requestedExitAction) {
      navigation.dispatch(requestedExitAction)
    } else {
      goBackOrFallback(navigation, () => navigation.replace("MyRoom"))
    }
  }, [
    draftDecor,
    copy,
    isRoomDraftReady,
    navigation,
    placementPreview,
    saveUserRoomDecorConfirmed,
    setPlacementPreview,
    setPlacementFeedback,
    setSelectedInstanceId
  ])

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (allowEditorExitRef.current) {
      allowEditorExitRef.current = false
      return
    }
    if (!editorSessionRef.current.isDirty) return

    event.preventDefault()
    Alert.alert(
      copy.unsavedDialog.title,
      copy.unsavedDialog.body,
      [
        {
          text: copy.unsavedDialog.stay,
          style: "cancel"
        },
        {
          text: copy.unsavedDialog.discard,
          style: "destructive",
          onPress: () => {
            allowEditorExitRef.current = true
            navigation.dispatch(event.data.action)
          }
        },
        {
          text: copy.save,
          onPress: () => {
            pendingEditorExitActionRef.current = event.data.action
            handleSave()
          }
        }
      ]
    )
  }), [copy, editorSessionRef, handleSave, navigation])

  const handleCancel = useCallback(() => {
    hapticLight()
    goBackOrFallback(navigation, () => navigation.replace("MyRoom"))
  }, [navigation])

  return {
    isSavingRoom,
    handleSave,
    handleCancel
  }
}
