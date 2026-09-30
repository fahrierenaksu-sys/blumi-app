import { useCallback, useEffect, useRef, useState } from "react"
import { hapticError, hapticLight } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomV2PersistenceState } from "../roomV2EditGate"
import {
  applyRoomV2EditorDraft,
  createRoomV2EditorSession,
  resetRoomV2EditorSession,
  undoRoomV2EditorSession,
  updateRoomV2EditorPersistedBaseline
} from "../roomV2EditorSession"
import type { UserRoomDecor } from "../roomV2.types"
import type { RoomEditorSelection } from "./useRoomEditorSelection"

/**
 * Immutable editor session over RoomV2Provider decor: draft edits, hydration
 * once persisted decor is ready, confirmed-baseline sync, undo, and reset.
 * `editorSessionRef` mirrors the latest session for navigation listeners.
 */
export function useRoomEditorSession(input: {
  userRoomDecor: UserRoomDecor
  confirmedPersistedRoomDecor: UserRoomDecor | undefined
  persistenceState: RoomV2PersistenceState
  copy: MyRoomEditorCopy
  selection: Pick<
    RoomEditorSelection,
    "setSelectedInstanceId" | "setPlacementFeedback" | "setPlacementPreview"
  >
}) {
  const { userRoomDecor, confirmedPersistedRoomDecor, persistenceState, copy } = input
  const { setSelectedInstanceId, setPlacementFeedback, setPlacementPreview } = input.selection

  const [editorSession, setEditorSession] = useState(() =>
    createRoomV2EditorSession(userRoomDecor, confirmedPersistedRoomDecor)
  )
  const editorSessionRef = useRef(editorSession)
  const draftDecor = editorSession.draftDecor
  const setDraftDecor = useCallback((
    action: UserRoomDecor | ((current: UserRoomDecor) => UserRoomDecor)
  ): void => {
    setEditorSession((currentSession) => {
      const nextDecor = typeof action === "function"
        ? action(currentSession.draftDecor)
        : action
      const nextSession = applyRoomV2EditorDraft(currentSession, nextDecor)
      editorSessionRef.current = nextSession
      return nextSession
    })
  }, [])

  useEffect(() => {
    editorSessionRef.current = editorSession
  }, [editorSession])

  // The provider can already be ready when this route mounts. Avoid a false
  // loading frame and a second editor-session creation for the same snapshot.
  const hasHydratedDraft = useRef(persistenceState !== "loading")
  const isRoomDraftReady = persistenceState !== "loading" && hasHydratedDraft.current

  useEffect(() => {
    if (persistenceState === "loading" || hasHydratedDraft.current) return
    setEditorSession(createRoomV2EditorSession(
      userRoomDecor,
      confirmedPersistedRoomDecor
    ))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hasHydratedDraft.current = true
  }, [
    confirmedPersistedRoomDecor,
    persistenceState,
    userRoomDecor,
    setSelectedInstanceId,
    setPlacementFeedback,
    setPlacementPreview
  ])
  useEffect(() => {
    if (!hasHydratedDraft.current) return
    setEditorSession((current) => {
      const nextSession = updateRoomV2EditorPersistedBaseline(
        current,
        confirmedPersistedRoomDecor
      )
      editorSessionRef.current = nextSession
      return nextSession
    })
  }, [confirmedPersistedRoomDecor])

  const handleResetDraft = useCallback(() => {
    if (!editorSessionRef.current.canResetToPersistedBaseline) {
      hapticError()
      setPlacementFeedback(copy.feedback.saveBeforeReset)
      return
    }
    hapticLight()
    setEditorSession((current) => {
      const nextSession = resetRoomV2EditorSession(current)
      editorSessionRef.current = nextSession
      return nextSession
    })
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
  }, [copy.feedback.saveBeforeReset, setSelectedInstanceId, setPlacementFeedback, setPlacementPreview])

  const handleUndoDraft = useCallback(() => {
    if (!editorSessionRef.current.canUndo) return
    hapticLight()
    setEditorSession((current) => {
      const nextSession = undoRoomV2EditorSession(current)
      editorSessionRef.current = nextSession
      return nextSession
    })
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
  }, [setSelectedInstanceId, setPlacementFeedback, setPlacementPreview])

  return {
    editorSession,
    editorSessionRef,
    draftDecor,
    setDraftDecor,
    isRoomDraftReady,
    handleResetDraft,
    handleUndoDraft
  }
}

export type RoomEditorSessionState = ReturnType<typeof useRoomEditorSession>
