import { useCallback, useState } from "react"
import {
  arePlacementPreviewsEqual,
  type PlacementPreview
} from "./roomEditorPlacementModel"

/**
 * Editor selection state shared by every placement path: the selected placed
 * instance, the header feedback line, and the live placement preview. The
 * `update*` setters skip renders when the value is unchanged (drag frames).
 */
export function useRoomEditorSelection() {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>()
  const [placementFeedback, setPlacementFeedback] = useState<string | undefined>()
  const [placementPreview, setPlacementPreview] = useState<PlacementPreview | undefined>()

  const updatePlacementFeedback = useCallback((nextFeedback: string | undefined) => {
    setPlacementFeedback((current) => current === nextFeedback ? current : nextFeedback)
  }, [])
  const updatePlacementPreview = useCallback((nextPreview: PlacementPreview | undefined) => {
    setPlacementPreview((current) =>
      arePlacementPreviewsEqual(current, nextPreview) ? current : nextPreview
    )
  }, [])

  return {
    selectedInstanceId,
    setSelectedInstanceId,
    placementFeedback,
    setPlacementFeedback,
    placementPreview,
    setPlacementPreview,
    updatePlacementFeedback,
    updatePlacementPreview
  }
}

export type RoomEditorSelection = ReturnType<typeof useRoomEditorSelection>
